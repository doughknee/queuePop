// node test-draft.js — live draft suggestions from /lol/draft (src/webui/draft-advice.js, Q10).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, URLSearchParams, Number, Math, Set };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "draft-advice.js"), "utf8"), ctx);
const { draftContext, draftQuery, whyLine, topCandidates } = ctx.window.draftAdvice;
const J = (o) => JSON.parse(JSON.stringify(o));

const cs = { myTeam: [{ cellId: 0, isLocal: true, position: "middle", championId: 0 }, { cellId: 1, position: "utility", championId: 412 }],
  theirTeam: [{ championId: 51 }, { championId: 0 }], bans: { my: [{ championId: 238 }], their: [{ championId: 555 }, { championId: 0 }] } };
const c = draftContext(cs);
assert.deepStrictEqual(J(c), { role: "middle", myChampion: 0, enemies: [51], allies: [412], bans: [238, 555] });
assert.strictEqual(draftQuery(c), "role=middle&enemies=51&allies=412&bans=238%2C555");
assert.strictEqual(draftContext({ myTeam: [{ isLocal: true, position: "" }] }).role, null); // blind pick / ARAM: no ranking

// Fixture in the agreed shape: fractions for winRate/delta.
const resp = { role: "middle", patch: "16.20", candidates: [
  { champion: 103, score: 0.71, winRate: 0.524, games: 3961, components: [{ kind: "vs", champion: 51, delta: 0.031 }, { kind: "with", champion: 412, delta: 0.012 }] },
  { champion: 7, score: 0.9, winRate: 0.51, games: 80, lowSample: true, components: [] },
  { champion: 51, score: 0.99, winRate: 0.6, games: 900, components: [] }, // already locked by the enemy
  { champion: 61, score: 0.65, winRate: 0.497, games: 2100, components: [{ kind: "vs", champion: 51, delta: -0.004 }] },
] };
const names = { 51: "Caitlyn", 412: "Thresh" };
const name = (id) => names[id] || String(id);
assert.deepStrictEqual(topCandidates(resp, c, 5).map((x) => x.champion), [103, 61, 7]); // gone ones out, low samples last
assert.strictEqual(whyLine(resp.candidates[0], name), "+3.1 vs Caitlyn, good with Thresh, 52.4 % over 3,961 games");
assert.strictEqual(whyLine(resp.candidates[3], name), "49.7 % over 2,100 games"); // a 0.4 point edge isn't worth a line
assert.strictEqual(whyLine({ components: [] }, name), "");
assert.strictEqual(topCandidates(null, c).length, 0);
// The crawler's live components shape (D8): {base, lane, enemies[], allies[]}, null values for unseen pairs.
const liveCand = { champion: 79, score: 0.0436, games: 271, winRate: 0.5904, components: { base: { value: 0.0904, games: 271 }, lane: { champion: 51, value: 0.031, games: 120 },
  enemies: [{ champion: 99, value: null, games: 0 }], allies: [{ champion: 412, value: 0.012, games: 26 }] } };
assert.strictEqual(whyLine(liveCand, name), "+3.1 vs Caitlyn, 59.0 % over 271 games"); // 26 games with Thresh isn't enough to say
assert.strictEqual(ctx.window.draftAdvice.componentList({ components: { base: { value: 0.1 }, lane: null, enemies: [], allies: [] } }).length, 0);
console.log("test-draft ok");
