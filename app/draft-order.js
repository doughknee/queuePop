// Smart pick (DONI-348, opt-in, config champ_select.smart_pick): auto-pick still only ever picks from your own list for the
// role, but in the order the crawler's /lol/draft scores them against the enemies who have locked. Never on the time-critical
// path: the pick loop asks for a cached order and gets your list as written until the crawler has answered for this draft.

// Your list (ids, your order) + draft candidates → your list best-score first; ids the crawler didn't score keep their
// place after the scored ones. Pure; app/test-draft-order.js checks it.
function reorderByScore(ids, candidates) {
  const score = new Map((candidates || []).filter((c) => !c.lowSample && Number.isFinite(c.score)).map((c) => [Number(c.champion), c]));
  const scored = ids.filter((id) => score.has(id)).sort((a, b) => score.get(b).score - score.get(a).score);
  return [...scored, ...ids.filter((id) => !score.has(id))];
}

// ctx: { getConfig, log } → { order(ids, query) : ids, why(id) : string }
function createDraftOrder(ctx) {
  const memo = new Map(); // query → { candidates } | "pending" | "failed@<ms>"
  const base = () => String(ctx.getConfig().crawler_url || "http://10.205.0.81:47900").replace(/\/+$/, "");
  function order(ids, q) {
    const hit = memo.get(q);
    if (hit && hit.candidates) return reorderByScore(ids, hit.candidates);
    if (!hit || (typeof hit === "string" && hit.startsWith("failed@") && Date.now() - Number(hit.slice(7)) > 15000)) {
      memo.set(q, "pending");
      fetch(`${base()}/lol/draft?${q}`, { signal: AbortSignal.timeout(5000) })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
        .then((j) => memo.set(q, { candidates: j.candidates || [] }), (e) => { memo.set(q, "failed@" + Date.now()); ctx.log("smart pick:", e.message); });
      if (memo.size > 50) memo.delete(memo.keys().next().value);
    }
    return ids; // until the crawler answers: your list as you wrote it
  }
  return { order };
}

module.exports = { reorderByScore, createDraftOrder };
