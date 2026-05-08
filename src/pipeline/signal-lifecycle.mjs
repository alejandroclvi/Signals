/**
 * Signal lifecycle classifier — assigns each signal a trajectory state.
 *
 * State machine:
 *   forming   — newly seeded, sparse evidence (1–4 packets in 30d, with recent activity)
 *   emerging  — growing (5–14 in 30d) but not yet established
 *   fresh     — strong recent emergence (15+ in 30d AND 10+ in 7d)
 *   mature    — sustained over multiple weeks (30+ total, evidence flow stable)
 *   fading    — was strong, evidence rate dropped (30d / prev-30d < 0.5)
 *   stalled   — was forming/emerging but hasn't progressed in 14+ days
 *   dormant   — no evidence in last 30d
 *
 * Materialization event: when prev_state ∈ {forming, emerging, stalled} AND new state = fresh.
 * Tracked via prev_state + materialized_at.
 *
 * Stalled detection requires snapshot history — a signal is "stalled" when its
 * lifecycle has stayed in {forming, emerging} for 14+ days without growth.
 */

import { getDb } from "../db/connection.mjs";

export const STATES = ["forming", "emerging", "fresh", "mature", "fading", "stalled", "dormant"];

export const STATE_DEFINITIONS = {
  forming:  "Newly seeded — sparse evidence (1-4 in 30d), recent activity",
  emerging: "Growing (5-14 in 30d), still proving out",
  fresh:    "Strong recent emergence (15+ in 30d AND 10+ in 7d)",
  mature:   "Sustained over weeks; well-established",
  fading:   "Evidence rate dropping (30d / prev-30d < 0.5)",
  stalled:  "Was forming/emerging, hasn't progressed in 14+ days — needs deeper research",
  dormant:  "No evidence in last 30d — signal died or went quiet",
};

function metricsForSignal(db, signalId, asOf) {
  const today = asOf;
  const row = db.prepare(`
    SELECT
      COUNT(ep.id) AS total,
      SUM(CASE WHEN ep.published_at >= datetime(?, '-7 days')
                AND ep.published_at <= datetime(?, '+1 day') THEN 1 ELSE 0 END) AS recent_7d,
      SUM(CASE WHEN ep.published_at >= datetime(?, '-30 days')
                AND ep.published_at <= datetime(?, '+1 day') THEN 1 ELSE 0 END) AS recent_30d,
      SUM(CASE WHEN ep.published_at >= datetime(?, '-60 days')
                AND ep.published_at < datetime(?, '-30 days') THEN 1 ELSE 0 END) AS prev_30d,
      MAX(ep.published_at) AS latest_at,
      MIN(ep.published_at) AS earliest_at
    FROM signal_evidence se
    JOIN evidence_packets ep ON ep.id = se.evidence_id
    WHERE se.signal_id = ?
  `).get(today, today, today, today, today, today, signalId);

  return {
    total: row?.total || 0,
    recent_7d: row?.recent_7d || 0,
    recent_30d: row?.recent_30d || 0,
    prev_30d: row?.prev_30d || 0,
    latest_at: row?.latest_at || null,
    earliest_at: row?.earliest_at || null,
  };
}

function daysSince(iso, asOf) {
  if (!iso) return Infinity;
  return (new Date(asOf).getTime() - new Date(iso).getTime()) / 86400_000;
}

/**
 * Classify a single signal given its evidence metrics and prior state (if any).
 *
 * Returns { state, reason, trend_ratio, materialized_at? }.
 */
export function classifyMetrics(metrics, asOf, priorState = null, priorStateSince = null) {
  const { total, recent_7d, recent_30d, prev_30d, latest_at } = metrics;
  const daysSinceLatest = daysSince(latest_at, asOf);
  const trend_ratio = prev_30d > 0 ? recent_30d / prev_30d : (recent_30d > 0 ? Infinity : 0);
  const daysInPriorState = priorStateSince ? daysSince(priorStateSince, asOf) : 0;

  // Dormant: no evidence in 30 days
  if (recent_30d === 0 && daysSinceLatest > 30) {
    return { state: "dormant", reason: `no evidence in last 30d (latest ${Math.round(daysSinceLatest)}d ago)`, trend_ratio };
  }

  // Mature: sustained, lots of total + balanced flow
  if (total >= 60 && recent_30d >= 10 && prev_30d >= 10) {
    return { state: "mature", reason: `sustained (total=${total}, 30d=${recent_30d}, prev30d=${prev_30d})`, trend_ratio };
  }

  // Fading: was active, dropped sharply
  if (prev_30d >= 10 && recent_30d > 0 && trend_ratio < 0.5) {
    return { state: "fading", reason: `30d/prev30d ratio ${trend_ratio.toFixed(2)} (was ${prev_30d}, now ${recent_30d})`, trend_ratio };
  }

  // Fresh: strong recent activity AND last-7d concentration
  if (recent_30d >= 15 && recent_7d >= 10) {
    const out = { state: "fresh", reason: `${recent_7d} packets in last 7d, ${recent_30d} in last 30d`, trend_ratio };
    if (priorState && ["forming", "emerging", "stalled"].includes(priorState)) {
      out.materialized = true;
    }
    return out;
  }

  // Emerging: growing but not yet fresh
  if (recent_30d >= 5) {
    return { state: "emerging", reason: `${recent_30d} packets in last 30d, growing`, trend_ratio };
  }

  // Stalled: was forming/emerging for 14+ days without growth
  if (priorState && ["forming", "emerging"].includes(priorState) && daysInPriorState >= 14 && recent_30d <= 4) {
    return { state: "stalled", reason: `${priorState} for ${Math.round(daysInPriorState)}d without growing past ${recent_30d}`, trend_ratio };
  }

  // Forming: any recent activity
  if (recent_30d >= 1 || daysSinceLatest <= 30) {
    return { state: "forming", reason: `${recent_30d} packets in 30d, latest ${Math.round(daysSinceLatest)}d ago`, trend_ratio };
  }

  return { state: "dormant", reason: `no recent activity`, trend_ratio };
}

/**
 * Update lifecycle for a single signal — reads current metrics, reads prior
 * state, classifies, writes signal_lifecycle row, appends snapshot.
 */
export function updateSignalLifecycle(signalId, asOf) {
  const db = getDb();
  const sig = db.prepare(`SELECT id, context_id FROM signals WHERE id = ?`).get(signalId);
  if (!sig) throw new Error(`Signal not found: ${signalId}`);

  const prior = db.prepare(`SELECT state, state_since, materialized_at, research_attempts FROM signal_lifecycle WHERE signal_id = ?`).get(signalId);
  const priorState = prior?.state || null;
  const priorStateSince = prior?.state_since || null;

  const metrics = metricsForSignal(db, signalId, asOf);
  const { state, reason, trend_ratio, materialized } = classifyMetrics(metrics, asOf, priorState, priorStateSince);

  const stateChanged = priorState !== state;
  const newStateSince = stateChanged ? new Date().toISOString() : (priorStateSince || new Date().toISOString());
  const materialized_at = materialized
    ? new Date().toISOString()
    : (prior?.materialized_at || null);

  db.prepare(`
    INSERT INTO signal_lifecycle
      (signal_id, context_id, state, state_reason, prev_state, state_since,
       materialized_at, evidence_total, evidence_30d, evidence_7d, evidence_prev_30d,
       trend_ratio, latest_evidence_at, research_attempts, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(signal_id) DO UPDATE SET
      state = excluded.state,
      state_reason = excluded.state_reason,
      prev_state = CASE WHEN signal_lifecycle.state != excluded.state THEN signal_lifecycle.state ELSE signal_lifecycle.prev_state END,
      state_since = excluded.state_since,
      materialized_at = COALESCE(excluded.materialized_at, signal_lifecycle.materialized_at),
      evidence_total = excluded.evidence_total,
      evidence_30d = excluded.evidence_30d,
      evidence_7d = excluded.evidence_7d,
      evidence_prev_30d = excluded.evidence_prev_30d,
      trend_ratio = excluded.trend_ratio,
      latest_evidence_at = excluded.latest_evidence_at,
      updated_at = datetime('now')
  `).run(
    signalId, sig.context_id, state, reason, priorState, newStateSince,
    materialized_at, metrics.total, metrics.recent_30d, metrics.recent_7d, metrics.prev_30d,
    trend_ratio, metrics.latest_at, prior?.research_attempts || 0
  );

  db.prepare(`
    INSERT OR REPLACE INTO signal_lifecycle_snapshots
      (signal_id, observed_at, state, evidence_total, evidence_30d, evidence_7d, trend_ratio)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(signalId, asOf, state, metrics.total, metrics.recent_30d, metrics.recent_7d, trend_ratio);

  return { state, prev_state: priorState, state_changed: stateChanged, materialized: !!materialized, reason, metrics };
}

/**
 * Update lifecycle for all signals in a context. Returns aggregate counts and
 * any materialization events.
 */
export function updateContextLifecycle(contextId, asOf) {
  const db = getDb();
  const signals = db.prepare(`SELECT id FROM signals WHERE context_id = ?`).all(contextId);

  const results = { signals: signals.length, by_state: {}, transitions: [], materialized: [] };
  for (const s of signals) {
    const r = updateSignalLifecycle(s.id, asOf);
    results.by_state[r.state] = (results.by_state[r.state] || 0) + 1;
    if (r.state_changed) {
      results.transitions.push({ signal_id: s.id, from: r.prev_state, to: r.state, reason: r.reason });
    }
    if (r.materialized) {
      results.materialized.push({ signal_id: s.id, from: r.prev_state, reason: r.reason });
    }
  }
  return results;
}
