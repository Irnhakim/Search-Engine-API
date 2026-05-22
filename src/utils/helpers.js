/**
 * Utility Helper Functions
 */

/**
 * Clean and normalize text content from scraped HTML
 */
const cleanText = (text) => {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
};

/**
 * Extract domain from URL
 */
const extractDomain = (url) => {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * Truncate text to a given length
 */
const truncate = (text, maxLength = 300) => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
};

/**
 * Build a consistent API response
 */
const buildResponse = ({ success = true, data = null, error = null, meta = {} }) => ({
  success,
  ...(data !== null && { data }),
  ...(error && { error }),
  meta: {
    timestamp: new Date().toISOString(),
    ...meta,
  },
});

/**
 * Sleep/delay helper
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Shuffle array (Fisher-Yates)
 */
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

module.exports = { cleanText, extractDomain, truncate, buildResponse, sleep, shuffle };
