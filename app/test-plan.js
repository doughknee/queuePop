// node test-plan.js — game plan at lock-in (app/game-plan.js, DONI-347).
const assert = require("assert");
const { EventEmitter } = require("events");
const { planLines, attachGamePlan } = require("./game-plan");

const names = { item: { 3089: "Rabadon's Deathcap", 6655: "Luden's Companion", 3020: "Sorcerer's Shoes" }, rune: { 8112: "Electrocute" }, champ: { 51: "Caitlyn", 99: "Lux", 103: "Ahri" } };
const plan = { core: [6655, 3020, 3089, 3157], skills: { order: "QWEQQRQE", priority: "QEW" }, keystone: 8112,
  matchups: [{ champion: 99, delta: -0.02, games: 900 }, { champion: 51, delta: -0.041, games: 2100 }, { champion: 7, delta: 0.03, games: 50 }],
  objectives: [{ key: "FIRST_DRAGON", winRate: 0.54 }, { key: "HERALD", winRate: 0.521 }, { key: "BARON", winRate: 0.7 }] };
assert.deepStrictEqual(planLines(plan, names), [
  "Build: Luden's Companion → Sorcerer's Shoes → Rabadon's Deathcap",
  "Skills: max Q > E > W (start Q W E)",
  "Keystone: Electrocute",
  "Watch out: Caitlyn -4.1 (2,100 games), Lux -2.0 (900 games)",
  "First objectives: first dragon 54.0 % win, herald 52.1 % win when you take them",
]);
assert.deepStrictEqual(planLines(null, names), []);
// The crawler's live shape (D8).
const live = { champion: 103, core: { key: "6655,3020,3089" }, skillOrder: { key: "QEW" }, skills15: { key: "QWEQQRQEQEREEWW" }, keystone: { key: "8112" },
  threats: [{ champion: 51, games: 2100, winRate: 0.47, delta: -0.041 }],
  objectives: [{ objective: "baron", securedWinRate: 0.82, lowSample: false }, { objective: "first_blood", securedWinRate: 0.58, lowSample: false }, { objective: "first_tower", securedWinRate: 0.7, lowSample: true }] };
assert.deepStrictEqual(planLines(live, names), [
  "Build: Luden's Companion → Sorcerer's Shoes → Rabadon's Deathcap",
  "Skills: max Q > E > W (start Q W E)",
  "Keystone: Electrocute",
  "Watch out: Caitlyn -4.1 (2,100 games)",
  "First objectives: first blood 58.0 % win, baron 82.0 % win when you take them",
]);
assert.deepStrictEqual(planLines({ core: [1] }, {}), ["Build: 1"]); // names missing: ids, never a crash

// Flow: nothing before you lock; the plan once you lock; the phone/Discord once all ten are in, once per game.
(async () => {
  const lcu = new EventEmitter(), pushed = [], alerts = [];
  global.fetch = async (url) => ({ ok: true, json: async () => (url.includes("/lol/plan/") ? plan : url.includes("versions") ? ["1"] : url.includes("item") ? { data: {} } : url.includes("runes") ? [] : { data: {} }) });
  const gp = attachGamePlan({ lcu, push: (m) => pushed.push(m), notifier: { alert: async (...a) => alerts.push(a) }, getConfig: () => ({}), log: () => {} });
  const tick = () => new Promise((r) => setTimeout(r, 10));
  const session = (locked, enemies) => lcu.emit("event", { uri: "/lol-champ-select/v1/session", eventType: "Update", data: {
    gameId: 9, localPlayerCellId: 0, myTeam: [0, 1, 2, 3, 4].map((c) => ({ cellId: c, championId: c === 0 ? 103 : 10 + c, assignedPosition: c === 0 ? "middle" : "" })),
    theirTeam: enemies.map((id) => ({ championId: id })), actions: [[{ actorCellId: 0, type: "pick", completed: locked }]] } });
  session(false, [51]); await tick();
  assert.strictEqual(gp.get(), null);
  session(true, [51]); await tick();
  assert.strictEqual(gp.get().lines.length, 5);
  assert.strictEqual(alerts.length, 0); // only 1 enemy known: not yet
  session(true, [51, 99, 1, 2, 3]); await tick(); session(true, [51, 99, 1, 2, 3]); await tick();
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(pushed.length, 1);
  lcu.emit("event", { uri: "/lol-gameflow/v1/gameflow-phase", eventType: "Update", data: "Lobby" });
  assert.strictEqual(gp.get(), null);
  console.log("test-plan ok");
})().catch((e) => { console.error(e); process.exit(1); });
