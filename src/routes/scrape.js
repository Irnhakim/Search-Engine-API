/**
 * Scrape Routes
 * POST /api/scrape       - Scrape a single URL
 * POST /api/scrape/batch - Scrape multiple URLs
 */
const express = require('express');
const router = express.Router();
const { scrapeUrl, scrapeMultiple } = require('../services/scraper');
const { buildResponse } = require('../utils/helpers');

/**
 * @route  POST /api/scrape
 * @desc   Extract content from a single URL
 * @access Protected (API Key)
 * @body   { url, maxLength }
 */
router.post('/', async (req, res) => {
  const { url, maxLength = 5000 } = req.body;

  if (!url) {
    return res.status(400).json(buildResponse({ success: false, error: 'Missing: url in request body' }));
  }

  try {
    new URL(url); // Validate URL
  } catch {
    return res.status(400).json(buildResponse({ success: false, error: 'Invalid URL format' }));
  }

  try {
    const result = await scrapeUrl(url, { maxLength: Math.min(parseInt(maxLength) || 5000, 20000) });
    res.json(buildResponse({ data: result }));
  } catch (error) {
    res.status(500).json(buildResponse({ success: false, error: error.message }));
  }
});

/**
 * @route  POST /api/scrape/batch
 * @desc   Extract content from multiple URLs in parallel
 * @access Protected (API Key)
 * @body   { urls: string[], maxLength, concurrency }
 */
router.post('/batch', async (req, res) => {
  const { urls, maxLength = 3000, concurrency = 3 } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json(buildResponse({ success: false, error: 'Missing or invalid: urls array in request body' }));
  }

  if (urls.length > 20) {
    return res.status(400).json(buildResponse({ success: false, error: 'Maximum 20 URLs per batch request' }));
  }

  try {
    const results = await scrapeMultiple(urls, {
      concurrency: Math.min(parseInt(concurrency) || 3, 5),
      maxLength: Math.min(parseInt(maxLength) || 3000, 10000),
    });

    res.json(buildResponse({
      data: results,
      meta: {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    }));
  } catch (error) {
    res.status(500).json(buildResponse({ success: false, error: error.message }));
  }
});

module.exports = router;
