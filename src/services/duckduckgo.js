/**
 * Search Service — Multi-Engine (Bing primary + SearXNG fallback)
 * Uses Bing scraping (no API key needed) as primary engine
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { cleanText, extractDomain, truncate } = require('../utils/helpers');

const DDG_INSTANT_URL = 'https://api.duckduckgo.com/';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Decode Bing redirect URL to actual URL
 */
const decodeBingUrl = (href) => {
  if (!href) return '';
  if (!href.includes('bing.com/ck/') && !href.includes('/ck/a?')) return href;
  try {
    const fullUrl = href.startsWith('http') ? href : 'https://www.bing.com' + href;
    const url = new URL(fullUrl);
    const target = url.searchParams.get('u');
    if (target) {
      const decoded = Buffer.from(target.slice(2), 'base64').toString('utf8').trim();
      if (decoded.startsWith('http')) return decoded;
    }
  } catch {}
  return href;
};

// Random delay to mimic human behavior
const randomDelay = () => new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

// Cookie jar for Bing session
let bingCookie = '';

/**
 * Search Bing (primary engine)
 */
const searchBing = async (query, options = {}) => {
  const { page = 1 } = options;
  const first = page > 1 ? (page - 1) * 10 + 1 : 1;

  await randomDelay();

  const reqHeaders = {
    ...HEADERS,
    'Referer': 'https://www.bing.com/',
    'Sec-Ch-Ua': '"Chromium";v="125", "Not.A/Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
  };
  if (bingCookie) reqHeaders['Cookie'] = bingCookie;

  const response = await axios.get('https://www.bing.com/search', {
    params: { q: query, first, count: 10, setlang: 'en', cc: 'US', mkt: 'en-US' },
    headers: reqHeaders,
    timeout: 15000,
    decompress: true,
    maxRedirects: 5,
  });

  // Save cookies for subsequent requests
  const setCookie = response.headers['set-cookie'];
  if (setCookie) {
    bingCookie = setCookie.map(c => c.split(';')[0]).join('; ');
  }

  const $ = cheerio.load(response.data);
  const results = [];

  $('li.b_algo').each(function() {
    const self = $(this);
    const a = self.find('h2 a').first();
    const title = cleanText(a.text());
    const rawUrl = a.attr('href') || '';
    const url = decodeBingUrl(rawUrl) || rawUrl;

    const snippet = cleanText(
      self.find('.b_caption p').first().text() ||
      self.find('.b_descript').first().text() ||
      self.find('p').first().text()
    );

    if (title && url && url.startsWith('http') && !url.includes('bing.com')) {
      results.push({
        title,
        url,
        domain: extractDomain(url),
        snippet: truncate(snippet, 400),
      });
    }
  });

  // If no results, try to detect CAPTCHA
  if (results.length === 0) {
    const pageTitle = $('title').text();
    console.log(`[Bing] 0 results. Page title: "${pageTitle}". HTML len: ${response.data.length}`);
  }

  return results;
};

/**
 * Search Bing News
 */
const searchBingNews = async (query, options = {}) => {
  const { data: html } = await axios.get('https://www.bing.com/news/search', {
    params: { q: query, format: 'html', setlang: 'en' },
    headers: HEADERS,
    timeout: 15000,
    decompress: true,
  });

  const $ = cheerio.load(html);
  const results = [];

  $('div.news-card, .newscard, article.news-card, [class*="newscard"]').each(function() {
    const self = $(this);
    const a = self.find('a[href^="http"]').first();
    const title = cleanText(self.find('[class*="title"], h3, h4').first().text() || a.text());
    const url = a.attr('href') || '';
    const snippet = cleanText(self.find('[class*="snippet"], [class*="desc"], p').first().text());
    const source = cleanText(self.find('[class*="source"], [class*="provider"]').first().text());

    if (title && url && url.startsWith('http')) {
      results.push({ title, url, domain: extractDomain(url), snippet: truncate(snippet, 300), source });
    }
  });

  // Fallback: try search result cards
  if (results.length === 0) {
    return searchBing(`${query} news`, options);
  }

  return results;
};

/**
 * Main searchWeb: Bing primary
 */
const searchWeb = async (query, options = {}) => {
  const { page = 1, region = 'wt-wt', safeSearch = 'moderate' } = options;

  try {
    const results = await searchBing(query, { page, region });
    return { results, query, page, engine: 'bing' };
  } catch (error) {
    throw new Error(`Search failed: ${error.message}`);
  }
};

/**
 * Get DuckDuckGo Instant Answer (still works fine — JSON API)
 */
const getInstantAnswer = async (query) => {
  try {
    const { data } = await axios.get(DDG_INSTANT_URL, {
      params: { q: query, format: 'json', no_redirect: 1, skip_disambig: 1 },
      headers: { 'User-Agent': HEADERS['User-Agent'] },
      timeout: 8000,
    });

    return {
      abstract: cleanText(data.Abstract),
      abstractSource: data.AbstractSource,
      abstractUrl: data.AbstractURL,
      answer: cleanText(data.Answer),
      answerType: data.AnswerType,
      definition: cleanText(data.Definition),
      definitionSource: data.DefinitionSource,
      infobox: data.Infobox?.content
        ? data.Infobox.content.slice(0, 5).map((item) => ({
            label: item.label,
            value: String(item.value),
          }))
        : [],
      relatedTopics: (data.RelatedTopics || [])
        .filter((t) => t.FirstURL)
        .slice(0, 5)
        .map((t) => ({ title: cleanText(t.Text), url: t.FirstURL })),
      type: data.Type,
    };
  } catch {
    return null;
  }
};

/**
 * Search News via Bing News
 */
const searchNews = async (query, options = {}) => {
  try {
    const results = await searchBingNews(query, options);
    return { results, query, engine: 'bing-news' };
  } catch (err) {
    // fallback: regular search with news context
    return searchWeb(`${query} news site:reuters.com OR site:bbc.com OR site:cnn.com`, options);
  }
};

module.exports = { searchWeb, getInstantAnswer, searchNews };
