// node test-draft-order.js — smart pick orders only your own list (app/draft-order.js, DONI-348).
const assert = require("assert");
const { reorderByScore, createDraftOrder } = require("./draft-order");

const cands = [{ champion: 2, score: 0.9 }, { champion: 1, score: 0.4 }, { champion: 9, score: 0.99 }, { champion: 3, score: 0.95, lowSample: true }];
assert.deepStrictEqual(reorderByScore([1, 2, 3, 4], cands), [2, 1, 3, 4]); // [A, B] where B scores higher → B; 9 isn't yours; low samples keep their place
assert.deepStrictEqual(reorderByScore([1, 2], []), [1, 2]);
assert.deepStrictEqual(reorderByScore([1, 2], null), [1, 2]);

(async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => ({ candidates: cands }) }; };
  const d = createDraftOrder({ getConfig: () => ({}), log: () => {} });
  assert.deepStrictEqual(d.order([1, 2], "q1"), [1, 2]); // first ask: your order, never waits
  await new Promise((r) => setTimeout(r, 5));
  assert.deepStrictEqual(d.order([1, 2], "q1"), [2, 1]);
  d.order([1, 2], "q1");
  assert.strictEqual(calls, 1); // one request per draft state
  console.log("test-draft-order ok");
})().catch((e) => { console.error(e); process.exit(1); });
