import "./lib/env.mjs";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import apiRouter from "./routes/api.mjs";
import pageRouter from "./routes/pages.mjs";
import { sseRouter, broadcast } from "./routes/sse.mjs";
import { getDb } from "./db/connection.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// JSON body parsing
app.use(express.json());

// Routes
app.use(sseRouter);
app.use(apiRouter);
app.use(pageRouter);

// Error handling — return actionable hints when the cause is recognizable.
app.use((err, req, res, next) => {
  console.error("[error]", err.message || err);
  const hint = inferErrorHint(err);
  if (req.path.startsWith("/api/")) {
    res.status(500).json({ error: err.message || "Internal server error", hint });
  } else {
    res.status(500).send(`Something went wrong. ${hint || "Check the server logs."}`);
  }
});

function inferErrorHint(err) {
  const msg = String(err?.message || "");
  if (/no such table/i.test(msg))                     return "Run `pnpm migrate` to apply schema.";
  if (/SQLITE_CANTOPEN/i.test(msg))                   return "Run `pnpm setup` to create data/signals.db.";
  if (/OPENROUTER_API_KEY/i.test(msg))                return "Set OPENROUTER_API_KEY in .env (see .env.example).";
  if (/ECONNREFUSED.*7687/.test(msg))                 return "Neo4j is not running. Optional — graph scoring will fall back.";
  if (/EADDRINUSE/.test(msg))                         return `Port ${PORT} in use. Set PORT=<n> and retry.`;
  return null;
}

const server = app.listen(PORT, () => {
  printStartupBanner();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n⚠ Port ${PORT} is already in use.`);
    console.error(`  Try:  PORT=3737 pnpm dev   (or any free port)\n`);
    process.exit(1);
  }
  throw err;
});

function printStartupBanner() {
  console.log(`\nSignals running at  http://localhost:${PORT}\n`);

  // Topic count
  try {
    const db = getDb();
    const n = db.prepare("SELECT COUNT(*) c FROM contexts").get().c;
    const top = db.prepare("SELECT id, label FROM contexts ORDER BY updated_at DESC LIMIT 1").get();
    if (n === 0) {
      console.log("  · No topics yet. Run `pnpm seed:all` (or `pnpm setup`).");
    } else {
      console.log(`  · ${n} topic${n === 1 ? "" : "s"} loaded${top ? `; most recent: ${top.label}` : ""}.`);
      if (top) console.log(`  · Open: http://localhost:${PORT}/?context=${encodeURIComponent(top.id)}`);
    }
  } catch (e) {
    console.log(`  ⚠ Database not ready: ${e.message}`);
    console.log("    Run `pnpm setup` to create and seed the database.");
  }

  // Env warnings
  if (!process.env.OPENROUTER_API_KEY) {
    console.log("  ⚠ OPENROUTER_API_KEY not set. LLM features (classify, thread-intel, briefs, unify) will fail.");
    console.log("    Copy .env.example to .env and paste your key.");
  }

  console.log("");
}
