/**
 * Simple In-Memory Cache Middleware
 * Caches API responses to reduce redundant external requests
 */
const cache = new Map();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

const cacheMiddleware = (ttl = DEFAULT_TTL) => (req, res, next) => {
  const key = `${req.method}:${req.originalUrl}`;
  const cached = cache.get(key);

  if (cached && Date.now() < cached.expiresAt) {
    return res.json({ ...cached.data, cached: true });
  }

  // Intercept res.json to store result in cache
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    if (res.statusCode === 200) {
      cache.set(key, { data, expiresAt: Date.now() + ttl });
    }
    return originalJson(data);
  };

  next();
};

// Cleanup expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now >= value.expiresAt) cache.delete(key);
  }
}, 10 * 60 * 1000);

module.exports = { cacheMiddleware };
