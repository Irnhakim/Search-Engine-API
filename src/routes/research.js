/**
 * Deep Research Routes
 * POST /api/research - Full deep research pipeline
 */
const express = require('express');
const router = express.Router();
const { deepResearch } = require('../services/research');
const { buildResponse } = require('../utils/helpers');

/**
 * @route  POST /api/research
 * @desc   Deep research on a topic: multi-query search + page scraping + AI-ready context
 * @access Protected (API Key)
 * @body   {
 *   topic: string,        // Research topic (required)
 *   maxResults: number,   // Max search results (default: 10, max: 30)
 *   maxScrape: number,    // Max pages to scrape (default: 5, max: 10)
 *   scrapeContent: bool,  // Whether to scrape page content (default: true)
 *   region: string,       // Search region (default: 'wt-wt')
 * }
 */
router.post('/', async (req, res) => {
  const {
    topic,
    maxResults = 10,
    maxScrape = 5,
    scrapeContent = true,
    region = 'wt-wt',
  } = req.body;

  if (!topic || topic.trim().length === 0) {
    return res.status(400).json(buildResponse({
      success: false,
      error: 'Missing required field: topic',
    }));
  }

  if (topic.trim().length > 500) {
    return res.status(400).json(buildResponse({
      success: false,
      error: 'Topic is too long. Maximum 500 characters.',
    }));
  }

  try {
    const result = await deepResearch(topic.trim(), {
      maxResults: Math.min(parseInt(maxResults) || 10, 30),
      maxScrape: Math.min(parseInt(maxScrape) || 5, 10),
      scrapeContent: scrapeContent !== false,
      region,
    });

    res.json(buildResponse({
      data: result,
      meta: result.stats,
    }));
  } catch (error) {
    res.status(500).json(buildResponse({ success: false, error: error.message }));
  }
});

/**
 * @route  GET /api/research
 * @desc   Deep research via GET (for quick testing)
 * @access Protected (API Key)
 * @query  topic, maxResults, maxScrape, scrapeContent, region
 */
router.get('/', async (req, res) => {
  const {
    topic,
    maxResults = 10,
    maxScrape = 3,
    scrapeContent = 'true',
    region = 'wt-wt',
  } = req.query;

  if (!topic) {
    return res.status(400).json(buildResponse({ success: false, error: 'Missing query parameter: topic' }));
  }

  try {
    const result = await deepResearch(topic.trim(), {
      maxResults: Math.min(parseInt(maxResults) || 10, 20),
      maxScrape: Math.min(parseInt(maxScrape) || 3, 5),
      scrapeContent: scrapeContent !== 'false',
      region,
    });

    res.json(buildResponse({
      data: result,
      meta: result.stats,
    }));
  } catch (error) {
    res.status(500).json(buildResponse({ success: false, error: error.message }));
  }
});

module.exports = router;
