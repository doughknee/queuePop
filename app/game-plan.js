// Game plan at lock-in (DONI-347): when you lock your champion, the crawler's /lol/plan/{champion} (track D) gives the core
// build, skill order, keystone, how your matchups against the enemies present go, and the first objectives. The host turns
// it into at most six plain lines, shows them in the live view and the float (bridge get_game_plan), and once all ten
// champions are known (FINALIZATION) sends them to the phone feed and, through notifier.alert("game_plan"), Discord/Windows.
const DD = "https://ddragon.leagueoflegends.com";
const SLOTS = { Q: "Q", W: "W", E: "E", R: "R" };

// plan + names → [lines]. names: { item, rune, champ } maps id → name. Pure; app/test-plan.js checks it.
// Accepts the crawler's /lol/plan (D8: core/skillOrder/skills15/keystone as {key} rows, threats, objectives with secured rates)
// and the simpler shape the tests started with (core ids, skills {priority, order}, keystone id, matchups, objectives {key, winRate}).
const EARLY = ["first_blood", "first_dragon", "dragon", "first_tower", "herald", "rift_herald", "first_herald", "voidgrubs", "horde", "baron"];
const early = (k) => { const i = EARLY.indexOf(String(k).toLowerCase()); return i < 0 ? 99 : i; };
function planLines(plan, names) {
  if (!plan) return [];
  const key = (x) => (x && typeof x === "object" ? x.key : x);
  plan = { ...plan,
    core: Array.isArray(plan.core) ? plan.core : key(plan.core) ? String(key(plan.core)).split(",").map(Number) : [],
    skills: plan.skills || { priority: key(plan.skillOrder), order: key(plan.skills15) },
    keystone: key(plan.keystone),
    matchups: plan.matchups || plan.threats || [],
    objectives: (plan.objectives || []).map((o) => ({ key: o.key || o.objective, winRate: o.winRate ?? o.securedWinRate, lowSample: o.lowSample }))
      .filter((o) => Number.isFinite(o.winRate) && !o.lowSample)
      .sort((a, b) => early(a.key) - early(b.key)) };
  const n = (map, id) => (names[map] && names[map][id]) || String(id);
  const pct = (x) => (x * 100).toFixed(1);
  const lines = [];
  if (Array.isArray(plan.core) && plan.core.length) lines.push(`Build: ${plan.core.slice(0, 3).map((i) => n("item", i)).join(" → ")}`);
  const sk = plan.skills || {};
  if (sk.priority) lines.push(`Skills: max ${[...String(sk.priority)].filter((c) => SLOTS[c]).join(" > ")}${sk.order ? ` (start ${String(sk.order).slice(0, 3).split("").join(" ")})` : ""}`);
  if (plan.keystone) lines.push(`Keystone: ${n("rune", plan.keystone)}`);
  const hard = (plan.matchups || []).filter((m) => Number.isFinite(m.delta)).sort((a, b) => a.delta - b.delta).slice(0, 2);
  if (hard.length) lines.push(`Watch out: ${hard.map((m) => `${n("champ", m.champion)} ${m.delta > 0 ? "+" : ""}${pct(m.delta)} (${Number(m.games || 0).toLocaleString("en-US")} games)`).join(", ")}`);
  const obj = (plan.objectives || []).filter((o) => o.key).slice(0, 2);
  if (obj.length) lines.push(`First objectives: ${obj.map((o) => `${String(o.key).replace(/_/g, " ").toLowerCase()} ${pct(o.winRate)} % win`).join(", ")} when you take them`);
  return lines.slice(0, 6);
}

// ctx: { lcu, push, notifier, getConfig, log }
function attachGamePlan(ctx) {
  let names = null, current = null, sentFor = null, askedFor = null;
  const json = (url) => fetch(url, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${url}`))));
  async function loadNames() {
    if (names) return names;
    const v = (await json(`${DD}/api/versions.json`))[0];
    const [items, runes, champs] = await Promise.all([json(`${DD}/cdn/${v}/data/en_US/item.json`), json(`${DD}/cdn/${v}/data/en_US/runesReforged.json`), json(`${DD}/cdn/${v}/data/en_US/champion.json`)]);
    const rune = {};
    for (const tree of runes) for (const slot of tree.slots || []) for (const r of slot.runes || []) rune[r.id] = r.name;
    return (names = { item: Object.fromEntries(Object.entries(items.data || {}).map(([id, i]) => [id, i.name])), rune,
      champ: Object.fromEntries(Object.values(champs.data || {}).map((c) => [c.key, c.name])) });
  }
  const base = () => String(ctx.getConfig().crawler_url || "http://10.205.0.81:47900").replace(/\/+$/, "");

  ctx.lcu.on("event", async (e) => {
    if (e.uri === "/lol-gameflow/v1/gameflow-phase" && ["None", "Lobby", "Matchmaking"].includes(e.data)) { current = null; sentFor = askedFor = null; return; }
    if (e.uri !== "/lol-champ-select/v1/session" || !e.data || e.eventType === "Delete") return;
    const s = e.data, me = (s.myTeam || []).find((p) => p.cellId === s.localPlayerCellId) || {};
    const locked = (s.actions || []).flat().some((a) => a.actorCellId === s.localPlayerCellId && a.type === "pick" && a.completed);
    if (!locked || !me.championId) return;
    const enemies = (s.theirTeam || []).map((p) => p.championId).filter((x) => x > 0);
    const key = `${s.gameId || ""}:${me.championId}:${enemies.join(",")}`;
    if (askedFor !== key) { // ask again only when the enemies we know about changed
      askedFor = key;
      try {
        const role = String(me.assignedPosition || "").toLowerCase();
        const q = new URLSearchParams({ role, enemies: enemies.join(",") }).toString();
        const [plan, nm] = await Promise.all([json(`${base()}/lol/plan/${me.championId}?${q}`), loadNames().catch(() => ({}))]);
        const lines = planLines(plan, nm);
        current = lines.length ? { champion: (nm.champ || {})[me.championId] || "", lines } : null;
      } catch (err) { ctx.log("game plan:", err.message); askedFor = null; }
    }
    // Phone and Discord once per game, when all ten are in.
    const ten = enemies.length >= 5 && (s.myTeam || []).every((p) => p.championId > 0);
    if (current && ten && sentFor !== (s.gameId || key)) {
      sentFor = s.gameId || key;
      const text = current.lines.join("\n");
      ctx.push(`Game plan${current.champion ? ` for ${current.champion}` : ""}: ${current.lines.join(" · ")}`, "info", "game_plan");
      ctx.notifier.alert("game_plan", `Game plan${current.champion ? `: ${current.champion}` : ""}`, text, "Game plan").catch(() => {});
    }
  });
  return { get: () => current };
}

module.exports = { attachGamePlan, planLines };
