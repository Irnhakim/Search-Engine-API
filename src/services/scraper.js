/**
 * Web Scraper Service
 * Fetches and extracts readable content from a given URL
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { cleanText, truncate } = require('../utils/helpers');

const TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS) || 10000;

const BLOCKED_DOMAINS = [
  'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
  'facebook.com', 'instagram.com', 'tiktok.com',
];

const isBlockedDomain = (url) => {
  try {
    const { hostname } = new URL(url);
    return BLOCKED_DOMAINS.some((d) => hostname.includes(d));
  } catch {
    return false;
  }
};

/**
 * Scrape the readable content from a URL
 * @param {string} url - Target URL to scrape
 * @param {object} options - { maxLength }
 * @returns {object} - { title, content, url, domain, wordCount }
 */
const scrapeUrl = async (url, options = {}) => {
  const { maxLength = 5000 } = options;

  if (isBlockedDomain(url)) {
    throw new Error(`Scraping blocked for domain: ${new URL(url).hostname}`);
  }

  const { data: html } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    timeout: TIMEOUT,
    maxContentLength: 5 * 1024 * 1024, // 5MB max
  });

  const $ = cheerio.load(html);

  // Remove noise elements
  $('script, style, noscript, nav, footer, header, aside, .ad, .ads, .advertisement, [class*="popup"], [class*="cookie"], [id*="cookie"]').remove();

  const title = cleanText($('title').text() || $('h1').first().text());
  const metaDesc = $('meta[name="description"]').attr('content') || 
                   $('meta[property="og:description"]').attr('content') || '';

  // Try to get main content from semantic elements
  let content = '';
  const mainSelectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.entry-content', '.content', '#content'];
  
  for (const sel of mainSelectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 200) {
      content = cleanText(el.text());
      break;
    }
  }

  // Fallback to body
  if (!content || content.length < 100) {
    content = cleanText($('body').text());
  }

  // Extract all paragraph text for structured output
  const paragraphs = [];
  $('p').each((_, el) => {
    const text = cleanText($(el).text());
    if (text.length > 50) paragraphs.push(text);
  });

  // Extract headings
  const headings = [];
  $('h1, h2, h3').each((_, el) => {
    const text = cleanText($(el).text());
    if (text) headings.push({ tag: el.tagName, text });
  });

  // Extract links
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = cleanText($(el).text());
    if (href && href.startsWith('http') && text && text.length > 3) {
      links.push({ text, url: href });
    }
  });

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    title: truncate(title, 200),
    url,
    domain: new URL(url).hostname.replace(/^www\./, ''),
    metaDescription: truncate(cleanText(metaDesc), 300),
    content: truncate(content, maxLength),
    paragraphs: paragraphs.slice(0, 20).map((p) => truncate(p, 500)),
    headings: headings.slice(0, 20),
    links: links.slice(0, 30),
    wordCount,
    scrapedAt: new Date().toISOString(),
  };
};

/**
 * Scrape multiple URLs in parallel with concurrency limit
 * @param {string[]} urls
 * @param {object} options
 */
const scrapeMultiple = async (urls, options = {}) => {
  const { concurrency = 3, maxLength = 3000 } = options;
  const results = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((url) => scrapeUrl(url, { maxLength }))
    );

    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      if (result.status === 'fulfilled') {
        results.push({ success: true, ...result.value });
      } else {
        results.push({
          success: false,
          url: batch[j],
          error: result.reason?.message || 'Failed to scrape',
        });
      }
    }
  }

  return results;
};

module.exports = { scrapeUrl, scrapeMultiple };
