/**
 * Signal Extractor — groups evidence packets into candidate signals.
 *
 * Grouping logic:
 * - Evidence packets share a query/topic → group into one candidate signal
 * - Computes volume, velocity, community spread, phrase frequency
 * - Does NOT score — that's the scorer's job
 */

function stableId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/**
 * Extract candidate signals from evidence packets.
 * Returns { signals: [], signalEvidence: Map<signalId, evidenceId[]> }
 */
export function extractSignals(evidencePackets, contextId) {
  // Group by query/topic
  const groups = new Map();

  for (const ep of evidencePackets) {
    const topics = safeParseJson(ep.topics, []);
    for (const topic of topics) {
      const key = stableId(topic);
      if (!key) continue;
      if (!groups.has(key)) {
        groups.set(key, { topic, key, packets: [] });
      }
      groups.get(key).packets.push(ep);
    }
  }

  // Convert groups to candidate signals
  const signals = [];
  const signalEvidence = new Map();
  let rank = 0;

  // Sort by packet count descending
  const sorted = [...groups.values()].sort((a, b) => b.packets.length - a.packets.length);

  for (const group of sorted) {
    if (group.packets.length < 1) continue;
    rank++;

    const signalId = "live:" + group.key;
    const packets = group.packets;

    // Compute metrics
    const communities = [...new Set(packets.map(p => p.community).filter(Boolean))];
    const authors = [...new Set(packets.map(p => p.author_ref).filter(Boolean))];
    const totalComments = packets.reduce((sum, p) => {
      const m = safeParseJson(p.metrics, {});
      return sum + (m.comments || 0);
    }, 0);
    const totalScore = packets.reduce((sum, p) => {
      const m = safeParseJson(p.metrics, {});
      return sum + (m.score || 0);
    }, 0);

    // Phrase extraction — simple word-pair frequency from titles and bodies
    const phrases = extractPhrases(packets);

    // Community spread
    const spread = communities.map(c => {
      const count = packets.filter(p => p.community === c).length;
      return [c, Math.round((count / packets.length) * 100)];
    }).sort((a, b) => b[1] - a[1]);

    // Determine status based on volume
    let status = "Watch";
    if (packets.length >= 6) status = "Growing";
    if (packets.length >= 10) status = "Emerging";

    // Confidence based on evidence breadth
    let confidence = "Low";
    if (packets.length >= 3 && communities.length >= 2) confidence = "Medium";
    if (packets.length >= 6 && communities.length >= 3 && authors.length >= 4) confidence = "High";

    // Bubble position — higher rank = upper-right quadrant
    const x = Math.min(780, 400 + Math.round(packets.length * 18 + communities.length * 30));
    const y = Math.max(60, 400 - Math.round(packets.length * 22 + totalComments * 0.3));
    const r = Math.max(16, Math.min(44, 16 + packets.length * 3));

    const signal = {
      id: signalId,
      context_id: contextId,
      rank,
      status,
      title: group.topic,
      growth: "+ live",
      tags: JSON.stringify(classifyTags(packets)),
      summary: buildSummary(group.topic, packets, communities),
      communities: JSON.stringify(communities),
      mentions: packets.length,
      comments: totalComments,
      confidence,
      volume: totalScore + totalComments,
      why: "This signal was extracted from live Reddit evidence. " +
        packets.length + " posts across " + communities.length + " communities with " +
        authors.length + " unique authors.",
      suggested_title: "Suggested action",
      suggested_sub: "Inspect evidence and enable additional sources for corroboration.",
      next_source: "Enable Google Search to validate whether conversation has turned into active discovery intent.",
      bubble_x: x,
      bubble_y: y,
      bubble_r: r,
    };

    signals.push(signal);
    signalEvidence.set(signalId, packets.map(p => p.id));

    // Attach phrases and spread for later insertion
    signal._phrases = phrases;
    signal._spread = spread;
  }

  return { signals, signalEvidence };
}

function safeParseJson(value, fallback) {
  if (typeof value === "object" && value !== null) return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function extractPhrases(packets) {
  const freq = new Map();
  for (const p of packets) {
    const text = ((p.title || "") + " " + (p.body || "")).toLowerCase();
    // Extract 2-3 word phrases
    const words = text.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = words[i] + " " + words[i + 1];
      freq.set(bigram, (freq.get(bigram) || 0) + 1);
      if (i < words.length - 2) {
        const trigram = bigram + " " + words[i + 2];
        freq.set(trigram, (freq.get(trigram) || 0) + 1);
      }
    }
  }

  // Filter stopword-heavy phrases and sort by frequency
  const stopwords = new Set(["the", "and", "for", "that", "this", "with", "are", "was", "has", "have", "but", "not", "you", "can", "any", "all", "from", "been", "will", "its"]);
  return [...freq.entries()]
    .filter(([phrase, count]) => {
      if (count < 2) return false;
      const words = phrase.split(" ");
      const meaningful = words.filter(w => !stopwords.has(w));
      return meaningful.length >= Math.ceil(words.length * 0.6);
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase, count]) => [phrase, count]);
}

function classifyTags(packets) {
  const text = packets.map(p => ((p.title || "") + " " + (p.body || "")).toLowerCase()).join(" ");
  const tags = [];

  // Simple keyword-based classification
  if (/alternative|switch|replace|instead of|better than|compared to/i.test(text)) tags.push("comparison");
  if (/frustrat|annoying|hate|terrible|worst|broken|expensive|overpriced/i.test(text)) tags.push("frustration");
  if (/need|want|looking for|is there|how do i|any tool|recommend/i.test(text)) tags.push("demand");
  if (/started using|switched to|workflow|integrated|set up|using .* daily/i.test(text)) tags.push("adoption");
  if (/hiring|budget|pricing|pay for|cost|revenue|jobs/i.test(text)) tags.push("economic");
  if (/everyone is|people are now|used to think|narrative|trend/i.test(text)) tags.push("narrative");

  if (!tags.length) tags.push("demand");
  return tags.slice(0, 3);
}

function buildSummary(topic, packets, communities) {
  const commStr = communities.slice(0, 3).join(", ");
  if (packets.length >= 5) {
    return "Active discussion around \"" + topic + "\" across " + commStr + " with " + packets.length + " posts showing repeated interest.";
  }
  return "Early evidence of interest in \"" + topic + "\" appearing in " + commStr + ".";
}
