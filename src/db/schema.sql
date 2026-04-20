-- Signals MVP schema

CREATE TABLE IF NOT EXISTS contexts (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  subreddits    TEXT,  -- JSON array
  queries       TEXT,  -- JSON array
  high_intent   TEXT,  -- JSON array
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evidence_packets (
  id              TEXT PRIMARY KEY,
  context_id      TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  source_id       TEXT NOT NULL,
  source_layer    TEXT,
  source_item_id  TEXT,
  url             TEXT,
  title           TEXT,
  body            TEXT,
  author_ref      TEXT,
  community       TEXT,
  observed_at     TEXT,
  published_at    TEXT,
  metrics         TEXT,  -- JSON {score, comments, upvote_ratio}
  topics          TEXT,  -- JSON array
  raw_ref         TEXT,
  content_hash    TEXT,
  intent          TEXT   -- pain, promotion, insight, question, comparison
);

CREATE TABLE IF NOT EXISTS signals (
  id              TEXT PRIMARY KEY,
  context_id      TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  rank            INTEGER,
  status          TEXT,
  title           TEXT NOT NULL,
  growth          TEXT,
  tags            TEXT,      -- JSON array
  summary         TEXT,
  communities     TEXT,      -- JSON array
  mentions        INTEGER,
  comments        INTEGER,
  confidence      TEXT,
  volume          INTEGER,
  why             TEXT,
  suggested_title TEXT,
  suggested_sub   TEXT,
  next_source     TEXT,
  dominant_intent TEXT,  -- pain, promotion, insight, question, comparison
  intent_mix      TEXT,  -- JSON {pain: N, promotion: N, ...}
  bubble_x        REAL,
  bubble_y        REAL,
  bubble_r        REAL,
  first_detected  TEXT,
  last_seen       TEXT,
  dismissed       INTEGER DEFAULT 0,
  saved           INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signal_evidence (
  signal_id    TEXT REFERENCES signals(id) ON DELETE CASCADE,
  evidence_id  TEXT REFERENCES evidence_packets(id) ON DELETE CASCADE,
  PRIMARY KEY (signal_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS signal_phrases (
  signal_id TEXT REFERENCES signals(id) ON DELETE CASCADE,
  phrase    TEXT,
  count     INTEGER
);

CREATE TABLE IF NOT EXISTS signal_spread (
  signal_id   TEXT REFERENCES signals(id) ON DELETE CASCADE,
  community   TEXT,
  percentage  INTEGER
);

CREATE TABLE IF NOT EXISTS signal_related (
  signal_id   TEXT REFERENCES signals(id) ON DELETE CASCADE,
  label       TEXT,
  tag         TEXT,
  score       TEXT
);

CREATE TABLE IF NOT EXISTS source_nodes (
  id          TEXT PRIMARY KEY,
  context_id  TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  state       TEXT DEFAULT 'available',
  layers      TEXT,    -- JSON array
  lift        INTEGER,
  adds        TEXT,
  cannot      TEXT
);

CREATE TABLE IF NOT EXISTS evidence_layers (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  note        TEXT,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scoring_runs (
  id         TEXT PRIMARY KEY,
  signal_id  TEXT REFERENCES signals(id) ON DELETE CASCADE,
  run_at     TEXT DEFAULT (datetime('now')),
  components TEXT,  -- JSON array of [label, value]
  total      INTEGER
);

CREATE TABLE IF NOT EXISTS timeline_snapshots (
  context_id    TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  snapshot_date TEXT,
  posts         INTEGER,
  comments      INTEGER,
  authors       INTEGER,
  PRIMARY KEY (context_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS fixture_meta (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  context_id    TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  crumbs        TEXT,
  period        TEXT,
  topic_count   INTEGER,
  selected_id   TEXT,
  other_bubbles TEXT,  -- JSON array
  metrics       TEXT,  -- JSON array
  timeline      TEXT,  -- JSON {posts, comments, authors}
  heatmap       TEXT,  -- JSON array
  intent        TEXT   -- JSON array
);
