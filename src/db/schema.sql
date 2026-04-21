-- Signals MVP schema

CREATE TABLE IF NOT EXISTS contexts (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  subreddits    TEXT,  -- JSON array
  queries       TEXT,  -- JSON array
  high_intent   TEXT,  -- JSON array
  thesis        TEXT,  -- Why are we looking? What do we expect to find?
  avatar        TEXT,  -- Who is the person experiencing this pain?
  research_passes TEXT, -- JSON {pass1: [...], pass2: [...], pass3: [...]}
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
  intent          TEXT,  -- pain, promotion, insight, question, comparison
  awareness_level TEXT,  -- unaware, problem_aware, solution_aware, product_aware, most_aware
  sentiment       TEXT,  -- positive, negative, neutral, mixed
  evidence_weight REAL DEFAULT 1.0,
  quality_score   REAL,
  pipeline_run_id TEXT
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
  awareness_distribution TEXT, -- JSON {problem_aware: N, ...}
  dominant_awareness     TEXT, -- most frequent awareness level
  desire_type     TEXT,        -- mass_instinct | mass_technological
  top_extractions TEXT,        -- JSON: top 5 deep extractions
  failed_solutions TEXT,       -- JSON: [{name, count, validation}]
  bubble_x        REAL,
  bubble_y        REAL,
  bubble_r        REAL,
  first_detected  TEXT,
  last_seen       TEXT,
  dismissed       INTEGER DEFAULT 0,
  saved           INTEGER DEFAULT 0,
  alerted         INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              TEXT PRIMARY KEY,
  context_id      TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  started_at      TEXT DEFAULT (datetime('now')),
  completed_at    TEXT,
  stage_results   TEXT,  -- JSON: per-stage stats
  quality_gates   TEXT,  -- JSON: per-stage pass/fail
  evidence_in     INTEGER,
  evidence_out    INTEGER,
  signals_produced INTEGER,
  status          TEXT DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS evidence_extractions (
  id              TEXT PRIMARY KEY,
  evidence_id     TEXT REFERENCES evidence_packets(id) ON DELETE CASCADE,
  extraction_type TEXT NOT NULL,  -- not_x_its_y, failed_solution, problem_language, identity_statement
  surface_text    TEXT,
  deeper_text     TEXT,
  confidence      REAL,
  upvotes         INTEGER,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- Thread reconstruction + intelligence
CREATE TABLE IF NOT EXISTS threads (
  id              TEXT PRIMARY KEY,
  context_id      TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  post_id         TEXT NOT NULL,
  community       TEXT,
  title           TEXT,
  url             TEXT,
  comment_count   INTEGER DEFAULT 0,
  total_score     INTEGER DEFAULT 0,
  weighted_evidence REAL DEFAULT 0,
  quality_tier    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS thread_packets (
  thread_id       TEXT REFERENCES threads(id) ON DELETE CASCADE,
  evidence_id     TEXT REFERENCES evidence_packets(id) ON DELETE CASCADE,
  position        INTEGER DEFAULT 0,
  PRIMARY KEY (thread_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS thread_intelligence (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT REFERENCES threads(id) ON DELETE CASCADE,
  context_id      TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  pain_language       TEXT,
  emotional_depth     TEXT,
  not_x_its_y        TEXT,
  failed_solutions    TEXT,
  awareness_level     TEXT,
  avatar_clues        TEXT,
  desire_type         TEXT,
  conversation_arc    TEXT,
  signal_quality      TEXT,
  key_insight         TEXT,
  confidence_tier     TEXT,
  model_used          TEXT,
  tokens_used         INTEGER,
  processing_ms       INTEGER,
  content_hash        TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- Signal cases: cross-community dedup
CREATE TABLE IF NOT EXISTS signal_cases (
  id              TEXT PRIMARY KEY,
  context_id      TEXT REFERENCES contexts(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT DEFAULT 'open',
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signal_case_members (
  case_id         TEXT REFERENCES signal_cases(id) ON DELETE CASCADE,
  signal_id       TEXT REFERENCES signals(id) ON DELETE CASCADE,
  PRIMARY KEY (case_id, signal_id)
);

-- Confidence reconciliation log
CREATE TABLE IF NOT EXISTS extraction_reconciliation (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT REFERENCES threads(id) ON DELETE CASCADE,
  extraction_type TEXT,
  regex_found     INTEGER,
  llm_found       INTEGER,
  confidence_tier TEXT,
  surface_text    TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

-- Intelligence chain: append-only graph of linked findings
CREATE TABLE IF NOT EXISTS intelligence_units (
  id                TEXT PRIMARY KEY,
  unit_type         TEXT NOT NULL,
  claim             TEXT NOT NULL,
  detail            TEXT,
  source_type       TEXT,
  source_id         TEXT,
  method            TEXT,
  parent_ids        TEXT,
  context_id        TEXT,
  signal_id         TEXT,
  community         TEXT,
  thread_id         TEXT,
  confidence        REAL DEFAULT 0.5,
  confidence_basis  TEXT,
  supporting_count  INTEGER DEFAULT 0,
  contradicting_count INTEGER DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now')),
  created_by        TEXT
);

CREATE TABLE IF NOT EXISTS intelligence_links (
  from_id   TEXT REFERENCES intelligence_units(id) ON DELETE CASCADE,
  to_id     TEXT REFERENCES intelligence_units(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL,
  weight    REAL DEFAULT 1.0,
  PRIMARY KEY (from_id, to_id)
);

-- Signal vocabulary: categorized language people use
CREATE TABLE IF NOT EXISTS signal_vocabulary (
  signal_id       TEXT REFERENCES signals(id) ON DELETE CASCADE,
  phrase          TEXT NOT NULL,
  category        TEXT NOT NULL,  -- pain | desire | moment | identity | temperature | metaphor | solution
  frequency       INTEGER DEFAULT 0,
  total_upvotes   INTEGER DEFAULT 0,
  example_quote   TEXT,
  example_url     TEXT,
  first_seen      TEXT,
  last_seen       TEXT,
  PRIMARY KEY (signal_id, phrase, category)
);

-- Signal facets: evidence-backed intelligence per tag per signal
CREATE TABLE IF NOT EXISTS signal_facets (
  signal_id       TEXT REFERENCES signals(id) ON DELETE CASCADE,
  tag             TEXT NOT NULL,
  evidence_count  INTEGER DEFAULT 0,
  thread_count    INTEGER DEFAULT 0,
  total_upvotes   INTEGER DEFAULT 0,
  quotes          TEXT,   -- JSON: [{quote, speaker, upvotes, community}]
  not_x_its_y     TEXT,   -- JSON: [{surface, deeper, confidence}]
  failed_solutions TEXT,  -- JSON: [{name, reason, upvotes, verdict}]
  avatar_clues    TEXT,   -- JSON: [{clue, evidence}]
  awareness_level TEXT,
  summary         TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (signal_id, tag)
);

CREATE TABLE IF NOT EXISTS research_briefs (
  id                TEXT PRIMARY KEY,
  context_id        TEXT REFERENCES contexts(id) ON DELETE SET NULL,
  mode              TEXT NOT NULL,  -- from_evidence | from_topic
  topic             TEXT NOT NULL,
  brief_content     TEXT NOT NULL,  -- full markdown output
  thesis            TEXT,
  avatar            TEXT,
  problem_language  TEXT,
  emotional_depth   TEXT,
  failed_solutions  TEXT,
  awareness_verdict TEXT,
  desire_type       TEXT,
  discovery_queries TEXT,
  evidence_count    INTEGER DEFAULT 0,
  community_count   INTEGER DEFAULT 0,
  model_used        TEXT,
  created_at        TEXT DEFAULT (datetime('now'))
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
