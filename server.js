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
const logStore = require('./src/utils/logStore');

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
// ─── Custom Logger (morgan + logStore) ─────────────────────────────
morgan.token('date', () => new Date().toLocaleTimeString('id-ID', { hour12: false }));
app.use(morgan((tokens, req, res) => {
  const method   = tokens.method(req, res);
  const url      = tokens.url(req, res);
  const status   = parseInt(tokens.status(req, res));
  const time     = parseFloat(tokens['response-time'](req, res)).toFixed(0);
  const ip       = req.ip || req.connection?.remoteAddress || '-';
  const now      = new Date().toLocaleTimeString('id-ID', { hour12: false });

  // Skip static assets from logs
  if (!url.startsWith('/api')) return null;
  // Skip the SSE stream endpoint itself to avoid feedback loop
  if (url.startsWith('/api/logs')) return null;

  // Detect auth method used
  let authType = '-';
  if (req.headers['authorization']?.startsWith('Bearer ')) authType = 'Bearer';
  else if (req.headers['x-api-key']) authType = 'X-Api-Key';
  else if (req.query.api_key) authType = 'query';

  // Save structured log entry to in-memory store & broadcast via SSE
  logStore.addLog({ method, url, status, time: parseInt(time), ip, authType });

  // Console output with colors
  const statusColor = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
  const reset = '\x1b[0m';
  const dim   = '\x1b[2m';
  return `${dim}[${now}]${reset} ${statusColor}${status}${reset} ${method} ${url} ${dim}| ip:${ip} auth:${authType} | ${time}ms${reset}`;
}));

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
          'GET /api/search/openwebui': { description: 'Open WebUI / Ollama compatible endpoint', params: 'q, count' },
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
      authentication: 'Supported: X-Api-Key header | Authorization: Bearer <key> | ?api_key= query param',
    },
  }));
});

// ─── Log Endpoints ─────────────────────────────────────────────────
// GET /api/logs  — last N log entries as JSON
app.get('/api/logs', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 200);
  res.json({ success: true, data: logStore.getLogs(limit), meta: { count: logStore.getLogs(limit).length, clients: logStore.clientCount() } });
});

// DELETE /api/logs — clear all logs
app.delete('/api/logs', authenticate, (req, res) => {
  logStore.clearLogs();
  res.json({ success: true, message: 'Logs cleared' });
});

// GET /api/logs/stream — SSE real-time log stream
app.get('/api/logs/stream', authenticate, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send existing logs on connect
  const recent = logStore.getLogs(50);
  res.write(`data: ${JSON.stringify({ type: 'init', logs: recent })}

`);

  // Keep-alive ping every 25s
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(ping); } }, 25000);

  logStore.addClient(res);
  req.on('close', () => { clearInterval(ping); logStore.removeClient(res); });
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
