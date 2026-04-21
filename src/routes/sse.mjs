/**
 * Server-Sent Events (SSE) — real-time push from server to UI.
 *
 * Endpoints:
 *   GET  /api/events       — SSE stream (UI connects on load)
 *   POST /api/toast        — push a toast message to all clients
 *   POST /api/report       — push an intelligence report (opens modal)
 *   POST /api/reload       — tell all clients to refresh data
 *
 * Usage from CLI/agent:
 *   curl -X POST localhost:3000/api/toast -H 'Content-Type: application/json' \
 *     -d '{"message": "Analyzing 6 threads...", "type": "info"}'
 *
 *   curl -X POST localhost:3000/api/report -H 'Content-Type: application/json' \
 *     -d '{"title": "Research Brief", "body": "## Thesis\n...", "format": "markdown"}'
 *
 *   curl -X POST localhost:3000/api/reload
 */

import { Router } from "express";

const router = Router();
const clients = new Set();

/**
 * Broadcast an event to all connected SSE clients.
 */
export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

// --- SSE connection endpoint ---
router.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send initial heartbeat
  res.write("event: connected\ndata: {}\n\n");

  clients.add(res);
  req.on("close", () => clients.delete(res));
});

// --- Push a toast message ---
router.post("/api/toast", (req, res) => {
  const { message, type } = req.body || {};
  if (!message) return res.status(400).json({ error: "message required" });

  broadcast("toast", { message, type: type || "info" });
  res.json({ ok: true, clients: clients.size });
});

// --- Push an intelligence report (opens modal) ---
router.post("/api/report", (req, res) => {
  const { title, body, format } = req.body || {};
  if (!body) return res.status(400).json({ error: "body required" });

  broadcast("report", {
    title: title || "Intelligence Report",
    body,
    format: format || "markdown",
    timestamp: new Date().toISOString(),
  });
  res.json({ ok: true, clients: clients.size });
});

// --- Trigger data reload ---
router.post("/api/reload", (req, res) => {
  broadcast("reload", { reason: req.body?.reason || "data updated" });
  res.json({ ok: true, clients: clients.size });
});

export { router as sseRouter };
