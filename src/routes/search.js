/**
 * Search Routes
 * GET /api/search        - Web search
 * GET /api/search/news   - News search
 * GET /api/search/instant - Instant answer
 */
const express = require('express');
const router = express.Router();
const { searchWeb, getInstantAnswer, searchNews } = require('../services/duckduckgo');
const { cacheMiddleware } = require('../middleware/cache');
const { buildResponse } = require('../utils/helpers');

/**
 * @route  GET /api/search
 * @desc   Web search via DuckDuckGo
 * @access Protected (API Key)
 * @query  q, page, region, safeSearch
 */
router.get('/', cacheMiddleware(5 * 60 * 1000), async (req, res) => {
  const { q, page = 1, region = 'wt-wt', safeSearch = 'moderate' } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json(buildResponse({
      success: false,
      error: 'Missing query parameter: q',
    }));
  }

  try {
    const [searchResult, instantAnswer] = await Promise.allSettled([
      searchWeb(q.trim(), { page: parseInt(page), region, safeSearch }),
      page == 1 ? getInstantAnswer(q.trim()) : Promise.resolve(null),
    ]);

    const results = searchResult.status === 'fulfilled' ? searchResult.value : { results: [], engine: 'unknown' };
    const instant = instantAnswer.status === 'fulfilled' ? instantAnswer.value : null;

    // Debug log
    console.log(`[Search] engine=${results.engine} results=${(results.results || []).length}`);

    res.json(buildResponse({
      data: {
        query: q,
        results: results.results || [],
        instantAnswer: instant,
        page: parseInt(page),
        engine: results.engine || 'bing',
      },
      meta: { resultCount: (results.results || []).length },
    }));
  } catch (error) {
    res.status(500).json(buildResponse({ success: false, error: error.message }));
  }
});

/**
 * @route  GET /api/search/news
 * @desc   News search
 * @access Protected (API Key)
 * @query  q, region
 */
router.get('/news', cacheMiddleware(3 * 60 * 1000), async (req, res) => {
  const { q, region = 'wt-wt' } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json(buildResponse({ success: false, error: 'Missing query parameter: q' }));
  }

  try {
    const result = await searchNews(q.trim(), { region });
    res.json(buildResponse({
      data: { query: q, results: result.results, engine: 'duckduckgo-news' },
      meta: { resultCount: result.results.length },
    }));
  } catch (error) {
    res.status(500).json(buildResponse({ success: false, error: error.message }));
  }
});

/**
 * @route  GET /api/search/instant
 * @desc   Get DuckDuckGo instant answer (summaries, definitions, facts)
 * @access Protected (API Key)
 * @query  q
 */
router.get('/instant', cacheMiddleware(10 * 60 * 1000), async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json(buildResponse({ success: false, error: 'Missing query parameter: q' }));
  }

  try {
    const result = await getInstantAnswer(q.trim());
    res.json(buildResponse({ data: result || { message: 'No instant answer found' } }));
  } catch (error) {
    res.status(500).json(buildResponse({ success: false, error: error.message }));
  }
});

/**
 * @route  GET /api/search/openwebui
 * @desc   Open WebUI / Ollama compatible web search endpoint
 * @access Protected (API Key via Authorization: Bearer or X-Api-Key)
 * @query  q     - Search query (required)
 * @query  count - Number of results (default: 5, max: 10)
 *
 * Response format follows Open WebUI external search spec:
 * { "results": [{ "title": "...", "url": "...", "content": "..." }] }
 *
 * Setup in Open WebUI:
 *   Web Search Engine   → external
 *   External Search URL → http://YOUR_SERVER:3004/api/search/openwebui
 *   API Key             → searchengine-dev-key-2024
 */
router.get('/openwebui', cacheMiddleware(5 * 60 * 1000), async (req, res) => {
  const { q, count = '5' } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }

  const limit = Math.min(parseInt(count) || 5, 10);

  try {
    const searchResult = await searchWeb(q.trim(), { page: 1 });
    const rawResults = (searchResult.results || []).slice(0, limit);

    // Map to Open WebUI format: { title, url, content }
    const results = rawResults.map((r) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.snippet || '',   // Open WebUI uses "content" not "snippet"
    }));

    console.log(`[OpenWebUI] q="${q}" → ${results.length} results`);

    // Return bare array format expected by Open WebUI (no wrapper)
    res.json({ results });

  } catch (error) {
    console.error('[OpenWebUI] Error:', error.message);
    res.status(500).json({ error: error.message, results: [] });
  }
});

module.exports = router;
