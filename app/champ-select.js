// Port of src/champ_select.py (auto pick/ban, loadouts, ARAM bench, trades, swaps) and the
// champ-select bridge methods of src/web_api.py. attach() wires it to the LCU and returns the methods.
const fs = require("fs");
const path = require("path");
const config = require("./config");
const C = require("./champ-config");
const suggest = require("./champ-suggest");
const { METHODS } = require("./methods");

const { ROLES, ARAM_ROLE, ROLE_LABELS, ARAM_MODES, ROLE_MODES, RUNE_PAGE_NAME, T, or, getd, pyInt, pyFloat } = C;
const DEFAULT_PICK_WINDOW = 30.0;
const POLL_INTERVAL = 250;
const TRADE_COOLDOWN = 3.0;
const FAR = 1e6; // rank of a champ that isn't on the priority line
const SPELL_NAMES = Object.fromEntries(C.SUMMONER_SPELLS.map((s) => [s.id, s.name]));
const ORDINAL = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th" };
const ASSETS = path.join(__dirname, "..", "src", "webui", "assets");
const OVERRIDE_MANIFEST = path.join(__dirname, "..", "src", "assets_override", "champions", "manifest.json");

const now = () => performance.now() / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[champ]", ...a);
const arr = (x) => (Array.isArray(x) ? x : []);
const rankOf = (cid, pri) => { const i = pri.indexOf(cid); return i < 0 ? FAR : i; };
const minBy = (xs, key) => xs.reduce((best, x) => (key(x) < key(best) ? x : best));
const randomChoice = (xs) => xs[Math.floor(Math.random() * xs.length)];

// Ranked preference list for a swap feature; migrates the pre-list single-choice key.
function prioList(cs, key, legacyKey, valid) {
  const out = [];
  for (const raw of or(cs[key], [])) { const v = String(raw); if (valid.includes(v) && !out.includes(v)) out.push(v); }
  if (out.length) return out;
  const legacy = String(getd(cs, legacyKey, "off"));
  return valid.includes(legacy) ? [legacy] : [];
}

// Role for a positionless, benchless draft (League Classic).
function fallbackRole(cs) {
  const roles = or(cs.roles, {});
  return [...prioList(cs, "role_priority", "preferred_role", ROLES), ...ROLES].find((r) => T(or(roles[r], {}).picks)) || null;
}

const SWAP_KINDS = {
  pick: {
    kind: "pick", sessionKey: "pickOrderSwaps", endpoint: "pick-order-swaps", eventKind: "pick_swap", log: "pick swap",
    acceptEvent: "Accepted pick-order swap — now picking {label}", acceptFail: "Pick-order swap accept failed",
    received: "Pick-order swap requested by a teammate", cancel: "Cancelled pick-order swap request",
    requestEvent: "Requesting a pick-order swap for the {label} pick", requestFail: "Pick-order swap request failed",
  },
  pos: {
    kind: "pos", sessionKey: "positionSwaps", endpoint: "position-swaps", eventKind: "role_swap", log: "position swap",
    acceptEvent: "Accepted role swap — now playing {label}", acceptFail: "Role swap accept failed",
    received: "Role swap requested by a teammate", cancel: "Cancelled role swap request",
    requestEvent: "Requesting a role swap for {label}", requestFail: "Role swap request failed",
  },
};
const fmt = (s, label) => s.replace("{label}", label);

class ChampSelect {
  // lcu: {request(method, uri, body) -> {status, data}}; push: activity feed; isPaused: () => bool.
  constructor(lcu, push = () => {}, isPaused = () => false) {
    this.lcu = lcu;
    this.push = push;
    this.isPaused = isPaused;
    this.championMap = new Map(); // lowercased name/alias -> championId
    this.idToName = new Map();    // championId -> display name
    this.running = false;
    this.lockedChampionId = null;
    this._reset();
  }

  _reset() {
    this.lastSig = null;
    this.lastNoroleSig = null;
    this.fallbackLogged = false;
    this.skip = new Set();     // "kind:championId" whose pick/ban request failed this session
    this.spellsFor = null;
    this.runesFor = null;
    this.skinFor = null;
    this.runeTryFor = null;
    this.runeTries = 0;
    this.runeCapWarned = false;
    this.tradeState = new Map(); // "recv|req:tradeId" -> accepted|notified|declined
    this.tradeOut = null;        // {id, cell}
    this.tradeLast = new Map();  // tradeId -> time of our last action
    this.swapctl = { pick: { state: new Map(), out: null, last: new Map() }, pos: { state: new Map(), out: null, last: new Map() } };
    this.benchSeen = new Map();
    this.benchTarget = null;
    this.masteryRows = null;
    this.masteryIds = null;
    this.randomIds = null;
    this.pickable = null;
    this.pickOpen = null;
  }

  // While "stepping away" is on (DONI-424) the automation sees the away overlay; config.json itself never changes.
  settings() { const s = or(config.get().champ_select, {}); return this.overlay ? this.overlay(s) : s; }
  name(cid) { return this.idToName.has(cid) ? this.idToName.get(cid) : cid; }

  // GET that resolves to parsed JSON on 200, else null (never throws).
  async getJson(uri) {
    try { const r = await this.lcu.request("get", uri); return r.status === 200 ? r.data : null; } catch { return null; }
  }

  static loadout(cs, roleKey, championId) {
    if (!roleKey || !championId) return {};
    const role = or(or(cs.roles, {})[roleKey], {});
    return or(or(role.loadouts, {})[String(championId)], {});
  }

  async loadChampionData() {
    const data = await this.getJson("/lol-game-data/assets/v1/champion-summary.json");
    if (!Array.isArray(data)) { log("Could not load champion data"); return; }
    const cmap = new Map(), idToName = new Map();
    for (const champ of [...data].sort((a, b) => (a.id || 0) - (b.id || 0))) {
      const cid = champ.id;
      if (!cid || cid < 0) continue;
      const name = champ.name || "", alias = champ.alias || "";
      if (name && !cmap.has(name.toLowerCase())) cmap.set(name.toLowerCase(), cid);
      if (alias && !cmap.has(alias.toLowerCase())) cmap.set(alias.toLowerCase(), cid);
      idToName.set(cid, name || alias);
    }
    this.championMap = cmap;
    this.idToName = idToName;
    log(`Loaded ${idToName.size} champions for auto pick/ban.`);
  }

  resolve(name) { return name ? this.championMap.get(String(name).trim().toLowerCase()) || null : null; }

  static anyAutomation(cs) {
    const aram = or(cs.aram, {});
    if (T(cs.enabled) || T(or(cs.trades, {}).enabled) || T(aram.enabled) || T(aram.auto_mastery)) return true;
    return Object.values(or(cs.roles, {})).some((role) => T(or(role, {}).loadouts));
  }

  onSessionEvent() {
    if (!ChampSelect.anyAutomation(this.settings()) || this.isPaused()) return;
    if (!this.running) this.manage();
  }

  async manage() {
    if (this.running) return;
    this.running = true;
    this._reset();
    const actionState = new Map(); // actionId -> [hover|locked, championId]
    log("=== champ select session started ===");
    try {
      if (!this.championMap.size) await this.loadChampionData();
      while (!this.isPaused()) {
        let r;
        try { r = await this.lcu.request("get", "/lol-champ-select/v1/session"); } catch { break; }
        if (r.status !== 200) break;
        try { await this.process(r.data, actionState); } catch (e) { log("ERROR in process:", e && e.stack || e); }
        await sleep(POLL_INTERVAL);
      }
    } finally {
      this.running = false;
      log("=== champ select session ended ===");
    }
  }

  async process(session, actionState) {
    const cs = this.settings();
    const localCell = session.localPlayerCellId;
    const myTeam = arr(session.myTeam);

    const me = myTeam.find((p) => p.cellId === localCell);
    let position = me ? String(me.assignedPosition || "").toLowerCase() : "";
    const rolesCfg = or(cs.roles, {});
    const isAram = T(session.benchEnabled);
    if (!position && !isAram) {
      const fb = fallbackRole(cs);
      if (fb) {
        position = fb;
        if (!this.fallbackLogged) { this.fallbackLogged = true; log(`no assignedPosition and no bench; using role '${fb}' from config`); }
      }
    }
    const roleCfg = rolesCfg[position];
    const aramCfg = or(rolesCfg[ARAM_ROLE], {});
    const activePicks = T(roleCfg) ? or(roleCfg.picks, []) : isAram ? or(aramCfg.picks, []) : [];
    const myChamp = this.myChampion(session, localCell);

    const actions = arr(session.actions).flat();
    const unavailable = new Set();
    for (const a of actions) {
      const cid = a.championId || 0;
      if (cid > 0 && a.completed && (a.type === "ban" || a.type === "pick")) unavailable.add(cid);
    }
    for (const p of myTeam) {
      if (p.cellId === localCell) continue;
      if ((p.championPickIntent || 0) > 0) unavailable.add(p.championPickIntent);
    }
    const phase = or(session.timer, {}).phase;

    let myBan = null, myPick = null;
    for (const a of actions) {
      if (a.actorCellId !== localCell || a.completed) continue;
      if (a.type === "ban" && !myBan) myBan = a;
      else if (a.type === "pick" && !myPick) myPick = a;
    }

    const brief = (a) => a && { id: a.id, type: a.type, championId: a.championId, isInProgress: a.isInProgress, completed: a.completed };
    const sig = JSON.stringify([phase, position, brief(myBan), brief(myPick)]);
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      log(`phase=${phase} pos=${position} ban=${JSON.stringify(brief(myBan))} pick=${JSON.stringify(brief(myPick))} unavailable=${JSON.stringify([...unavailable].sort((a, b) => a - b))}`);
    }

    const aramToggle = or(cs.aram, {});
    const aramOn = isAram && (T(aramToggle.enabled) || T(aramToggle.auto_mastery));
    const aramAvoid = isAram ? new Set(this.priorityIds(aramCfg.bans)) : new Set();
    let pri;
    if (isAram) pri = await this.combinedPriority(aramCfg, aramToggle, aramAvoid);
    else if (T(roleCfg)) pri = await this.combinedPriority(roleCfg);
    else pri = this.priorityIds(activePicks);
    // DONI-348 (opt-in): your own list, best draft score first. Cached; never waits on the network.
    if (!isAram && T(roleCfg) && T(cs.smart_pick) && this.draftOrder && pri.length > 1) {
      const ids = (team) => arr(team).map((p) => p.championId).filter((x) => x > 0);
      // Keyed on role + enemies + your list only (sorted): ally hovers and your own lock don't change it, so the answer fetched
      // during bans is ready when your pick comes (review 2026-10-20).
      const q = new URLSearchParams({ role: position, enemies: ids(session.theirTeam).sort((a, b) => a - b).join(","),
        pool: [...pri].sort((a, b) => a - b).join(",") }).toString();
      const ordered = this.draftOrder.order(pri, q);
      if (ordered[0] !== pri[0] && this.smartSaid !== q) {
        this.smartSaid = q;
        this.push(`Smart pick: ${this.name(ordered[0])} goes before ${this.name(pri[0])} against this draft`, "info", "pick");
      }
      pri = ordered;
    }

    // === Time-critical: BAN + PICK before any cosmetic handler ===
    if (T(roleCfg)) {
      if (phase === "BAN_PICK" && myBan && myBan.isInProgress) {
        const chosen = this.select(roleCfg.bans || [], unavailable);
        if (chosen) await this.commit(myBan, chosen, "ban", actionState, true);
      }
      if (myPick) {
        const chosen = await this.pickCandidate(pri, unavailable);
        if (chosen) {
          if (myPick.isInProgress) {
            if (this.pickOpen === null) { this.pickOpen = now(); log("pick turn detected; lock countdown started"); }
            const lock = this.readyToLock(cs);
            if (lock) log(`locking pick ${chosen} (+${(now() - this.pickOpen).toFixed(2)}s)`);
            await this.commit(myPick, chosen, "pick", actionState, lock);
          } else if (T(getd(cs, "show_intent", true))) {
            await this.commit(myPick, chosen, "pick", actionState, false, true);
          }
        }
      }
    } else if (aramOn && myPick && phase === "BAN_PICK" && myPick.isInProgress) {
      // ARAM opening pick: only the lobby-team-builder mirror exposes the offered 2-3 champs.
      const subset = (await this.subsetChampions()).filter((c) => !aramAvoid.has(c));
      if (subset.length) {
        const chosen = await this.bestSubsetPick(subset, pri);
        if (chosen) await this.commit(myPick, chosen, "pick", actionState, true);
      }
    } else {
      const sig2 = "no-role|" + position;
      if (sig2 !== this.lastNoroleSig) {
        this.lastNoroleSig = sig2;
        log(`no role config for position='${position}'; team positions=${JSON.stringify(myTeam.map((p) => [p.cellId, p.assignedPosition]))}`);
      }
    }

    // === Non-urgent: bench, swaps, trades, then cosmetics ===
    const roleKey = T(roleCfg) ? position : isAram ? ARAM_ROLE : null;

    let swapped = false;
    if (aramOn) swapped = await this.handleBench(session, localCell, pri);

    const spotPrio = prioList(cs, "spot_priority", "pick_spot", ["1", "2", "3", "4", "5"]);
    if (!isAram && spotPrio.length && (phase === "PLANNING" || phase === "BAN_PICK")) {
      await this.reconcileSwaps(session, localCell, spotPrio.map(Number), this.pickPositions(session, myTeam), SWAP_KINDS.pick, ORDINAL);
    }
    const rolePrio = prioList(cs, "role_priority", "preferred_role", ROLES);
    if (!isAram && rolePrio.length && (phase === "PLANNING" || phase === "BAN_PICK")) {
      const posOf = new Map(myTeam.map((p) => [p.cellId, String(p.assignedPosition || "").toLowerCase()]));
      await this.reconcileSwaps(session, localCell, rolePrio, posOf, SWAP_KINDS.pos, ROLE_LABELS);
    }

    if (!swapped && T(or(cs.trades, {}).enabled)) await this.handleTrades(session, localCell, pri);

    const loadout = ChampSelect.loadout(cs, roleKey, myChamp);
    let spells = or(loadout.spells, []).slice(0, 2);
    if (spells.length < 2 && roleKey) spells = or(or(rolesCfg[roleKey], {}).default_spells, []).slice(0, 2);
    if (myChamp && this.spellsFor !== myChamp && spells.length >= 2) {
      this.spellsFor = myChamp;
      await this.applySpells(spells);
    }

    const lockedChamp = this.myChampion(session, localCell, true);

    let rune = getd(loadout, "rune", "off");
    if (rune === "off" && T(cs.auto_runes)) rune = "recommended";
    if (rune === "recommended") {
      if (lockedChamp && this.runesFor !== lockedChamp) {
        if (this.runeTryFor !== lockedChamp) { this.runeTryFor = lockedChamp; this.runeTries = 0; }
        this.runeTries++;
        const done = await this.applyRunes(lockedChamp, position, isAram ? 12 : 11);
        if (done || this.runeTries >= 24) this.runesFor = lockedChamp; // ~6s of polls, then give up
      }
    } else if (rune !== "off" && myChamp && this.runesFor !== myChamp) {
      this.runesFor = myChamp;
      await this.selectRunePage(rune);
    }

    if (lockedChamp && this.skinFor !== lockedChamp) {
      const skin = getd(ChampSelect.loadout(cs, roleKey, lockedChamp), "skin", "off");
      if (skin !== "off") await this.handleSkins(lockedChamp, skin);
    }
  }

  // Instant by default; otherwise lock once `lock_in_at_seconds` would remain of an assumed ~30s
  // window measured from when our turn was detected (the client's phase timer runs ahead).
  readyToLock(cs) {
    if (T(getd(cs, "instant_lock", true))) return true;
    let lockAt = pyFloat(getd(cs, "lock_in_at_seconds", C.DEFAULT_LOCK_SECONDS));
    if (lockAt === null) lockAt = C.DEFAULT_LOCK_SECONDS;
    if (this.pickOpen === null) return false;
    return now() - this.pickOpen >= Math.max(0, DEFAULT_PICK_WINDOW - lockAt);
  }

  select(names, unavailable) {
    for (const nm of names || []) {
      const cid = this.resolve(nm);
      if (cid && !unavailable.has(cid) && !this.skip.has("ban:" + cid)) return cid;
    }
    return null;
  }

  // The client only completes an action whose champ is already hovered: hover first, lock next poll.
  async commit(action, championId, kind, actionState, lock, intent = false) {
    const actionId = action.id;
    const state = actionState.get(actionId);
    if (state && state[0] === "locked") return;
    const display = this.name(championId);
    if (!state || state[0] !== "hover" || state[1] !== championId) {
      const ok = await this.patch(actionId, championId, false);
      const label = intent ? "Declaring intent" : "Hovering";
      if (ok) {
        actionState.set(actionId, ["hover", championId]);
        this.push(`${label} ${kind}: ${display}`, "info", "champ");
      } else {
        this.skip.add(kind + ":" + championId);
      }
      log(`${label} ${kind}: ${display} (action ${actionId}) -> ok=${ok}`);
      return;
    }
    if (lock) {
      const ok = await this.patch(actionId, championId, true);
      log(`LOCK ${kind}: ${display} (action ${actionId}) -> ok=${ok}`);
      if (ok) {
        actionState.set(actionId, ["locked", championId]);
        this.push(`Locked ${kind}: ${display}`, "success", "champ");
        if (kind === "pick") {
          this.lockedChampionId = championId;
          // ponytail: the locked_pick alert and stats counters belong to the notifications port (DONI-442).
          if (this.lcu.emit) this.lcu.emit("locked_pick", championId, display);
        }
      }
    }
  }

  async patch(actionId, championId, complete) {
    let r;
    try {
      r = await this.lcu.request("patch", `/lol-champ-select/v1/session/actions/${actionId}`, { championId, completed: complete });
    } catch (e) { log(`PATCH action ${actionId} raised: ${e}`); return false; }
    if (r.status >= 400) {
      log(`PATCH action ${actionId} championId=${championId} completed=${complete} -> HTTP ${r.status} ${JSON.stringify(r.data)}`);
      return false;
    }
    return true;
  }

  // Best-effort request: true when status < 400.
  async ok(method, uri, body, what) {
    try {
      const r = await this.lcu.request(method, uri, body);
      if (r.status >= 400) log(`${what} -> HTTP ${r.status} ${JSON.stringify(r.data)}`);
      return r.status < 400 ? r : null;
    } catch (e) { log(`${what} raised: ${e}`); return null; }
  }

  async applySpells([s1, s2]) {
    if (!(await this.ok("patch", "/lol-champ-select/v1/session/my-selection", { spell1Id: s1, spell2Id: s2 }, "spells PATCH"))) return;
    this.push(`Set summoner spells: ${SPELL_NAMES[s1] || s1} + ${SPELL_NAMES[s2] || s2}`, "info", "champ");
    log(`spells set -> ${s1},${s2}`);
  }

  // Applies the client's recommended page into our one managed page. True when done (or a
  // non-retryable failure), false to retry next poll (the endpoint 404s for a beat after lock).
  async applyRunes(championId, position = "", mapId = 11) {
    try {
      const pos = String(position || "").toUpperCase();
      const endpoints = [];
      if (pos) endpoints.push(`/lol-perks/v1/recommended-pages/champion/${championId}/position/${pos}/map/${mapId}`);
      endpoints.push("/lol-perks/v1/recommended-pages");
      let pages = null;
      for (const ep of endpoints) {
        const rec = await this.lcu.request("get", ep);
        if (rec.status === 200) {
          if (Array.isArray(rec.data) && rec.data.length) { pages = rec.data; log(`recommended via ${ep} (${pages.length} pages)`); break; }
          log(`${ep} -> 200 but empty`);
        } else log(`${ep} -> HTTP ${rec.status}`);
      }
      if (!pages) return false;
      const page = pages.find((p) => p.championId === championId) || pages[0];
      const primary = page.primaryPerkStyleId || page.primaryStyleId || page.primaryStyle;
      const sub = page.secondaryPerkStyleId || page.subStyleId || page.secondaryStyle || page.subStyle;
      const perks = [];
      for (const p of page.perks || page.selectedPerkIds || page.perkIds || []) {
        if (p && typeof p === "object") { const id = p.id || p.perkId; if (id) perks.push(id); }
        else if (Number.isInteger(p)) perks.push(p);
      }
      if (!(primary && sub && perks.length)) { log(`recommended page incomplete: primary=${primary} sub=${sub} perks=${perks.length} (retrying)`); return false; }

      const body = { name: RUNE_PAGE_NAME, primaryStyleId: primary, subStyleId: sub, selectedPerkIds: perks, current: true };
      const display = this.name(championId);
      // Edit our managed page in place when it exists (needs no free slot); create only as a fallback.
      const cur = await this.getJson("/lol-perks/v1/pages");
      const mine = arr(cur).find((pg) => pg.name === RUNE_PAGE_NAME);
      let newId = mine ? mine.id : null;
      let r;
      if (newId != null) {
        r = await this.lcu.request("put", `/lol-perks/v1/pages/${newId}`, body);
      } else {
        r = await this.lcu.request("post", "/lol-perks/v1/pages", body);
        if (r.status >= 400) {
          log(`rune POST -> HTTP ${r.status} ${JSON.stringify(r.data)}`);
          if (!this.runeCapWarned) {
            this.runeCapWarned = true;
            this.push("Rune pages are full, choose a page for queuePop in Settings → Recommended Runes to enable auto runes.", "warning", "runes_full");
          }
          return true;
        }
      }
      if (r.status >= 400) { log(`rune PUT -> HTTP ${r.status} ${JSON.stringify(r.data)}`); return true; }
      if (newId == null) newId = r.data && r.data.id;
      if (newId != null) await this.ok("put", "/lol-perks/v1/currentpage", newId, "set currentpage");
      this.push(`Applied recommended runes for ${display}`, "success", "runes");
      log(`runes applied for ${display} (champ ${championId}, page ${newId})`);
      return true;
    } catch (e) {
      log(`applyRunes error: ${e}`);
      return false;
    }
  }

  async selectRunePage(pageId) {
    pageId = pyInt(pageId);
    if (pageId === null) return;
    if (!(await this.ok("put", "/lol-perks/v1/currentpage", pageId, `select rune page ${pageId}`))) return;
    this.push("Applied your rune page", "success", "runes");
    log(`selected rune page ${pageId}`);
  }

  // Our committed champ: our pick action on the Rift, or the assigned champ in ARAM.
  myChampion(session, localCell, lockedOnly = false) {
    for (const a of arr(session.actions).flat()) {
      if (a.actorCellId === localCell && a.type === "pick") {
        const cid = a.championId || 0;
        if (cid > 0) {
          if (a.completed) return cid;
          if (!lockedOnly && a.isInProgress) return cid;
        }
      }
    }
    const me = arr(session.myTeam).find((p) => p.cellId === localCell);
    return me ? me.championId || 0 : 0;
  }

  priorityIds(names) {
    const ids = [];
    for (const nm of names || []) { const cid = this.resolve(nm); if (cid && !ids.includes(cid)) ids.push(cid); }
    return ids;
  }

  // championId -> {points, last, until_next}, cached per session; null until the client has it.
  async masteryData() {
    if (this.masteryRows) return this.masteryRows;
    let data = await this.getJson("/lol-champion-mastery/v1/local-player/champion-mastery");
    if (data === null) return null;
    if (!Array.isArray(data)) data = (data && data.championMasteryList) || [];
    const rows = new Map();
    for (const m of data) {
      if (m.championId) rows.set(m.championId, { points: m.championPoints || 0, last: m.lastPlayTime || 0, until_next: m.championPointsUntilNextLevel || 0 });
    }
    this.masteryRows = rows;
    log(`mastery loaded (${rows.size} champs)`);
    return rows;
  }

  async masteryPoints() {
    const rows = await this.masteryData();
    return rows && new Map([...rows].map(([cid, r]) => [cid, r.points]));
  }

  async masteryRanked() {
    if (!this.masteryIds) {
      const pts = await this.masteryPoints();
      if (!pts) return [];
      this.masteryIds = [...pts.keys()].sort((a, b) => pts.get(b) - pts.get(a));
    }
    return this.masteryIds;
  }

  roleMode(roleCfg, legacyAram) {
    const mode = or(roleCfg, {}).mode;
    if (ROLE_MODES.includes(mode)) return mode;
    if (legacyAram) {
      if (ARAM_MODES.includes(legacyAram.mode) && legacyAram.mode !== "list") return legacyAram.mode;
      if (T(legacyAram.auto_mastery)) return "highest";
    }
    return "off";
  }

  // The hand-built picks list first, then (unless mode is off) every other champ ranked by the mode.
  async combinedPriority(roleCfg, legacyAram = null, avoid = null) {
    let ids = this.priorityIds(or(roleCfg, {}).picks);
    const mode = this.roleMode(roleCfg, legacyAram);
    if (mode !== "off") {
      const ranked = await this.modeRanked(mode);
      ids = [...ids, ...ranked.filter((c) => !ids.includes(c))];
    }
    if (avoid && avoid.size) ids = ids.filter((c) => !avoid.has(c));
    return ids;
  }

  async modeRanked(mode) {
    if (mode === "highest") return this.masteryRanked();
    if (mode === "lowest") {
      const pts = await this.masteryPoints();
      if (!pts) return [];
      return [...this.idToName.keys()].sort((a, b) => (pts.get(a) || 0) - (pts.get(b) || 0) || a - b);
    }
    if (mode === "random") {
      if (!this.randomIds && this.idToName.size) {
        const ids = [...this.idToName.keys()];
        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
        this.randomIds = ids;
        log(`random priority shuffled (${ids.length} champs)`);
      }
      return this.randomIds || [];
    }
    const rows = mode === "rusty" || mode === "milestone" ? await this.masteryData() : null;
    if (!rows) return [];
    if (mode === "rusty") return [...rows.keys()].sort((a, b) => rows.get(a).last - rows.get(b).last);
    return [...rows.keys()].sort((a, b) => Math.max(0, rows.get(a).until_next) - Math.max(0, rows.get(b).until_next) || rows.get(b).points - rows.get(a).points);
  }

  // Champs we may pick (owned + free rotation), cached; empty set = unknown = no filter.
  async pickableIds() {
    if (this.pickable) return this.pickable;
    const data = await this.getJson("/lol-champ-select/v1/pickable-champion-ids");
    if (data === null) return new Set();
    this.pickable = new Set(Array.isArray(data) ? data : []);
    return this.pickable;
  }

  async pickCandidate(pri, unavailable) {
    if (!pri.length) return null;
    const pickable = await this.pickableIds();
    return pri.find((cid) => !unavailable.has(cid) && !this.skip.has("pick:" + cid) && (!pickable.size || pickable.has(cid))) || null;
  }

  async subsetChampions() {
    const data = await this.getJson("/lol-lobby-team-builder/champ-select/v1/subset-champion-list");
    return Array.isArray(data) ? data.filter((c) => Number.isInteger(c) && c > 0) : [];
  }

  async bestSubsetPick(subset, pri) {
    const best = minBy(subset, (c) => rankOf(c, pri));
    if (rankOf(best, pri) < FAR) return best;
    const mastery = await this.masteryRanked();
    return mastery.length ? minBy(subset, (c) => rankOf(c, mastery)) : subset[0];
  }

  // Trades are standing offers: accept upgrades, keep ONE live request aimed at the best upgrade a
  // teammate holds, and cancel it the moment it goes stale.
  async handleTrades(session, localCell, pri) {
    const myTeam = arr(session.myTeam);
    const cellChamp = new Map();
    let myChamp = 0;
    for (const p of myTeam) {
      const c = p.championId || 0;
      cellChamp.set(p.cellId, c);
      if (p.cellId === localCell) myChamp = c;
    }
    if (!myChamp) return;
    const myRank = rankOf(myChamp, pri);
    const trades = or(session.trades, or(session.championSwaps, []));

    for (const t of trades) {
      if (t.state !== "RECEIVED") continue;
      const tid = t.id;
      const their = cellChamp.get(t.cellId) || 0;
      const theirName = their ? this.name(their) : `cell ${t.cellId}`;
      if (their && rankOf(their, pri) < myRank) {
        if (this.tradeState.get("recv:" + tid) !== "accepted") {
          this.tradeState.set("recv:" + tid, "accepted");
          const ok = await this.postTrade(tid, "accept");
          if (ok) this.push(`Accepted trade for ${theirName}`, "success", "trade");
          else this.push(`Trade accept failed for ${theirName}`, "warning", "trade");
          log(`trade ${tid} accept -> ${theirName} ok=${ok}`);
        }
      } else if (this.tradeState.get("recv:" + tid) !== "notified") {
        this.tradeState.set("recv:" + tid, "notified");
        this.push(`Trade requested by ${theirName}`, "info", "trade");
        log(`trade ${tid} received (no upgrade): ${theirName}`);
      }
    }

    let bestCell = null, bestRank = myRank;
    for (const p of myTeam) {
      if (p.cellId === localCell || !p.championId) continue;
      const r = rankOf(p.championId, pri);
      if (r < bestRank) { bestRank = r; bestCell = p.cellId; }
    }
    const t0 = now();

    const out = this.tradeOut;
    if (out) {
      const t = trades.find((x) => x.id === out.id);
      const state = t && t.state;
      if (state === "DECLINED") this.tradeState.set("req:" + out.id, "declined");
      if (state !== "SENT" && state !== "BUSY") this.tradeOut = null;
      else if (out.cell !== bestCell) {
        const ok = await this.postTrade(out.id, "cancel");
        const nm = this.idToName.get(cellChamp.get(out.cell) || 0) || "champ";
        this.push(`Cancelled trade request for ${nm} (no longer an upgrade)`, "info", "trade");
        log(`trade ${out.id} cancel -> ${nm} ok=${ok}`);
        this.tradeLast.set(out.id, t0);
        this.tradeOut = null;
        return;
      }
    }

    if (bestCell === null || this.tradeOut) return;
    const t = trades.find((x) => x.cellId === bestCell);
    if (!t || t.state !== "AVAILABLE") return;
    const tid = t.id;
    if (this.tradeState.get("req:" + tid) === "declined") return;
    if (t0 - (this.tradeLast.has(tid) ? this.tradeLast.get(tid) : -TRADE_COOLDOWN) < TRADE_COOLDOWN) return;
    this.tradeLast.set(tid, t0);
    const theirName = this.idToName.get(cellChamp.get(bestCell) || 0) || "champ";
    const ok = await this.postTrade(tid, "request");
    if (ok) {
      this.tradeOut = { id: tid, cell: bestCell };
      this.push(`Requesting trade for ${theirName}`, "info", "trade");
    } else this.push(`Trade request failed for ${theirName}`, "warning", "trade");
    log(`trade ${tid} request -> ${theirName} ok=${ok}`);
  }

  // Current clients use /champion-swaps; older ones /trades. Fall back only on 404.
  async postTrade(tradeId, action) {
    for (const ep of [`/lol-champ-select/v1/session/champion-swaps/${tradeId}/${action}`, `/lol-champ-select/v1/session/trades/${tradeId}/${action}`]) {
      let r;
      try { r = await this.lcu.request("post", ep); } catch (e) { log(`trade ${tradeId} ${action} raised: ${e}`); return false; }
      if (r.status < 400) return true;
      log(`trade ${tradeId} ${action} ${ep} -> HTTP ${r.status}`);
      if (r.status !== 404) return false;
    }
    return false;
  }

  // cellId -> pick position (1..5) for our team, from the order of pick actions.
  pickPositions(session, myTeam) {
    const cells = new Set(myTeam.map((p) => p.cellId));
    const order = [];
    for (const a of arr(session.actions).flat()) {
      if (a.type === "pick" && cells.has(a.actorCellId) && !order.includes(a.actorCellId)) order.push(a.actorCellId);
    }
    return new Map(order.map((c, i) => [c, i + 1]));
  }

  // Shared pick-order / role swap reconcile: one live request toward the best slot on `wants`
  // whose holder hasn't declined; accept offers that move us up; cancel stale requests.
  async reconcileSwaps(session, localCell, wants, posOf, spec, labels) {
    const myPos = posOf.get(localCell);
    if (!myPos) return;
    const swaps = or(session[spec.sessionKey], []);
    const st = this.swapctl[spec.kind];
    const rank = (pos) => { const i = wants.indexOf(pos); return i < 0 ? wants.length : i; };
    const label = (pos) => (pos in labels ? labels[pos] : pos);
    const myRank = rank(myPos);

    for (const s of swaps) {
      if (s.state !== "RECEIVED") continue;
      const sid = s.id;
      const theirPos = posOf.get(s.cellId);
      if (theirPos && rank(theirPos) < myRank) {
        if (st.state.get("recv:" + sid) !== "accepted") {
          st.state.set("recv:" + sid, "accepted");
          const ok = await this.postSwap(spec, sid, "accept");
          if (ok) this.push(fmt(spec.acceptEvent, label(theirPos)), "success", spec.eventKind);
          else this.push(spec.acceptFail, "warning", spec.eventKind);
          log(`${spec.log} ${sid} accept (${theirPos}) ok=${ok}`);
        }
      } else if (st.state.get("recv:" + sid) !== "notified") {
        st.state.set("recv:" + sid, "notified");
        this.push(spec.received, "info", spec.eventKind);
        log(`${spec.log} ${sid} received (${theirPos}, not higher-ranked)`);
      }
    }

    const t0 = now();
    if (st.out) {
      const s = swaps.find((x) => x.id === st.out.id);
      const state = s && s.state;
      if (state === "DECLINED") st.state.set("req:" + st.out.id, "declined");
      if (state !== "SENT" && state !== "BUSY") st.out = null;
    }

    let target = null; // [cell, swapId]
    for (const want of wants.slice(0, myRank)) {
      const cell = [...posOf].find(([c, p]) => p === want && c !== localCell);
      if (!cell) continue;
      const s = swaps.find((x) => x.cellId === cell[0]);
      if (!s) continue;
      const sid = s.id;
      if (st.state.get("req:" + sid) === "declined") continue;
      if (st.out && st.out.id === sid) { target = [cell[0], sid]; break; }
      if (s.state !== "AVAILABLE") continue;
      if (t0 - (st.last.has(sid) ? st.last.get(sid) : -TRADE_COOLDOWN) < TRADE_COOLDOWN) continue;
      target = [cell[0], sid];
      break;
    }

    if (st.out) {
      if (!target || st.out.id !== target[1]) {
        const ok = await this.postSwap(spec, st.out.id, "cancel");
        this.push(spec.cancel, "info", spec.eventKind);
        log(`${spec.log} ${st.out.id} cancel ok=${ok}`);
        st.last.set(st.out.id, t0);
        st.out = null;
      }
      return;
    }
    if (!target) return;
    const [bestCell, sid] = target;
    const want = posOf.get(bestCell);
    st.last.set(sid, t0);
    const ok = await this.postSwap(spec, sid, "request");
    if (ok) {
      st.out = { id: sid, cell: bestCell };
      this.push(fmt(spec.requestEvent, label(want)), "info", spec.eventKind);
    } else this.push(spec.requestFail, "warning", spec.eventKind);
    log(`${spec.log} ${sid} request (want ${want}, holder cell ${bestCell}) ok=${ok}`);
  }

  async postSwap(spec, swapId, action) {
    return !!(await this.ok("post", `/lol-champ-select/v1/session/${spec.endpoint}/${swapId}/${action}`, undefined, `${spec.log} ${swapId} ${action}`));
  }

  // Grab a higher-priority champ off the ARAM bench. True when a swap was made this poll.
  async handleBench(session, localCell, pri) {
    if (!pri.length) return false;
    const me = arr(session.myTeam).find((p) => p.cellId === localCell);
    const myChamp = me ? me.championId || 0 : 0;
    if (!myChamp) return false;
    let bench = arr(session.benchChampions).map((b) => (b && typeof b === "object" ? b.championId : b)).filter(Boolean);
    if (!bench.length) bench = arr(session.benchChampionIds).filter(Boolean);
    if (!bench.length) return false;

    let best = null, bestRank = rankOf(myChamp, pri);
    for (const cid of bench) { const r = rankOf(cid, pri); if (r < bestRank) { bestRank = r; best = cid; } }
    if (best === null || this.benchTarget === best) return false;

    // Courtesy window: let an upgrade sit `bench_delay` seconds before grabbing it.
    const delay = pyFloat(or(or(this.settings().aram, {}).bench_delay, 0)) || 0;
    if (delay > 0) {
      const t0 = now();
      if (!this.benchSeen.has(best)) this.benchSeen.set(best, t0);
      if (t0 - this.benchSeen.get(best) < delay) return false;
    }
    this.benchTarget = best; // guard before the request so a rejected swap doesn't re-fire every poll
    const name = this.name(best);
    if (!(await this.ok("post", `/lol-champ-select/v1/session/bench/swap/${best}`, undefined, `bench swap ${best}`))) return false;
    this.push(`Grabbed ${name} off the bench`, "success", "bench_swap");
    log(`bench swap -> ${name} (${best})`);
    return true;
  }

  // Skin from the locked champ's loadout: a skinId, or a list ("random favorite") of owned ones.
  async handleSkins(myChamp, pref) {
    if (!myChamp || this.skinFor === myChamp || pref == null || pref === "off") return;
    const skins = await this.getJson("/lol-champ-select/v1/skin-carousel-skins");
    if (!Array.isArray(skins) || !skins.length) return; // carousel empty until locked: retry later
    const selectable = (s) => {
      const own = s.ownership || {};
      return !!(s.unlocked || own.owned || (own.rental || {}).rented) && !s.disabled;
    };
    const owned = skins.filter(selectable);
    this.skinFor = myChamp;
    if (!owned.length) return;
    const idOf = (s) => s.id || s.skinId;
    let chosen = null;
    if (Array.isArray(pref)) {
      const favs = owned.filter((s) => pref.includes(idOf(s)));
      if (favs.length) chosen = randomChoice(favs);
    } else if (Number.isInteger(pref)) chosen = owned.find((s) => idOf(s) === pref) || null;
    if (!chosen) return;
    const skinId = idOf(chosen), name = chosen.name || skinId;
    if (!(await this.ok("patch", "/lol-champ-select/v1/session/my-selection", { selectedSkinId: pyInt(skinId) }, "skin PATCH"))) return;
    this.push(`Selected skin: ${name}`, "info", "skin");
    log(`skin set -> ${skinId} (${name})`);
  }
}

// --- Bridge methods (src/web_api.py) ---

const readJsonFile = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const ddVersion = (v) => String(v || "").split(".").map((p) => parseInt(p, 10) || 0);
function cmpVersion(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0); }
  return 0;
}

// asset_refresh.resolve: the refreshed override manifest when it's at least as new as the bundled one.
function resolveManifest() {
  const bundled = path.join(ASSETS, "champions", "manifest.json");
  if (!fs.existsSync(OVERRIDE_MANIFEST)) return [bundled, false];
  const ov = readJsonFile(OVERRIDE_MANIFEST), b = readJsonFile(bundled);
  const useOverride = !ov || !b || cmpVersion(ddVersion(ov.version), ddVersion(b.version)) >= 0;
  return useOverride ? [OVERRIDE_MANIFEST, true] : [bundled, false];
}

function attach(lcu, impl, push, state) {
  const cs = new ChampSelect(lcu, push, () => !!state.paused);
  cs.overlay = (s) => (state.away ? require("./stepping-away").applyAway(s) : s); // DONI-424
  cs.draftOrder = require("./draft-order").createDraftOrder({ getConfig: () => config.get(), log }); // DONI-348
  let skinsCatalog = null;

  lcu.on("connect", () => { if (ChampSelect.anyAutomation(cs.settings())) cs.loadChampionData(); });
  lcu.on("event", (e) => {
    if (e.uri === "/lol-champ-select/v1/session" && (e.eventType === "Create" || e.eventType === "Update")) cs.onSessionEvent();
  });

  const session = () => cs.getJson("/lol-champ-select/v1/session");
  const nm = (cid) => (cid > 0 ? cs.idToName.get(cid) || "" : "");

  const getChampions = () => [...cs.idToName].filter(([, n]) => n).map(([id, name]) => ({ id, name }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // Private helpers for suggest_picks; the bridge methods of the same name are DONI-442's.
  async function getChampionMastery() {
    let data = await cs.getJson("/lol-champion-mastery/v1/local-player/champion-mastery");
    if (data === null) return [];
    if (!Array.isArray(data)) data = (data && data.championMasteryList) || [];
    return data.filter((m) => m.championId).map((m) => ({ championId: m.championId, level: m.championLevel, points: m.championPoints || 0, lastPlayTime: m.lastPlayTime || 0 }));
  }

  async function getMatchHistory(count = 10) {
    count = Math.max(1, Math.min(pyInt(count) ?? 10, 20));
    const me = await cs.getJson("/lol-summoner/v1/current-summoner");
    const puuid = me && me.puuid;
    const data = await cs.getJson(`/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count - 1}`);
    const games = data && !Array.isArray(data) ? arr((data.games || {}).games) : [];
    const out = [];
    for (const g of games) {
      const parts = arr(g.participants);
      let pid = null;
      if (puuid) { const it = arr(g.participantIdentities).find((i) => (i.player || {}).puuid === puuid); if (it) pid = it.participantId; }
      let part = pid != null ? parts.find((p) => p.participantId === pid) : null;
      if (!part && parts.length === 1) part = parts[0];
      if (!part) continue;
      const st = part.stats || {}, tl = part.timeline || {};
      out.push({ position: suggest.matchPosition(g.mapId, tl.lane, tl.role), championId: part.championId, win: !!st.win,
        kills: st.kills || 0, deaths: st.deaths || 0, assists: st.assists || 0, queueId: g.queueId, ts: (g.gameCreation || 0) / 1000 });
    }
    return out;
  }

  const methods = {
    get_config: () => C.normalizeConfig(config.get()),
    save_config: (newConfig) => {
      const cfg = C.mergeForSave(newConfig, config.get());
      try { config.save(cfg); } catch (e) {
        push(`Failed to save settings: ${e.message}`, "danger");
        return { ok: false, error: e.message };
      }
      return { ok: true, config: cfg };
    },
    // DONI-337: answer an incoming champion trade by hand. -> {ok}
    respond_trade: async (tradeId, action) => {
      if (!["accept", "decline"].includes(action) || !Number.isInteger(Number(tradeId))) return { ok: false, error: "Bad trade answer" };
      const ok = await cs.postTrade(Number(tradeId), action);
      push(ok ? `Trade ${action === "accept" ? "accepted" : "declined"} from your phone` : `Trade ${action} failed`, ok ? "success" : "warning", "trade");
      return ok ? { ok } : { ok, error: "The client refused it (the trade may have expired)" };
    },
    get_roles: () => C.EDITOR_ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] })),
    get_summoner_spells: () => C.SUMMONER_SPELLS.map((s) => ({ ...s })),
    get_champions: getChampions,
    get_champ_asset_base: () => "assets/champions",

    suggest_picks: async () => {
      const quick = await (impl.get_quick_queues ? impl.get_quick_queues() : METHODS.get_quick_queues);
      const queues = quick.queues.map((q) => ({ id: q.id, name: q.name }));
      const empty = Object.fromEntries(suggest.SETUP_ROLES.map((r) => [r, []]));
      if (!lcu.connected) return { ok: false, roles: empty, queues, last: quick.last };
      const names = cs.idToName;
      const mastery = (await getChampionMastery()).map((m) => ({ name: names.get(m.championId), points: m.points || 0 }));
      const history = await getMatchHistory(20);
      const matches = history.map((m) => ({ name: names.get(m.championId), position: m.position }));
      const roles = suggest.deriveRolePicks(mastery, matches, suggest.loadChampionRoles());
      const last = quick.last || (history.length ? history[0].queueId : null);
      return { ok: true, roles, queues, last };
    },

    // DONI-549: pick from the phone. Your role's list (minus banned/taken), whose turn it is, and hover / lock one.
    pick_options: async () => {
      const s = await session();
      if (!s) return { active: false };
      if (!cs.idToName.size) await cs.loadChampionData();
      const me = arr(s.myTeam).find((p) => p.cellId === s.localPlayerCellId) || {};
      const settings = cs.settings();
      let role = String(me.assignedPosition || "").toLowerCase();
      if (!role && !T(s.benchEnabled)) role = fallbackRole(settings) || "";
      const mine = arr(s.actions).flat().find((a) => a.actorCellId === s.localPlayerCellId && a.type === "pick");
      const gone = new Set(arr(s.actions).flat().filter((a) => a.completed && a.championId > 0).map((a) => a.championId));
      const ids = [...new Set(or(or(or(settings.roles, {})[role], {}).picks, []).map((n) => cs.resolve(n)).filter((x) => x && !gone.has(x)))];
      return { active: true, role, myTurn: !!(mine && mine.isInProgress && !mine.completed), locked: !!(mine && mine.completed),
        hovered: mine && !mine.completed ? mine.championId || 0 : 0, auto: T(settings.enabled),
        picks: ids.slice(0, 8).map((id) => ({ id, name: cs.idToName.get(id) || String(id) })) };
    },
    phone_pick: async (championId, lock) => {
      const s = await session(), cid = Number(championId);
      if (!s || !Number.isInteger(cid) || cid <= 0) return { ok: false, error: "No champion select right now" };
      const mine = arr(s.actions).flat().find((a) => a.actorCellId === s.localPlayerCellId && a.type === "pick" && !a.completed);
      if (!mine) return { ok: false, error: "You've already locked in" };
      if (lock && !mine.isInProgress) return { ok: false, error: "It isn't your turn to pick yet" };
      const ok = await cs.patch(mine.id, cid, !!lock);
      push(ok ? `${lock ? "Locked" : "Hovering"} ${cs.name(cid)} from your phone` : `Phone ${lock ? "lock" : "hover"} failed`, ok ? (lock ? "success" : "info") : "warning", "champ");
      return ok ? { ok } : { ok, error: "The client refused it (taken or banned?)" };
    },
    // DONI-350: ARAM, which bench champion fills what your team lacks (advice only).
    bench_advice: async () => {
      const s = await session();
      if (!s || !T(s.benchEnabled)) return null;
      if (!cs.idToName.size) await cs.loadChampionData();
      const nm2 = (id) => cs.idToName.get(id);
      const team = arr(s.myTeam).map((p) => nm2(p.championId)).filter(Boolean);
      let bench = arr(s.benchChampions).map((b) => (b && typeof b === "object" ? b.championId : b)).filter(Boolean);
      if (!bench.length) bench = arr(s.benchChampionIds);
      const { benchAdvice, adviceLine } = require("./bench-advice");
      const a = benchAdvice(team, bench.map(nm2).filter(Boolean), suggest.flagsOf);
      return a ? { pick: a.pick, line: adviceLine(a) } : null;
    },
    get_champ_select: async () => {
      const s = await session();
      if (!s) return { active: false };
      if (!cs.idToName.size) await cs.loadChampionData();
      const localCell = s.localPlayerCellId;
      const player = (p) => {
        const cid = p.championId || 0, intent = p.championPickIntent || 0;
        return { cellId: p.cellId, championId: cid, name: nm(cid), position: String(p.assignedPosition || "").toLowerCase(),
          intent, intentName: nm(intent), spell1Id: p.spell1Id || 0, spell2Id: p.spell2Id || 0, skinId: p.selectedSkinId || 0,
          isLocal: p.cellId === localCell };
      };
      const myTeam = arr(s.myTeam).map(player), theirTeam = arr(s.theirTeam).map(player);
      const bans = s.bans || {};
      const myBans = [...arr(bans.myTeamBans)], theirBans = [...arr(bans.theirTeamBans)];
      if (!myBans.length && !theirBans.length) {
        const myCells = new Set(myTeam.map((p) => p.cellId));
        for (const a of arr(s.actions).flat()) {
          if (a.type === "ban" && a.completed && (a.championId || 0) > 0) (myCells.has(a.actorCellId) ? myBans : theirBans).push(a.championId);
        }
      }
      const banView = (ids) => ids.filter((b) => b > 0).map((b) => ({ championId: b, name: nm(b) }));
      const cellChamp = new Map(myTeam.map((p) => [p.cellId, p.championId]));
      const trades = or(s.trades, or(s.championSwaps, [])).filter((t) => t.state && t.state !== "INVALID").map((t) => {
        const cid = cellChamp.get(t.cellId) || 0;
        return { id: t.id, cellId: t.cellId, state: t.state, championId: cid, name: nm(cid) };
      });
      let benchIds = arr(s.benchChampions).map((b) => (b && typeof b === "object" ? b.championId : b)).filter(Boolean);
      if (!benchIds.length) benchIds = [...arr(s.benchChampionIds)];
      const timer = s.timer || {};
      let timerLeft = null;
      const ms = timer.adjustedTimeLeftInPhase;
      if (!timer.isInfinite && typeof ms === "number" && ms >= 0) timerLeft = suggest.pyRound(ms / 1000, 1);
      return {
        active: true, phase: timer.phase, timer_left: timerLeft, localCellId: localCell, myTeam, theirTeam,
        bans: { my: banView(myBans), their: banView(theirBans) }, trades,
        bench: { enabled: T(s.benchEnabled), champions: benchIds.map((b) => ({ championId: b, name: nm(b) })) },
      };
    },

    pick_suggestions: async () => {
      const s = await session();
      if (!s) return { ok: false };
      if (!cs.idToName.size) await cs.loadChampionData();
      const points = (await cs.masteryPoints()) || new Map();
      const settings = cs.settings();
      const me = arr(s.myTeam).find((p) => p.cellId === s.localPlayerCellId) || {};
      let role = String(me.assignedPosition || "").toLowerCase();
      if (!role && !T(s.benchEnabled)) role = fallbackRole(settings);
      const picks = or(or(or(settings.roles, {})[role], {}).picks, []);
      if (!suggest.SETUP_ROLES.includes(role) || !picks.length) return { ok: false };
      const names = cs.idToName;
      const locked = (team) => arr(team).filter((p) => names.has(p.championId)).map((p) => names.get(p.championId));
      const roles = suggest.loadChampionRoles();
      const bans = s.bans || {};
      const banned = [...arr(bans.myTeamBans), ...arr(bans.theirTeamBans)].map((b) => names.get(b));
      const scn = {
        my_role: role, my_team: locked(s.myTeam),
        enemy_team: locked(s.theirTeam).map((n) => ({ champ: n, role: suggest.inferRole(n, roles) })),
        pool: picks.map((n) => ({ champ: n, mastery: points.get(cs.resolve(n)) || 0 })),
      };
      const out = suggest.liveSuggestions(scn, 3, banned);
      for (const item of [...out.bans, ...out.picks]) item.id = cs.resolve(item.champ);
      return { ok: true, ...out };
    },

    get_champion_catalog: () => {
      const [file] = resolveManifest();
      const champs = arr((readJsonFile(file) || {}).champions);
      const byId = new Map();
      for (const c of champs) if (c.id != null) byId.set(c.id, { ...c });
      const names = new Set([...byId.values()].map((c) => String(c.name || "").toLowerCase()));
      for (const [cid, name] of [...cs.idToName].sort((a, b) => a[0] - b[0])) {
        if (!cid || cid < 0 || !name || byId.has(cid) || names.has(name.toLowerCase())) continue;
        names.add(name.toLowerCase());
        byId.set(cid, { id: cid, name, alias: null });
      }
      const key = (c) => String(c.name || "").toLowerCase();
      const merged = [...byId.values()].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
      return merged.length ? merged : getChampions();
    },

    get_champ_data_info: () => {
      const [file, refreshed] = resolveManifest();
      const data = readJsonFile(file);
      if (!data) return { version: "", count: 0, source: "bundled" };
      return { version: data.version || "", count: arr(data.champions).length, source: refreshed ? "refreshed" : "bundled" };
    },

    get_champion_skins: (championId) => {
      const cid = pyInt(championId);
      if (cid === null) return [];
      if (!skinsCatalog) skinsCatalog = (readJsonFile(path.join(ASSETS, "skins", "manifest.json")) || {}).skins || {};
      return [...arr(skinsCatalog[String(cid)])];
    },

    get_rune_pages: async () => arr(await cs.getJson("/lol-perks/v1/pages"))
      .filter((p) => p.isValid !== false && p.name !== RUNE_PAGE_NAME && (getd(p, "isEditable", true) || getd(p, "isDeletable", true)))
      .map((p) => ({ id: p.id, name: p.name || `Page ${p.id}`, primaryStyleId: p.primaryStyleId, subStyleId: p.subStyleId })),

    get_rune_info: async () => {
      const pagesIn = await cs.getJson("/lol-perks/v1/pages");
      if (!Array.isArray(pagesIn)) return { pages: [], managed: null, at_cap: false };
      let managed = null;
      const pages = [];
      for (const p of pagesIn) {
        const entry = { id: p.id, name: p.name || `Page ${p.id}` };
        if (p.name === RUNE_PAGE_NAME) managed = entry;
        else if (getd(p, "isEditable", true) || getd(p, "isDeletable", true)) pages.push(entry);
      }
      const inv = await cs.getJson("/lol-perks/v1/inventory");
      const atCap = !!(inv && Number.isInteger(inv.ownedPageCount) && Number.isInteger(inv.maxPages) && inv.ownedPageCount >= inv.maxPages);
      return { pages, managed, at_cap: atCap };
    },

    claim_rune_page: async (pageId) => {
      if (!lcu.connected) return { ok: false, error: "Client not connected" };
      const pid = pyInt(pageId);
      if (pid === null) return { ok: false, error: "Invalid page" };
      try {
        const r = await lcu.request("get", `/lol-perks/v1/pages/${pid}`);
        if (r.status !== 200) return { ok: false, error: `Page not found (${r.status})` };
        const pg = r.data;
        const put = await lcu.request("put", `/lol-perks/v1/pages/${pid}`, { name: RUNE_PAGE_NAME, primaryStyleId: pg.primaryStyleId,
          subStyleId: pg.subStyleId, selectedPerkIds: pg.selectedPerkIds || [], current: !!pg.current });
        if (put.status >= 400) return { ok: false, error: `Couldn't rename page (${put.status})` };
      } catch { return { ok: false, error: "Client not connected" }; }
      push("queuePop now manages that rune page", "success", "runes");
      return { ok: true };
    },
  };
  return methods;
}

module.exports = { ChampSelect, attach, fallbackRole, prioList };
