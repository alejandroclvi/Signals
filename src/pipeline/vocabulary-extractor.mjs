/**
 * Vocabulary Extractor — extracts and categorizes the specific language
 * people use to describe pain, desires, solutions, and identity.
 *
 * Categories:
 *   pain      — how they describe the experience ("flying blind", "drowning in noise")
 *   desire    — what they want ("early warning", "stay ahead", "see around corners")
 *   moment    — specific WHEN it hits ("found out from a customer", "board meeting with nothing")
 *   identity  — who they are ("as a founder", "in my role as PM")
 *   temperature — intensity markers ("nightmare", "game-changer", "no-brainer")
 *   metaphor  — analogies/framing ("expensive RSS feed", "what Buffer does but for X")
 *   solution  — named tools/approaches ("Brandwatch", "Google Alerts", "manual scrolling")
 *
 * Runs on existing evidence packets — no LLM calls.
 * Ranks by community validation (upvotes × frequency).
 */

import { getDb } from "../db/connection.mjs";

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// --- Category detection patterns ---

// Words within 8 tokens of these markers → pain category
const PAIN_MARKERS = /\b(frustrat|annoying|hate|terrible|worst|broken|struggling|drowning|stuck|nightmare|headache|painful|sucks?|useless|garbage|waste|exhausting|impossible|ridiculous)\b/i;

// Words near these → desire category
const DESIRE_MARKERS = /\b(need|want|wish|looking for|searching for|hoping|dream|ideal|perfect|better way|easier way|if only|imagine if)\b/i;

// Phrases containing temporal markers → moment language
const MOMENT_PATTERNS = [
  /(?:every (?:time|day|week|morning|monday) (?:i|we|they) )([\w\s]{10,60})/gi,
  /(?:the moment (?:i|we) )([\w\s]{10,50})/gi,
  /(?:found out )([\w\s]{10,60})/gi,
  /(?:woke up (?:to|and) )([\w\s]{10,50})/gi,
  /(?:got (?:a |an )?(?:call|email|message|slack|notification) (?:about |from |saying ))([\w\s]{10,60})/gi,
  /(?:in the middle of )([\w\s]{10,50})/gi,
  /(?:right (?:before|after|when) )([\w\s]{10,50})/gi,
  /(?:was (?:about to|in the middle of|presenting|pitching|demoing) )([\w\s]{10,50})/gi,
];

// Identity patterns
const IDENTITY_PATTERNS = [
  /(?:as a |being a |as an )([\w\s]{5,40})(?:,|\.| i )/gi,
  /(?:in my role as (?:a |an )?)([\w\s]{5,30})/gi,
  /(?:i'?m (?:a |an |the ))([\w\s]{5,30})(?:who|that|and| at )/gi,
  /(?:(?:we|my team|our company) (?:is|are) (?:a |an )?)([\w\s]{5,40})(?:that|who|and)/gi,
];

// Temperature words (rated by heat)
const TEMPERATURE_HOT = /\b(nightmare|desperate|drowning|killing me|losing sleep|career ending|existential|make or break|bleeding money|hemorrhaging)\b/i;
const TEMPERATURE_WARM = /\b(frustrating|annoying|painful|exhausting|maddening|infuriating|unacceptable|ridiculous|insane)\b/i;
const TEMPERATURE_COOL = /\b(inconvenient|tedious|suboptimal|lacking|mediocre|disappointing|underwhelming|clunky)\b/i;
const TEMPERATURE_POSITIVE = /\b(game.changer|life.changing|no.brainer|incredible|amazing|revolutionary|finally|breakthrough|holy grail)\b/i;

// Metaphor/analogy patterns
const METAPHOR_PATTERNS = [
  /(?:it'?s (?:basically |essentially |like )(?:a |an )?)([\w\s]{5,50})(?:but|except|without)/gi,
  /(?:(?:imagine|picture|think of) (?:if |what )?)([\w\s]{10,60})(?:but|except|that)/gi,
  /(?:what )([\w\s]{5,30})(?: does for )([\w\s]{5,20})(?: but for )([\w\s]{5,20})/gi,
  /(?:like (?:a |an )?)([\w\s]{5,40})(?: (?:on steroids|on crack|but worse|but better|meets|plus))/gi,
  /(?:expensive |glorified |fancy |overpriced )([\w\s]{3,30})/gi,
];

// Solution/tool detection — capitalized words near tool-related context
const SOLUTION_CONTEXT = /\b(tried|used|tested|switched|from|to|vs|alternative|replaced|dropped|cancelled|paying for|subscribed)\b/i;

/**
 * Extract vocabulary from evidence packets for a signal.
 * Returns categorized phrases ranked by validation.
 */
export function extractVocabulary(packets) {
  const vocab = new Map(); // key = category:phrase → {category, phrase, frequency, upvotes, examples}

  for (const packet of packets) {
    const text = ((packet.title || "") + " " + (packet.body || "")).trim();
    if (!text || text.length < 20) continue;

    const metrics = safeParseJson(packet.metrics, {});
    const upvotes = metrics.score || 0;
    const lowerText = text.toLowerCase();

    // --- Pain phrases ---
    if (PAIN_MARKERS.test(text)) {
      const painPhrases = extractNearbyPhrases(lowerText, PAIN_MARKERS, 8);
      for (const phrase of painPhrases) {
        addVocab(vocab, "pain", phrase, upvotes, text, packet.url);
      }
    }

    // --- Desire phrases ---
    if (DESIRE_MARKERS.test(text)) {
      const desirePhrases = extractNearbyPhrases(lowerText, DESIRE_MARKERS, 8);
      for (const phrase of desirePhrases) {
        addVocab(vocab, "desire", phrase, upvotes, text, packet.url);
      }
    }

    // --- Moment language ---
    for (const pattern of MOMENT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const phrase = cleanPhrase(match[1]);
        if (phrase && phrase.split(/\s+/).length >= 3) {
          addVocab(vocab, "moment", phrase, upvotes, text, packet.url);
        }
      }
    }

    // --- Identity language ---
    for (const pattern of IDENTITY_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const phrase = cleanPhrase(match[1]);
        if (phrase && phrase.length > 4) {
          addVocab(vocab, "identity", phrase, upvotes, text, packet.url);
        }
      }
    }

    // --- Temperature words ---
    const tempMatch = text.match(TEMPERATURE_HOT);
    if (tempMatch) addVocab(vocab, "temperature", tempMatch[0].toLowerCase(), upvotes, text, packet.url);
    else {
      const warmMatch = text.match(TEMPERATURE_WARM);
      if (warmMatch) addVocab(vocab, "temperature", warmMatch[0].toLowerCase(), upvotes, text, packet.url);
      else {
        const coolMatch = text.match(TEMPERATURE_COOL);
        if (coolMatch) addVocab(vocab, "temperature", coolMatch[0].toLowerCase(), upvotes, text, packet.url);
      }
    }
    const posMatch = text.match(TEMPERATURE_POSITIVE);
    if (posMatch) addVocab(vocab, "temperature", posMatch[0].toLowerCase(), upvotes, text, packet.url);

    // --- Metaphors ---
    for (const pattern of METAPHOR_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const phrase = cleanPhrase(match[0]);
        if (phrase && phrase.split(/\s+/).length >= 3) {
          addVocab(vocab, "metaphor", phrase, upvotes, text, packet.url);
        }
      }
    }

    // --- Solution references ---
    if (SOLUTION_CONTEXT.test(text)) {
      const solutions = extractSolutionNames(text);
      for (const name of solutions) {
        addVocab(vocab, "solution", name, upvotes, text, packet.url);
      }
    }
  }

  return vocab;
}

function addVocab(map, category, phrase, upvotes, fullText, url) {
  const key = category + ":" + phrase.toLowerCase().trim();
  if (!map.has(key)) {
    // Find best quote containing this phrase
    const quote = extractQuoteContaining(fullText, phrase, 120);
    map.set(key, {
      category,
      phrase: phrase.trim(),
      frequency: 0,
      totalUpvotes: 0,
      exampleQuote: quote,
      exampleUrl: url || null,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    });
  }
  const entry = map.get(key);
  entry.frequency++;
  entry.totalUpvotes += upvotes;
  entry.lastSeen = new Date().toISOString();
  // Update example if this evidence has higher upvotes
  if (upvotes > 0) {
    const newQuote = extractQuoteContaining(fullText, phrase, 120);
    if (newQuote) entry.exampleQuote = newQuote;
    if (url) entry.exampleUrl = url;
  }
}

/**
 * Extract meaningful n-grams near a marker pattern.
 * Tighter window (4 tokens instead of 8) to reduce noise.
 * Prefers 3-4 word phrases over bigrams.
 */
function extractNearbyPhrases(text, markerRegex, windowSize) {
  const phrases = [];
  const words = text.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    // Find marker word positions (narrow context window)
    const window = words.slice(Math.max(0, i - 2), i + 3).join(" ");
    if (!markerRegex.test(window)) continue;

    // Extract 3-4 word phrases first (higher quality), then 2-word as fallback
    const tightWindow = Math.min(windowSize, 4);
    for (let len = 4; len >= 2; len--) {
      for (let start = Math.max(0, i - tightWindow); start <= Math.min(words.length - len, i + tightWindow); start++) {
        const phrase = words.slice(start, start + len).join(" ");
        const cleaned = cleanPhrase(phrase);
        if (cleaned && isQualityPhrase(cleaned) && !isMarkerOnly(cleaned, markerRegex)) {
          phrases.push(cleaned);
        }
      }
    }
  }

  return [...new Set(phrases)].slice(0, 3); // Tighter cap — quality over quantity
}

/**
 * Extract named solutions from text (capitalized words near solution context).
 */
function extractSolutionNames(text) {
  const solutions = [];

  // Capitalized multi-word names (e.g., "Google Alerts", "Sprout Social")
  const multiWord = text.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g) || [];
  for (const name of multiWord) {
    if (name.length > 3 && name.length < 40 && !SKIP_NAMES.has(name.toLowerCase())) {
      solutions.push(name);
    }
  }

  // Single capitalized words near solution verbs (e.g., "tried Brandwatch")
  const singleCap = text.match(/(?:tried|used|tested|switched from|dropped|cancelled|paying for)\s+([A-Z][a-zA-Z]+(?:\.(?:io|ai|com|co))?)/g) || [];
  for (const match of singleCap) {
    const name = match.replace(/^(?:tried|used|tested|switched from|dropped|cancelled|paying for)\s+/, "").trim();
    if (name.length > 2 && name.length < 30 && !SKIP_NAMES.has(name.toLowerCase())) {
      solutions.push(name);
    }
  }

  return [...new Set(solutions)];
}

const SKIP_NAMES = new Set([
  "the", "this", "that", "reddit", "google", "facebook", "twitter", "linkedin",
  "but", "and", "not", "for", "with", "from", "also", "just", "its",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
]);

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "are", "was", "has", "have",
  "but", "not", "you", "can", "any", "all", "from", "been", "will", "its",
  "they", "their", "them", "than", "what", "when", "where", "which", "who",
  "how", "why", "did", "does", "just", "like", "also", "really", "very",
  "much", "even", "still", "about", "into", "more", "most", "some", "only",
  "get", "got", "one", "out", "now", "new", "use", "used", "know", "think",
  "want", "need", "see", "say", "said", "come", "going", "thing", "things",
  "people", "right", "good", "time", "lot", "way", "make", "take",
]);

function cleanPhrase(phrase) {
  if (!phrase) return null;
  return phrase.toLowerCase().replace(/[^a-z0-9\s'-]/g, "").replace(/\s+/g, " ").trim();
}

function isQualityPhrase(phrase) {
  if (!phrase || phrase.length < 7) return false;
  const words = phrase.split(/\s+/);
  if (words.length < 2) return false;
  // At least 60% meaningful words (non-stopword, > 2 chars)
  const meaningful = words.filter(w => !STOPWORDS.has(w) && w.length > 2);
  if (meaningful.length < Math.ceil(words.length * 0.6)) return false;
  // Reject phrases that are just common word pairs
  if (words.length === 2 && COMMON_BIGRAMS.has(phrase)) return false;
  return true;
}

/** Reject phrases that consist only of the marker word itself */
function isMarkerOnly(phrase, markerRegex) {
  const words = phrase.split(/\s+/);
  const nonMarker = words.filter(w => !markerRegex.test(w) && !STOPWORDS.has(w) && w.length > 2);
  return nonMarker.length === 0;
}

const COMMON_BIGRAMS = new Set([
  "don't know", "can't find", "looking for", "trying to", "want to",
  "need to", "used to", "going to", "have to", "able to",
  "supposed to", "hard to", "easy to", "seems like", "feels like",
  "kind of", "sort of", "lot of", "end up", "turned out",
]);

function extractQuoteContaining(text, phrase, maxLen) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(phrase.toLowerCase());
  if (idx === -1) return text.slice(0, maxLen);
  // Expand to sentence boundaries
  let start = Math.max(0, lower.lastIndexOf(".", idx - 1) + 1);
  let end = lower.indexOf(".", idx + phrase.length);
  if (end === -1) end = Math.min(text.length, idx + phrase.length + 60);
  else end = Math.min(end + 1, text.length);
  const quote = text.slice(start, end).trim();
  return quote.length > maxLen ? quote.slice(0, maxLen) + "\u2026" : quote;
}

/**
 * Synthesize vocabulary for all signals in a context.
 * Stores in signal_vocabulary table.
 */
export function synthesizeVocabulary(contextId) {
  const db = getDb();

  const signals = db.prepare(
    "SELECT id, tags FROM signals WHERE context_id = ? AND dismissed = 0"
  ).all(contextId);

  if (signals.length === 0) return 0;

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO signal_vocabulary
    (signal_id, phrase, category, frequency, total_upvotes, example_quote, example_url, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;

  const run = db.transaction(() => {
    // Clear old vocabulary for this context's signals
    for (const signal of signals) {
      db.prepare("DELETE FROM signal_vocabulary WHERE signal_id = ?").run(signal.id);
    }

    for (const signal of signals) {
      const packets = db.prepare(`
        SELECT ep.* FROM evidence_packets ep
        JOIN signal_evidence se ON se.evidence_id = ep.id
        WHERE se.signal_id = ?
      `).all(signal.id);

      if (packets.length === 0) continue;

      const vocab = extractVocabulary(packets);

      // Store top entries per category
      const byCategory = new Map();
      for (const entry of vocab.values()) {
        if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
        byCategory.get(entry.category).push(entry);
      }

      for (const [category, entries] of byCategory) {
        // Filter: require frequency >= 2 for pain/desire (noisy categories)
        const minFreq = (category === "pain" || category === "desire") ? 2 : 1;
        // Rank by validation score: frequency × 10 + upvotes
        const ranked = entries
          .filter(e => e.frequency >= minFreq)
          .sort((a, b) => (b.frequency * 10 + b.totalUpvotes) - (a.frequency * 10 + a.totalUpvotes))
          .slice(0, 12); // Top 12 per category (tighter)

        for (const entry of ranked) {
          upsert.run(
            signal.id, entry.phrase, entry.category,
            entry.frequency, entry.totalUpvotes,
            entry.exampleQuote, entry.exampleUrl,
            entry.firstSeen, entry.lastSeen
          );
          count++;
        }
      }
    }
  });

  run();
  return count;
}
