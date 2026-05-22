/**
 * Deep Research Service
 * Orchestrates multi-query search + content extraction for AI-grade research
 */
const { searchWeb, getInstantAnswer } = require('./duckduckgo');
const { scrapeMultiple } = require('./scraper');
const { sleep, truncate } = require('../utils/helpers');

/**
 * Expand a topic into multiple research sub-queries
 * Keeps the full query intact, adds natural variations (language-agnostic)
 */
const expandQueries = (topic) => {
  return [
    topic,                          // Exact query as-is
    `"${topic}"`,                   // Exact phrase in quotes
    `${topic} 2024 2025`,           // Recent results
    `${topic} wikipedia`,           // Encyclopedia result
    `${topic} pengertian OR definition OR meaning`, // Definition in any language
  ];
};

/**
 * Deduplicate results by URL
 */
const deduplicateByUrl = (results) => {
  const seen = new Set();
  return results.filter(({ url }) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
};

/**
 * Score results by relevance to topic
 */
const scoreResult = (result, topic) => {
  const topicWords = topic.toLowerCase().split(/\s+/);
  const text = `${result.title} ${result.snippet}`.toLowerCase();
  let score = 0;
  for (const word of topicWords) {
    if (text.includes(word)) score++;
  }
  return score;
};

/**
 * Deep Research: Multi-query search + scrape top pages
 * Designed to feed an AI model with rich, comprehensive context
 *
 * @param {string} topic - Research topic
 * @param {object} options
 * @param {number} options.maxResults - Max search results to collect (default: 10)
 * @param {number} options.maxScrape - Max pages to full-scrape (default: 5)
 * @param {boolean} options.scrapeContent - Whether to scrape page content (default: true)
 * @param {string} options.region
 */
const deepResearch = async (topic, options = {}) => {
  const {
    maxResults = 10,
    maxScrape = parseInt(process.env.MAX_SCRAPE_PAGES) || 5,
    scrapeContent = true,
    region = 'wt-wt',
  } = options;

  const startTime = Date.now();
  const queries = expandQueries(topic);
  const allResults = [];
  const queryResults = {};

  // Phase 1: Parallel multi-query search
  const searchPromises = queries.map(async (q) => {
    try {
      const res = await searchWeb(q, { region });
      queryResults[q] = res.results;
      allResults.push(...res.results);
    } catch (err) {
      queryResults[q] = [];
    }
  });

  await Promise.allSettled(searchPromises);

  // Phase 2: Get instant answer for the main topic
  const instantAnswer = await getInstantAnswer(topic).catch(() => null);

  // Phase 3: Deduplicate, score, and rank
  const deduplicated = deduplicateByUrl(allResults);
  const ranked = deduplicated
    .map((r) => ({ ...r, relevanceScore: scoreResult(r, topic) }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxResults);

  // Phase 4: Scrape top N pages for full content
  let scrapedPages = [];
  if (scrapeContent && ranked.length > 0) {
    const urlsToScrape = ranked
      .slice(0, maxScrape)
      .filter((r) => r.url && r.url.startsWith('http'))
      .map((r) => r.url);

    scrapedPages = await scrapeMultiple(urlsToScrape, {
      concurrency: 3,
      maxLength: 4000,
    });
  }

  const elapsed = Date.now() - startTime;

  // Phase 5: Build the research summary context for AI
  const contextForAI = buildAIContext({ topic, instantAnswer, ranked, scrapedPages });

  return {
    topic,
    queries,
    instantAnswer,
    searchResults: ranked,
    scrapedPages,
    aiContext: contextForAI,
    stats: {
      totalResultsFound: allResults.length,
      deduplicatedCount: deduplicated.length,
      rankedCount: ranked.length,
      pagesScraped: scrapedPages.filter((p) => p.success).length,
      elapsedMs: elapsed,
    },
  };
};

/**
 * Build a structured text context string optimal for AI model consumption
 */
const buildAIContext = ({ topic, instantAnswer, ranked, scrapedPages }) => {
  const lines = [];

  lines.push(`# Deep Research Report: "${topic}"`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  if (instantAnswer?.abstract) {
    lines.push('## Instant Answer / Summary');
    lines.push(instantAnswer.abstract);
    if (instantAnswer.abstractUrl) lines.push(`Source: ${instantAnswer.abstractUrl}`);
    lines.push('');
  }

  if (instantAnswer?.answer) {
    lines.push('## Direct Answer');
    lines.push(instantAnswer.answer);
    lines.push('');
  }

  if (ranked.length > 0) {
    lines.push('## Top Search Results');
    ranked.forEach((r, i) => {
      lines.push(`${i + 1}. **${r.title}**`);
      lines.push(`   URL: ${r.url}`);
      if (r.snippet) lines.push(`   Snippet: ${r.snippet}`);
      lines.push('');
    });
  }

  const successfulScrapes = scrapedPages.filter((p) => p.success);
  if (successfulScrapes.length > 0) {
    lines.push('## Full Page Content (Scraped)');
    successfulScrapes.forEach((page, i) => {
      lines.push(`### Source ${i + 1}: ${page.title || page.url}`);
      lines.push(`URL: ${page.url}`);
      if (page.metaDescription) lines.push(`Description: ${page.metaDescription}`);
      lines.push('');
      if (page.content) lines.push(page.content);
      lines.push('---');
      lines.push('');
    });
  }

  return lines.join('\n');
};

module.exports = { deepResearch, buildAIContext };
