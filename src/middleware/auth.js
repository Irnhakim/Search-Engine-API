/**
 * API Key Authentication Middleware
 * Supports multiple auth methods:
 *  - Header: X-Api-Key (NexSearch native)
 *  - Header: Authorization: Bearer KEY  (Open WebUI / Ollama compatible)
 *  - Query:  ?api_key=KEY
 *  - Body:   { api_key: KEY }
 */
const authenticate = (req, res, next) => {
  // Skip auth for the web UI routes (GET /)
  if (req.path === '/' || req.path.startsWith('/public')) {
    return next();
  }

  // Extract key from all supported methods
  let apiKey =
    req.headers['x-api-key'] ||
    req.query.api_key ||
    req.body?.api_key;

  // Support "Authorization: Bearer <key>" (used by Open WebUI / Ollama)
  if (!apiKey && req.headers['authorization']) {
    const auth = req.headers['authorization'];
    if (auth.startsWith('Bearer ')) {
      apiKey = auth.slice(7).trim();
    }
  }

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'API key is required. Use X-Api-Key header, Authorization: Bearer <key>, or api_key query param.',
    });
  }

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Invalid API key.',
    });
  }

  next();
};

module.exports = { authenticate };
