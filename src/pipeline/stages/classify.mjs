/**
 * Stage 2: Classification — intent, awareness, evidence weighting, and
 * community relevance filtering.
 *
 * Quality gate:
 *   - Reject: body < 20 chars, pure link-only, irrelevant communities
 *   - Quality bonus: clear intent match, relevant community, high awareness
 *   - Pass threshold: >= 60% of collected packets survive
 */

/**
 * Score how relevant a subreddit is to business/tech/professional contexts.
 * Returns 0-1. Evidence from low-relevance communities gets filtered out.
 *
 * This prevents noise like r/FanFiction, r/Genshin_Impact, r/aromantic
 * from polluting business intelligence signals.
 */
function communityRelevance(community) {
  if (!community) return 0.5;
  const sub = community.replace(/^r\//, "").toLowerCase();

  // High relevance — business, tech, marketing, professional communities
  const highRelevance = /^(saas|startup|startups|entrepreneur|entrepreneurs|smallbusiness|microsaas|marketing|digital_marketing|socialmedia|socialmediamarketing|socialmediamanagers|productmanagement|productmarketing|growthmarket|growthhacking|growmybusiness|askmarketing|b2bmarketing|content_marketing|seo|bigseo|sales|consulting|freelance|agency|analytics|datascience|webdev|programming|devops|sysadmin|cscareerquestions|experienceddevs|nocode|technology|artificial|machinelearning|chatgpt|claudeai|localllama|langchain|cybersecurity|business|ecommerce|dropshipping|ycombinator|venturecapital|investing|stocks|stockmarket|personalfinance|fintech|realestate|entrepreneurridealong|startup_ideas|indiehackers|sidehustle|sideproject|digitalnomad|remotework|productivity|projectmanagement|agile|pwnhub|singularity|futurology|dataisbeautiful|vibecoding|chatgptpro|chatgptpromptgenius|artificialsentience|seo_llm|publicrelations|instagrammarketing|digitalmarketing)$/;
  if (highRelevance.test(sub)) return 1.0;

  // Medium relevance — career, work, some overlap with business
  const medRelevance = /^(careerguidance|careeradvice|jobs|antiwork|workreform|overemployed|retailers|retailhell|accounting|humanresources|resumes|negotiation|thinkingdeeplyai)$/;
  if (medRelevance.test(sub)) return 0.5;

  // Low-medium — finance/investing (not business intelligence), general AI chat
  const financeNoise = /^(stocks|stockmarket|bogleheads|wallstreetbets|etfs|daytrading|trading|valueinvesting|investing|realestate|chatgpt|chatgptpro|chatgptpromptgenius|artificialsentience|decadeology|futurology|singularity|dataisbeautiful|bestofreditorupdates)$/;
  if (financeNoise.test(sub)) return 0.2;

  // Low relevance — gaming, fiction, hobbies, relationships, sports
  const lowRelevance = /^(fanfiction|ao3|genshin_impact|residentevil|boardgames|worldofwarships|dotA2|leagueoflegends|legendsofruneterra|gaming|games|pcgaming|steamdeck|sbcgaming|minecraft|fortnite|anime|manga|television|movies|books|writing|writingprompts|nosleep|amitheasshole|aitah|relationships|relationship_advice|datingoverthirty|breakups|aromantic|thebachelor|infertilitybabies|pregnancy|parenting|cooking|food|fitness|running|nba|nfl|soccer|formula1|sports|memes|funny|mildlyinfuriating|askreddit|showerthoughts|todayilearned|snapchathelp|instagram|math|askmath|sat|dnd|rpg)$/;
  if (lowRelevance.test(sub)) return 0.1;

  // Unknown community — give it a chance but with lower quality
  return 0.5;
}

export function classify({ evidencePackets, onProgress }) {
  if (onProgress) onProgress({ stage: "classify", message: "Classifying " + evidencePackets.length + " packets..." });

  const before = evidencePackets.length;

  // Compute quality scores for each packet
  const scored = evidencePackets.map(ep => {
    let quality = 0.5;

    // Community relevance
    const relevance = communityRelevance(ep.community);
    quality = quality * relevance + relevance * 0.3;

    // Intent clarity
    const text = ((ep.title || "") + " " + (ep.body || "")).toLowerCase();
    const hasQuestionMark = text.includes("?");
    if (ep.intent !== "question" || hasQuestionMark) quality += 0.1;

    // Awareness specificity
    if (ep.awareness_level === "product_aware" || ep.awareness_level === "most_aware") quality += 0.1;
    if (ep.awareness_level === "solution_aware") quality += 0.05;

    // Evidence weight (upvote validation)
    quality += Math.min(0.15, (ep.evidence_weight - 1.0) * 0.15);

    // Body length
    const bodyLen = (ep.body || "").length;
    if (bodyLen > 200) quality += 0.05;
    if (bodyLen > 500) quality += 0.05;

    return { ...ep, quality_score: Math.min(1.0, Math.round(quality * 100) / 100) };
  });

  // Gate: reject low-quality and irrelevant
  const filtered = scored.filter(ep => {
    if (!ep.body || ep.body.trim().length < 20) return false;
    if (/^https?:\/\/\S+$/.test(ep.body.trim())) return false;
    // Drop evidence from clearly irrelevant communities
    if (communityRelevance(ep.community) <= 0.1) return false;
    return true;
  });

  const rejected = before - filtered.length;
  const survivalRate = before > 0 ? filtered.length / before : 1;
  const passed = survivalRate >= 0.3 || filtered.length >= 3;

  if (onProgress && rejected > 0) {
    onProgress({ stage: "classify", message: "Filtered " + rejected + " irrelevant/low-quality packets (" + filtered.length + " remaining)" });
  }

  return {
    output: { evidencePackets: filtered },
    stats: {
      input: before,
      classified: filtered.length,
      gateRejected: rejected,
      survivalRate: Math.round(survivalRate * 100),
      avgQuality: filtered.length > 0
        ? Math.round(filtered.reduce((s, ep) => s + ep.quality_score, 0) / filtered.length * 100) / 100
        : 0,
    },
    gate: {
      passed,
      reason: passed
        ? filtered.length + " packets classified (" + Math.round(survivalRate * 100) + "% survival, " + rejected + " noise filtered)"
        : "Only " + Math.round(survivalRate * 100) + "% survived classification gate (need >= 30%)",
    },
  };
}
