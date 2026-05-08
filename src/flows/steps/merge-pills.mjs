/**
 * Merge user-provided pills with auto-mined pills.
 * User pills take precedence (they appear first). Auto-mined fills remaining slots.
 * Dedupe by URL.
 *
 * Args: { userPains, autoPains, userSolutions, autoSolutions, maxPains, maxSolutions }
 * Returns: { painPills, solutionPills, sources }
 */

function dedupeByKey(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export default async function mergePills({
  userPains = [],
  autoPains = [],
  userSolutions = [],
  autoSolutions = [],
  maxPains = 6,
  maxSolutions = 5,
} = {}) {
  const safeArr = v => (Array.isArray(v) ? v : []);
  const _userPains = safeArr(userPains);
  const _autoPains = safeArr(autoPains);
  const _userSolutions = safeArr(userSolutions);
  const _autoSolutions = safeArr(autoSolutions);

  const painPills = dedupeByKey([..._userPains, ..._autoPains], p => p?.url).slice(0, maxPains);
  const solutionPills = dedupeByKey([..._userSolutions, ..._autoSolutions], p => p?.url).slice(0, maxSolutions);

  const sources = {
    pains: { user: _userPains.length, auto: _autoPains.length, final: painPills.length },
    solutions: { user: _userSolutions.length, auto: _autoSolutions.length, final: solutionPills.length },
  };
  return { painPills, solutionPills, sources };
}
