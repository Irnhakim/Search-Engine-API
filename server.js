/**
 * Search Engine API - Main Server
 * Express.js backend with search, scrape, and deep research endpoints
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { authenticate } = require('./src/middleware/auth');
const searchRoutes = require('./src/routes/search');
const scrapeRoutes = require('./src/routes/scrape');
const researchRoutes = require('./src/routes/research');
const { buildResponse } = require('./src/utils/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Middleware ──────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow inline scripts in UI
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Api-Key', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ─── Rate Limiting ──────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: buildResponse({ success: false, error: 'Too many requests. Please slow down.' }),
});
app.use('/api', limiter);

// ─── Static Web UI ─────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ────────────────────────────────────────────────────
app.use('/api/search', authenticate, searchRoutes);
app.use('/api/scrape', authenticate, scrapeRoutes);
app.use('/api/research', authenticate, researchRoutes);

// ─── API Info Endpoint ─────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json(buildResponse({
    data: {
      name: 'Search Engine API',
      version: '1.0.0',
      description: 'A powerful search + scraping + deep research API for AI models',
      endpoints: {
        search: {
          'GET /api/search': { description: 'Web search', params: 'q, page, region, safeSearch' },
          'GET /api/search/news': { description: 'News search', params: 'q, region' },
          'GET /api/search/instant': { description: 'Instant answer / definition', params: 'q' },
        },
        scrape: {
          'POST /api/scrape': { description: 'Scrape content from a URL', body: '{ url, maxLength }' },
          'POST /api/scrape/batch': { description: 'Scrape multiple URLs', body: '{ urls[], maxLength, concurrency }' },
        },
        research: {
          'POST /api/research': {
            description: 'Deep research: multi-query search + content scraping + AI context',
            body: '{ topic, maxResults, maxScrape, scrapeContent, region }',
          },
          'GET /api/research': { description: 'Deep research via GET', params: 'topic, maxResults, maxScrape' },
        },
      },
      authentication: 'Pass API key via X-Api-Key header or ?api_key= query param',
    },
  }));
});

// ─── Catch-All → Serve Web UI ──────────────────────────────────────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json(buildResponse({ success: false, error: 'Internal server error' }));
});

// ─── Start Server ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Search Engine API running at http://localhost:${PORT}`);
  console.log(`📖 API Docs: http://localhost:${PORT}/api`);
  console.log(`🔑 API Key: ${process.env.API_KEY}`);
  console.log(`🌐 Web UI: http://localhost:${PORT}\n`);
});

module.exports = app;
