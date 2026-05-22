/**
 * Log Store — In-memory circular buffer + SSE broadcaster
 * Stores last MAX_LOGS API request logs and streams them to connected clients.
 */

const MAX_LOGS = 200;
const logs = [];          // Newest first
const sseClients = new Set(); // Connected EventSource clients

/**
 * Add a log entry and broadcast to all connected SSE clients
 */
const addLog = (entry) => {
  const log = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    time: new Date().toLocaleTimeString('id-ID', { hour12: false }),
    ...entry,
  };

  logs.unshift(log);            // Prepend (newest first)
  if (logs.length > MAX_LOGS) logs.pop();

  // Broadcast to all connected SSE clients
  const payload = `data: ${JSON.stringify(log)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { sseClients.delete(res); }
  }

  return log;
};

/** Get recent logs (default newest 100) */
const getLogs = (limit = 100) => logs.slice(0, limit);

/** Clear all logs */
const clearLogs = () => { logs.length = 0; };

/** Register an SSE response object */
const addClient = (res) => sseClients.add(res);

/** Remove an SSE client when connection closes */
const removeClient = (res) => sseClients.delete(res);

/** Number of currently connected SSE clients */
const clientCount = () => sseClients.size;

module.exports = { addLog, getLogs, clearLogs, addClient, removeClient, clientCount };
