/**
 * Community relevance scoring — shared between classify stage and thread intelligence.
 *
 * Returns 0-1 score for how relevant a subreddit is to business/tech/professional contexts.
 * Used to:
 *   - Filter noise during ingestion (classify stage)
 *   - Prioritize threads for LLM analysis (thread intelligence)
 */

export function communityRelevance(community) {
  if (!community) return 0.5;
  const sub = community.replace(/^r\//, "").toLowerCase();

  // High relevance — business, tech, marketing, professional communities
  const highRelevance = /^(saas|startup|startups|entrepreneur|entrepreneurs|smallbusiness|microsaas|marketing|digital_marketing|socialmedia|socialmediamarketing|socialmediamanagers|productmanagement|productmarketing|growthmarket|growthhacking|growmybusiness|askmarketing|b2bmarketing|content_marketing|seo|bigseo|sales|consulting|freelance|agency|analytics|datascience|webdev|programming|devops|sysadmin|cscareerquestions|experienceddevs|nocode|technology|artificial|machinelearning|claudeai|localllama|langchain|cybersecurity|business|ecommerce|dropshipping|ycombinator|venturecapital|fintech|entrepreneurridealong|startup_ideas|indiehackers|sidehustle|sideproject|digitalnomad|remotework|productivity|projectmanagement|agile|pwnhub|vibecoding|seo_llm|publicrelations|instagrammarketing|digitalmarketing)$/;
  if (highRelevance.test(sub)) return 1.0;

  // Medium relevance — career, work, some overlap with business
  const medRelevance = /^(careerguidance|careeradvice|jobs|antiwork|workreform|overemployed|retailers|retailhell|accounting|humanresources|resumes|negotiation|thinkingdeeplyai|personalfinance)$/;
  if (medRelevance.test(sub)) return 0.5;

  // Low-medium — finance/investing (not business intelligence), general AI chat, speculation
  const financeNoise = /^(stocks|stockmarket|bogleheads|wallstreetbets|etfs|daytrading|trading|valueinvesting|investing|realestate|chatgpt|chatgptpro|chatgptpromptgenius|artificialsentience|decadeology|futurology|singularity|dataisbeautiful|bestofreditorupdates)$/;
  if (financeNoise.test(sub)) return 0.2;

  // Low relevance — gaming, fiction, hobbies, relationships, sports
  const lowRelevance = /^(fanfiction|ao3|genshin_impact|residentevil|boardgames|worldofwarships|dotA2|leagueoflegends|legendsofruneterra|gaming|games|pcgaming|steamdeck|sbcgaming|minecraft|fortnite|anime|manga|television|movies|books|writing|writingprompts|nosleep|amitheasshole|aitah|relationships|relationship_advice|datingoverthirty|breakups|aromantic|thebachelor|infertilitybabies|pregnancy|parenting|cooking|food|fitness|running|nba|nfl|soccer|formula1|sports|memes|funny|mildlyinfuriating|askreddit|showerthoughts|todayilearned|snapchathelp|instagram|math|askmath|sat|dnd|rpg)$/;
  if (lowRelevance.test(sub)) return 0.1;

  // Unknown community — give it a chance but with lower quality
  return 0.5;
}
