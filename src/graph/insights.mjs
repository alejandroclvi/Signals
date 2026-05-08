import { cypher } from "./client.mjs";

export async function themeVelocity(contextId, { recentDays = 14, baselineDays = 76, asOf = null } = {}) {
  const today = asOf || new Date().toISOString().slice(0, 10);
  const totalDays = recentDays + baselineDays;
  return cypher(
    `WITH date($today) AS today
     MATCH (c:Context {id: $contextId})<-[:IN_CONTEXT]-(s:Signal)-[:ABOUT]->(t:Theme)
     WITH today, t, c
     MATCH (t)<-[:ABOUT]-(s2:Signal)<-[:SUPPORTS]-(e:Evidence)-[:ON_DAY]->(d:Day)
     WHERE e.contextId = c.id AND date(d.date) >= today - duration({days: $totalDays})
     WITH today, t, d, count(DISTINCT e) AS daily
     WITH today, t, collect({day: date(d.date), c: daily}) AS series, $recentDays AS r, $baselineDays AS b
     WITH t,
          [x IN series WHERE x.day >= today - duration({days: r}) | x.c] AS recent,
          [x IN series WHERE x.day < today - duration({days: r}) | x.c] AS baseline,
          r, b
     WITH t,
          CASE WHEN size(recent) > 0 THEN reduce(s=0.0, x IN recent | s+x)/r ELSE 0.0 END AS recentAvg,
          CASE WHEN size(baseline) > 0 THEN reduce(s=0.0, x IN baseline | s+x)/b ELSE 0.0 END AS baselineAvg,
          baseline
     WITH t, recentAvg, baselineAvg,
          CASE WHEN size(baseline) > 1
               THEN sqrt(reduce(s=0.0, x IN baseline | s+(x-baselineAvg)*(x-baselineAvg))/(size(baseline)-1))
               ELSE 0.0 END AS sd
     RETURN t.id AS theme, recentAvg, baselineAvg, sd,
            CASE WHEN sd > 0 THEN (recentAvg - baselineAvg)/sd ELSE 0.0 END AS zScore,
            CASE WHEN baselineAvg > 0 THEN recentAvg/baselineAvg - 1 ELSE 0.0 END AS pctChange
     ORDER BY zScore DESC`,
    { contextId, today, recentDays, baselineDays, totalDays }
  );
}

export async function signalCorroboration(signalId) {
  const rows = await cypher(
    `MATCH (s:Signal {id: $signalId})
     OPTIONAL MATCH (s)<-[:SUPPORTS]-(e:Evidence)
     OPTIONAL MATCH (e)-[:FROM]->(c:Community)-[:ON]->(src:Source)-[:AT]->(l:Layer)
     OPTIONAL MATCH (e)-[:BY]->(a:Author)
     RETURN count(DISTINCT e) AS evidence,
            count(DISTINCT c) AS communities,
            count(DISTINCT src) AS sources,
            count(DISTINCT l) AS layers,
            count(DISTINCT a) AS authors`,
    { signalId }
  );
  return rows[0] || { evidence: 0, communities: 0, sources: 0, layers: 0, authors: 0 };
}

export async function signalVelocity(signalId, { recentDays = 14, baselineDays = 76, asOf = null } = {}) {
  const today = asOf || new Date().toISOString().slice(0, 10);
  const rows = await cypher(
    `WITH date($today) AS today
     MATCH (s:Signal {id: $signalId})<-[:SUPPORTS]-(e:Evidence)-[:ON_DAY]->(d:Day)
     WHERE date(d.date) >= today - duration({days: $totalDays})
     WITH today, d, count(DISTINCT e) AS daily
     WITH collect({day: date(d.date), c: daily}) AS series, today, $recentDays AS r, $baselineDays AS b
     WITH [x IN series WHERE x.day >= today - duration({days: r}) | x.c] AS recent,
          [x IN series WHERE x.day < today - duration({days: r}) | x.c] AS baseline, r, b
     WITH CASE WHEN size(recent) > 0 THEN reduce(s=0.0, x IN recent | s+x)/r ELSE 0.0 END AS recentAvg,
          CASE WHEN size(baseline) > 0 THEN reduce(s=0.0, x IN baseline | s+x)/b ELSE 0.0 END AS baselineAvg,
          baseline
     WITH recentAvg, baselineAvg,
          CASE WHEN size(baseline) > 1
               THEN sqrt(reduce(s=0.0, x IN baseline | s+(x-baselineAvg)*(x-baselineAvg))/(size(baseline)-1))
               ELSE 0.0 END AS sd
     RETURN recentAvg, baselineAvg, sd,
            CASE WHEN sd > 0 THEN (recentAvg - baselineAvg)/sd ELSE 0.0 END AS zScore,
            CASE WHEN baselineAvg > 0 THEN recentAvg/baselineAvg - 1 ELSE 0.0 END AS pctChange`,
    { signalId, today, recentDays, baselineDays, totalDays: recentDays + baselineDays }
  );
  return rows[0] || { recentAvg: 0, baselineAvg: 0, sd: 0, zScore: 0, pctChange: 0 };
}

/**
 * Lead-lag: for a context, find the first observation date per source per theme.
 * Negative gap (in days) = HN/PM led Reddit; positive = Reddit led.
 */
export async function leadLagByTheme(contextId) {
  return cypher(
    `MATCH (e:Evidence {contextId: $contextId})-[:FROM]->(:Community)-[:ON]->(src:Source)
     MATCH (e)-[:ON_DAY]->(d:Day)
     WITH e, src.id AS source, date(d.date) AS day
     OPTIONAL MATCH (e)-[:SUPPORTS]->(:Signal)-[:ABOUT]->(t:Theme)
     WITH source, t.id AS theme, day
     WHERE theme IS NOT NULL
     WITH theme, source, min(day) AS firstSeen
     WITH theme, collect({source: source, firstSeen: toString(firstSeen)}) AS series
     WHERE size(series) >= 2
     RETURN theme, series ORDER BY theme`,
    { contextId }
  );
}

/**
 * Cross-source presence per context: which sources appear, with evidence counts and date ranges.
 */
export async function contextSourceMix(contextId) {
  return cypher(
    `MATCH (e:Evidence {contextId: $contextId})-[:FROM]->(:Community)-[:ON]->(s:Source)-[:AT]->(l:Layer)
     MATCH (e)-[:ON_DAY]->(d:Day)
     WITH s, l, e, date(d.date) AS day
     RETURN s.id AS source, l.id AS layer, count(e) AS evidence,
            toString(min(day)) AS earliest, toString(max(day)) AS latest
     ORDER BY evidence DESC`,
    { contextId }
  );
}

/**
 * Theme cross-source overlap: themes whose evidence appears in N+ sources within a context.
 */
export async function themeCrossSourceOverlap(contextId, { minSources = 2 } = {}) {
  return cypher(
    `MATCH (c:Context {id: $contextId})<-[:IN_CONTEXT]-(s:Signal)-[:ABOUT]->(t:Theme)
     WITH c, t
     MATCH (e:Evidence {contextId: c.id})-[:FROM]->(:Community)-[:ON]->(src:Source)
     WHERE EXISTS {
       MATCH (e)-[:SUPPORTS]->(:Signal)-[:ABOUT]->(t)
     } OR src.id <> 'reddit'
     WITH t, src, count(DISTINCT e) AS evidence
     WITH t.id AS theme, collect({source: src.id, n: evidence}) AS perSource
     WHERE size(perSource) >= $minSources
     RETURN theme, perSource ORDER BY size(perSource) DESC, theme`,
    { contextId, minSources }
  );
}

/**
 * Polymarket vs Conversation divergence: compare the dominant_state mood of Reddit/HN evidence
 * against current Polymarket probability for the same context.
 */
export async function polymarketDivergence(contextId) {
  return cypher(
    `MATCH (c:Context {id: $contextId})
     OPTIONAL MATCH (pm:Evidence {contextId: c.id})-[:FROM]->(:Community {sourceId: 'polymarket'})
     WITH c, collect({title: pm.community, weight: pm.weight, state: pm.state}) AS pmRows
     OPTIONAL MATCH (e:Evidence {contextId: c.id})-[:HAS_STATE]->(st:State)
     WHERE st.id IN ['experiencing_pain','warning','tried_failed']
     WITH c, pmRows, count(e) AS negEvidence
     OPTIONAL MATCH (e2:Evidence {contextId: c.id})-[:HAS_STATE]->(st2:State)
     WHERE st2.id IN ['found_what_works','sharing_insight','promoting']
     WITH c, pmRows, negEvidence, count(e2) AS posEvidence
     RETURN c.id AS context,
            negEvidence, posEvidence,
            CASE WHEN (negEvidence+posEvidence)>0
                 THEN toFloat(posEvidence)/(negEvidence+posEvidence) ELSE null END AS conversationOptimism,
            size(pmRows) AS polymarketCount,
            pmRows AS polymarketRows`,
    { contextId }
  );
}

/**
 * Signal-level multi-source corroboration via THEME, not supports.
 * For each signal, find evidence in the same context that shares at least one of the signal's themes,
 * then count distinct sources/layers of that evidence.
 *
 * This works even when SUPPORTS edges are single-source — the theme overlap reveals where
 * cross-source independent confirmation exists.
 */
export async function signalCorroborationByTheme(signalId) {
  const rows = await cypher(
    `MATCH (s:Signal {id: $signalId})-[:ABOUT]->(t:Theme)
     WITH s, collect(t) AS themes
     MATCH (e:Evidence {contextId: s.contextId})
     WHERE EXISTS {
       MATCH (e)-[:SUPPORTS]->(other:Signal)-[:ABOUT]->(t2:Theme)
       WHERE t2 IN themes
     } OR ((e)-[:FROM]->(:Community)-[:ON]->(:Source {id: 'hackernews'}))
        OR ((e)-[:FROM]->(:Community)-[:ON]->(:Source {id: 'polymarket'}))
     OPTIONAL MATCH (e)-[:FROM]->(c:Community)-[:ON]->(src:Source)-[:AT]->(l:Layer)
     OPTIONAL MATCH (e)-[:BY]->(a:Author)
     RETURN count(DISTINCT e) AS evidence,
            count(DISTINCT src) AS sources,
            count(DISTINCT l) AS layers,
            count(DISTINCT c) AS communities,
            count(DISTINCT a) AS authors,
            collect(DISTINCT src.id) AS sourceIds`,
    { signalId }
  );
  return rows[0] || { evidence: 0, sources: 0, layers: 0, communities: 0, authors: 0, sourceIds: [] };
}

/**
 * Themes that appear in 2+ contexts. With current generic tags ("frustration",
 * "demand", etc.) most themes will cross all contexts; the value is the
 * per-context signal weight, not novelty.
 */
export async function themesAcrossContexts({ minContexts = 2 } = {}) {
  return cypher(
    `MATCH (c:Context)<-[:IN_CONTEXT]-(s:Signal)-[:ABOUT]->(t:Theme)
     WITH t, c.id AS ctxId, count(DISTINCT s) AS sigs
     WITH t.id AS theme, collect({context: ctxId, signals: sigs}) AS perCtx
     WHERE size(perCtx) >= $minContexts
     RETURN theme, perCtx, size(perCtx) AS contextCount
     ORDER BY contextCount DESC, theme`,
    { minContexts }
  );
}

/**
 * Communities that show up across 2+ contexts — the "shared listening posts"
 * where one subreddit/HN-tag is feeding multiple research theses.
 */
export async function communitiesAcrossContexts({ minContexts = 2, minEvidence = 5 } = {}) {
  return cypher(
    `MATCH (com:Community)<-[:FROM]-(e:Evidence)-[:IN_CONTEXT]->(ctx:Context)
     WITH com, ctx.id AS ctxId, count(e) AS evidence
     WHERE evidence >= $minEvidence
     WITH com, collect({context: ctxId, evidence: evidence}) AS distribution,
          sum(evidence) AS totalEvidence
     WHERE size(distribution) >= $minContexts
     RETURN com.name AS community, com.sourceId AS source,
            distribution, totalEvidence, size(distribution) AS contextCount
     ORDER BY contextCount DESC, totalEvidence DESC LIMIT 25`,
    { minContexts, minEvidence }
  );
}

/**
 * Whole-corpus source mix: how much evidence per source per layer overall.
 */
export async function corpusSourceMix() {
  return cypher(
    `MATCH (e:Evidence)-[:FROM]->(:Community)-[:ON]->(s:Source)-[:AT]->(l:Layer)
     RETURN s.id AS source, l.id AS layer, count(e) AS evidence,
            count(DISTINCT e.contextId) AS contextsCovered
     ORDER BY evidence DESC`
  );
}

export async function communitySpread(signalId) {
  const rows = await cypher(
    `MATCH (s:Signal {id: $signalId})<-[:SUPPORTS]-(e:Evidence)-[:FROM]->(c:Community)
     WITH s, c, count(DISTINCT e) AS n
     WITH s, collect({comm: c.name, n: n}) AS dist, sum(n) AS total
     WITH dist, total,
          reduce(top=null, x IN dist | CASE WHEN top IS NULL OR x.n > top.n THEN x ELSE top END) AS topComm
     RETURN size(dist) AS communities, total AS evidence,
            toFloat(topComm.n)/total AS topShare,
            topComm.comm AS dominantCommunity`,
    { signalId }
  );
  return rows[0] || { communities: 0, evidence: 0, topShare: 1.0, dominantCommunity: null };
}
