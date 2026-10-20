// Dev only: a scripted League client (QP_FAKE_CS=draft|aram) so the app's champ select features can be checked in the real
// window without a game: queue pop, auto-accept, champ select session events, picks/bans/locks you make (or auto pick makes)
// through PATCH, game start, end of game. Every handler sees the same events and requests the real client would send.
// Start:  set QP_FAKE_CS=draft&& npm start   (PowerShell: $env:QP_FAKE_CS='draft'; npm start)
const CHAMPS = { ahri: 103, lux: 99, syndra: 134, orianna: 61, zed: 238, yasuo: 157, caitlyn: 51, thresh: 412, garen: 86, darius: 122,
  jinx: 222, leona: 89, leesin: 64, vi: 254, malphite: 54, ezreal: 81, nami: 267, sona: 37, braum: 201, kaisa: 145 };

function draftSession() {
  const me = 2, roles = ["top", "jungle", "middle", "bottom", "utility"];
  const myTeam = roles.map((r, i) => ({ cellId: i, assignedPosition: r, championId: 0, championPickIntent: 0, summonerId: 100 + i, spell1Id: 4, spell2Id: 14 }));
  const theirTeam = roles.map((r, i) => ({ cellId: 5 + i, assignedPosition: "", championId: 0, championPickIntent: 0 }));
  let id = 1;
  const ban = (cell) => ({ id: id++, actorCellId: cell, type: "ban", championId: 0, completed: false, isInProgress: false });
  const pick = (cell) => ({ id: id++, actorCellId: cell, type: "pick", championId: 0, completed: false, isInProgress: false });
  const actions = [[...Array(10).keys()].map(ban), [pick(5)], [pick(0), pick(1)], [pick(6), pick(7)], [pick(me), pick(3)], [pick(8), pick(9)], [pick(4)]];
  return { gameId: 7700001, localPlayerCellId: me, myTeam, theirTeam, actions, bans: { myTeamBans: [], theirTeamBans: [] },
    benchEnabled: false, benchChampions: [], trades: [], timer: { phase: "PLANNING", adjustedTimeLeftInPhase: 15000, isInfinite: false } };
}
function aramSession() {
  const ids = [CHAMPS.garen, CHAMPS.darius, CHAMPS.jinx, CHAMPS.zed, CHAMPS.yasuo];
  return { gameId: 7700002, localPlayerCellId: 0, benchEnabled: true, actions: [], trades: [], bans: { myTeamBans: [], theirTeamBans: [] },
    myTeam: ids.map((c, i) => ({ cellId: i, assignedPosition: "", championId: c, championPickIntent: 0 })),
    theirTeam: [0, 1, 2, 3, 4].map((i) => ({ cellId: 5 + i, championId: 0 })),
    benchChampions: [CHAMPS.lux, CHAMPS.leona, CHAMPS.ezreal].map((c) => ({ championId: c })),
    timer: { phase: "FINALIZATION", adjustedTimeLeftInPhase: 60000, isInfinite: false } };
}

// The script: [ms after start, step]. Steps change the fake client's state and emit what the real client would.
function script(kind) {
  const s = kind === "aram" ? aramSession() : draftSession();
  const steps = [[500, { phase: "Lobby" }], [2000, { phase: "Matchmaking" }], [5000, { phase: "ReadyCheck", ready: true }], [9000, { phase: "ChampSelect", session: true }]];
  if (kind === "aram") return { s, queueId: 450, steps: [...steps, [30000, { timer: ["FINALIZATION", 5000] }], [40000, { phase: "InProgress" }], [55000, { phase: "EndOfGame", win: true }]] };
  const C = CHAMPS, lock = (cell, champ) => ({ lock: [cell, champ] }), turn = (g) => ({ turn: g });
  return { s, queueId: 420, steps: [...steps,
    [14000, { timer: ["BAN_PICK", 30000] }, turn(0)].flat(), [16000, { bans: [C.zed, C.yasuo, C.kaisa, C.leesin, C.vi, C.malphite, C.darius, C.braum, C.ezreal, C.sona] }],
    [18000, turn(1)], [20000, lock(5, C.caitlyn)], [21000, turn(2)], [23000, lock(0, C.garen)], [24000, lock(1, C.jinx)],
    [25000, turn(3)], [27000, lock(6, C.thresh)], [28000, lock(7, C.leona)],
    [29000, turn(4)], // your pick: hover/lock it yourself (or auto pick does); 30 s later the client locks your hover
    [59000, { autolock: 2 }], [60000, lock(3, C.nami)], [61000, turn(5)], [63000, lock(8, C.orianna)], [64000, lock(9, C.syndra)],
    [65000, turn(6)], [67000, lock(4, C.sona)], [68000, { timer: ["FINALIZATION", 20000] }],
    [88000, { phase: "InProgress" }], [100000, { phase: "EndOfGame", win: true }]] };
}

function install(lcu, kind, log) {
  const { s, queueId, steps } = script(kind);
  let phase = "None", ready = null, sessionLive = false, win = true;
  const emit = (uri, data, eventType = "Update") => lcu.emit("event", { uri, eventType, data });
  const pushSession = () => { if (sessionLive) emit("/lol-champ-select/v1/session", JSON.parse(JSON.stringify(s))); };
  const all = () => s.actions.flat();
  const setPhase = (p) => { phase = p; emit("/lol-gameflow/v1/gameflow-phase", p); };
  const ok = (data = null) => ({ status: 200, data });
  // The real client's champion list: from Data Dragon once, else the scripted champions only.
  let summary = Object.entries(CHAMPS).map(([alias, id]) => ({ id, name: alias.charAt(0).toUpperCase() + alias.slice(1), alias }));
  fetch("https://ddragon.leagueoflegends.com/api/versions.json").then((r) => r.json())
    .then((v) => fetch(`https://ddragon.leagueoflegends.com/cdn/${v[0]}/data/en_US/champion.json`)).then((r) => r.json())
    .then((j) => { summary = Object.values(j.data).map((c) => ({ id: Number(c.key), name: c.name, alias: c.id })); }).catch(() => {});

  lcu.creds = { port: 0, password: "fake" };
  Object.defineProperty(lcu, "connected", { get: () => true, configurable: true });
  lcu.start = () => {};
  lcu.recheck = () => {};
  lcu.request = async (method, uri, body) => {
    method = method.toLowerCase();
    if (uri === "/lol-gameflow/v1/gameflow-phase") return ok(phase);
    if (uri === "/lol-game-data/assets/v1/champion-summary.json") return ok(summary);
    if (uri === "/lol-champ-select/v1/session") return sessionLive ? ok(JSON.parse(JSON.stringify(s))) : { status: 404, data: null };
    if (uri === "/lol-lobby/v2/lobby") return ok({ gameConfig: { queueId } });
    if (uri === "/lol-matchmaking/v1/search") return ok({ estimatedQueueTime: 95, timeInQueue: 20 });
    if (uri === "/lol-matchmaking/v1/ready-check") return ready ? ok(ready) : { status: 404, data: null };
    if (uri.endsWith("/ready-check/accept") || uri.endsWith("/ready-check/decline")) {
      if (ready) { ready.playerResponse = uri.endsWith("accept") ? "Accepted" : "Declined"; emit("/lol-matchmaking/v1/ready-check", { ...ready }); }
      if (uri.endsWith("decline")) { ready = null; setPhase("Matchmaking"); }
      return { status: 204, data: null };
    }
    const m = /^\/lol-champ-select\/v1\/session\/actions\/(\d+)$/.exec(uri);
    if (m && method === "patch") {
      const a = all().find((x) => x.id === Number(m[1]));
      if (!a || a.completed) return { status: 400, data: { message: "invalid action" } };
      a.championId = Number(body.championId) || a.championId;
      if (body.completed) { a.completed = true; a.isInProgress = false; settle(a); }
      pushSession();
      return { status: 204, data: null };
    }
    if (uri === "/lol-end-of-game/v1/eog-stats-block") return ok({ gameId: s.gameId, teams: [{ isPlayerTeam: true, isWinningTeam: win }, { isPlayerTeam: false, isWinningTeam: !win }] });
    if (uri === "/lol-summoner/v1/current-summoner") return ok({ displayName: "Fake Summoner", gameName: "Fake", tagLine: "TEST", summonerLevel: 300, puuid: "fake", profileIconId: 29 });
    return { status: 404, data: null };
  };
  // A completed pick puts the champion on the team; a completed ban lists it.
  function settle(a) {
    const p = [...s.myTeam, ...s.theirTeam].find((x) => x.cellId === a.actorCellId);
    if (a.type === "pick" && p) p.championId = a.championId;
    if (a.type === "ban") (a.actorCellId < 5 ? s.bans.myTeamBans : s.bans.theirTeamBans).push(a.championId);
  }
  const run = (step) => {
    if (step.phase) {
      if (step.phase === "ChampSelect") sessionLive = true;
      if (step.phase === "InProgress") sessionLive = false;
      if (step.phase === "ReadyCheck") { ready = { state: "InProgress", playerResponse: "None", timer: 0 }; emit("/lol-matchmaking/v1/ready-check", { ...ready }); }
      if (step.phase === "ChampSelect" && ready) { ready.state = "EveryoneReady"; emit("/lol-matchmaking/v1/ready-check", { ...ready }); ready = null; }
      if (step.phase === "EndOfGame") win = step.win !== false;
      setPhase(step.phase);
      if (step.session) pushSession();
    }
    if (step.timer) { s.timer = { phase: step.timer[0], adjustedTimeLeftInPhase: step.timer[1], isInfinite: false }; pushSession(); }
    if (step.turn !== undefined) { all().forEach((a) => (a.isInProgress = false)); for (const a of s.actions[step.turn]) if (!a.completed) a.isInProgress = true; s.timer.adjustedTimeLeftInPhase = 30000; pushSession(); }
    if (step.bans) { s.actions[0].forEach((a, i) => { if (a.actorCellId !== s.localPlayerCellId || !a.completed) { a.championId = a.championId || step.bans[i]; a.completed = true; a.isInProgress = false; settle(a); } }); pushSession(); }
    if (step.lock) { const [cell, champ] = step.lock, a = all().find((x) => x.actorCellId === cell && x.type === "pick" && !x.completed); if (a) { a.championId = champ; a.completed = true; a.isInProgress = false; settle(a); } pushSession(); }
    if (step.autolock !== undefined) { const a = all().find((x) => x.actorCellId === step.autolock && x.type === "pick" && !x.completed); if (a) { a.championId = a.championId || CHAMPS.ahri; a.completed = true; a.isInProgress = false; settle(a); pushSession(); } }
  };
  log(`FAKE LEAGUE CLIENT: replaying "${kind}" (QP_FAKE_CS). Nothing talks to a real client.`);
  setTimeout(() => {
    lcu.emit("connect");
    for (const [ms, step] of steps) setTimeout(() => run(step), ms);
  }, 1500);
}

module.exports = { install, script, CHAMPS };
