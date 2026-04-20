import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import apiRouter from "./routes/api.mjs";
import pageRouter from "./routes/pages.mjs";

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
app.use(apiRouter);
app.use(pageRouter);

// Error handling
app.use((err, req, res, next) => {
  console.error("[error]", err.message || err);
  if (req.path.startsWith("/api/")) {
    res.status(500).json({ error: "Internal server error" });
  } else {
    res.status(500).send("Something went wrong. Check the server logs.");
  }
});

app.listen(PORT, () => {
  console.log(`Signals running at http://localhost:${PORT}`);
});
