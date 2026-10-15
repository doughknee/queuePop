// node test-champ.js — champ-select priority/pick-order logic on fixture lobbies, plus counter-engine checks.
const assert = require("assert");
const { ChampSelect } = require("./champ-select");
const suggest = require("./champ-suggest");
const { normalizeConfig } = require("./champ-config");

const CHAMPS = { 222: "Jinx", 145: "Kai'Sa", 119: "Draven", 22: "Ashe", 21: "Miss Fortune", 51: "Caitlyn" };

// Fake LCU: records every call, answers GETs from `gets`, everything else 204.
function fakeLcu(gets = {}) {
  const calls = [];
  return { calls, request: async (method, uri, body) => {
    calls.push([method, uri, body]);
    return method === "get" ? (uri in gets ? { status: 200, data: gets[uri] } : { status: 404, data: null }) : { status: 204, data: null };
  } };
}
function champSelect(lcu, settings) {
  const cs = new ChampSelect(lcu);
  cs.settings = () => normalizeConfig({ champ_select: settings }).champ_select;
  for (const [id, name] of Object.entries(CHAMPS)) { cs.idToName.set(+id, name); cs.championMap.set(name.toLowerCase(), +id); }
  return cs;
}
const writes = (lcu) => lcu.calls.filter((c) => c[0] !== "get");

(async () => {
  // Draft: we're cell 2, bottom. Our #1 pick (Jinx) is banned and a teammate intends Ashe, so we pick Kai'Sa.
  const settings = { enabled: true, roles: { bottom: { picks: ["Jinx", "Ashe", "Kai'Sa"], bans: ["Draven", "Caitlyn"] } } };
  const session = (inProgress) => ({
    localPlayerCellId: 2, timer: { phase: "BAN_PICK" },
    myTeam: [{ cellId: 1, assignedPosition: "utility", championPickIntent: 22 }, { cellId: 2, assignedPosition: "bottom" }],
    actions: [
      [{ id: 1, actorCellId: 7, type: "ban", championId: 222, completed: true },
       { id: 2, actorCellId: 2, type: "ban", championId: 0, completed: false, isInProgress: true }],
      [{ id: 3, actorCellId: 2, type: "pick", championId: 0, completed: false, isInProgress: inProgress }],
    ],
  });
  let lcu = fakeLcu();
  let cs = champSelect(lcu, settings);
  const state = new Map();
  await cs.process(session(false), state); // planning-ish: ban hover + pick intent
  assert.deepStrictEqual(writes(lcu), [
    ["patch", "/lol-champ-select/v1/session/actions/2", { championId: 119, completed: false }],
    ["patch", "/lol-champ-select/v1/session/actions/3", { championId: 145, completed: false }],
  ]);
  lcu.calls.length = 0;
  await cs.process(session(true), state); // our turn, instant lock: ban + pick complete
  assert.deepStrictEqual(writes(lcu), [
    ["patch", "/lol-champ-select/v1/session/actions/2", { championId: 119, completed: true }],
    ["patch", "/lol-champ-select/v1/session/actions/3", { championId: 145, completed: true }],
  ]);

  // Last-second lock: hold the hover until 30s - lock_in_at_seconds after the turn is detected.
  lcu = fakeLcu();
  cs = champSelect(lcu, { ...settings, instant_lock: false, lock_in_at_seconds: 1 });
  const st2 = new Map();
  await cs.process(session(true), st2);
  await cs.process(session(true), st2);
  assert.ok(!writes(lcu).some((c) => c[1].endsWith("/actions/3") && c[2].completed), "locked too early");
  cs.pickOpen -= 29;
  await cs.process(session(true), st2);
  assert.ok(writes(lcu).some((c) => c[1].endsWith("/actions/3") && c[2].completed && c[2].championId === 145), "no lock at the buzzer");

  // ARAM bench: holding Ashe, Jinx (priority #1) on the bench gets grabbed; then a trade toward Kai'Sa
  // is requested from cell 3 and cancelled once it is no longer the best upgrade.
  const aram = { aram: { enabled: true }, trades: { enabled: true }, roles: { aram: { picks: ["Jinx", "Kai'Sa", "Ashe"], mode: "off" } } };
  lcu = fakeLcu();
  cs = champSelect(lcu, aram);
  const aramSession = (bench, trades, cell3 = 145) => ({
    localPlayerCellId: 2, benchEnabled: true, benchChampions: bench.map((championId) => ({ championId })), timer: { phase: "BAN_PICK" },
    myTeam: [{ cellId: 2, championId: 22 }, { cellId: 3, championId: cell3 }], actions: [], trades,
  });
  await cs.process(aramSession([222], []), new Map());
  assert.deepStrictEqual(writes(lcu), [["post", "/lol-champ-select/v1/session/bench/swap/222", undefined]]);
  lcu.calls.length = 0;
  await cs.process(aramSession([], [{ id: 9, cellId: 3, state: "AVAILABLE" }]), new Map());
  assert.deepStrictEqual(writes(lcu), [["post", "/lol-champ-select/v1/session/champion-swaps/9/request", undefined]]);
  lcu.calls.length = 0;
  await cs.process(aramSession([], [{ id: 9, cellId: 3, state: "SENT" }], 21), new Map()); // teammate swapped to MF: stale
  assert.deepStrictEqual(writes(lcu), [["post", "/lol-champ-select/v1/session/champion-swaps/9/cancel", undefined]]);

  // Counter engine parity with tests/test_pick_suggestions.py.
  const POOL = [{ champ: "Darius", mastery: 120000 }, { champ: "Garen", mastery: 40000 }, { champ: "Malphite", mastery: 5000 }, { champ: "Ornn", mastery: 0 }];
  const scn = { my_role: "top", my_team: ["Ahri", "Jinx", "Lee Sin"], enemy_team: [{ champ: "Fiora", role: "top" }, { champ: "Zed", role: "middle" }], pool: POOL };
  let out = suggest.liveSuggestions(scn);
  assert.strictEqual(out.phase, "picks");
  assert.strictEqual(out.picks[0].champ, "Darius");
  assert.strictEqual(out.picks.length, 3);
  assert.ok(!suggest.liveSuggestions({ ...scn, my_team: ["Darius"] }).picks.some((p) => p.champ === "Darius"));
  out = suggest.liveSuggestions({ my_role: "top", my_team: [], enemy_team: [], pool: POOL });
  assert.strictEqual(out.bans.length, 3);
  assert.ok(!POOL.some((p) => p.champ === out.bans[0].champ));
  assert.strictEqual(suggest.inferRole("Jinx", suggest.loadChampionRoles()), "bottom");
  assert.strictEqual(suggest.inferRole("A", { top: ["X", "A"], jungle: ["A"] }), "jungle");
  console.log("test-champ ok");
})().catch((e) => { console.error(e); process.exit(1); });
