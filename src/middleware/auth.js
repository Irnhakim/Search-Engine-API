/**
 * API Key Authentication Middleware
 * Checks for valid API key in header, query param, or body
 */
const authenticate = (req, res, next) => {
  // Skip auth for the web UI routes (GET /)
  if (req.path === '/' || req.path.startsWith('/public')) {
    return next();
  }

  const apiKey = 
    req.headers['x-api-key'] || 
    req.query.api_key || 
    req.body?.api_key;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'API key is required. Pass it via X-Api-Key header or api_key query param.',
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
