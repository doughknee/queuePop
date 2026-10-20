// Draft recap (DONI-349): makes the suggestions accountable. When you lock, the host notes what the crawler's /lol/draft
// had on top for your role at that moment; when the game ends it pairs that with the result and keeps one row per game
// (userData/draft-recaps.json, newest 200). The feed says "Recap: you picked Ezreal (suggested Vayne), win", and the
// running record (followed vs ignored, W-L) is on the phone and the bridge (get_draft_recaps) for the match history.
const fs = require("fs");

// Snapshot + result → one row; null when either is missing. Pure; app/test-recap.js checks it.
function recapRow(snap, result) {
  if (!snap || !snap.picked || !result || typeof result.win !== "boolean") return null;
  return { gameId: result.gameId || snap.gameId || null, ts: Date.now(), role: snap.role || "", picked: snap.picked, suggested: snap.suggested || null,
    followed: !!snap.suggested && snap.suggested === snap.picked, why: snap.why || "", win: result.win };
}
// Rows → { followed: {games, wins}, ignored: {games, wins} }; games without a suggestion count in neither.
function hitRate(rows) {
  const out = { followed: { games: 0, wins: 0 }, ignored: { games: 0, wins: 0 } };
  for (const r of rows || []) if (r.suggested) { const b = r.followed ? out.followed : out.ignored; b.games++; if (r.win) b.wins++; }
  return out;
}
// /lol-end-of-game/v1/eog-stats-block → { gameId, win } (teams first, the player's own WIN stat as a fallback).
function eogResult(eog) {
  if (!eog) return null;
  const team = (eog.teams || []).find((t) => t.isPlayerTeam);
  const win = team && typeof team.isWinningTeam === "boolean" ? team.isWinningTeam
    : eog.localPlayer && eog.localPlayer.stats && "WIN" in eog.localPlayer.stats ? !!eog.localPlayer.stats.WIN : undefined;
  return typeof win === "boolean" ? { gameId: eog.gameId || null, win } : null;
}

// ctx: { lcu, push, getConfig, file, names: (id) => name, log }
function attachRecap(ctx) {
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(ctx.file, "utf8")); if (!Array.isArray(rows)) rows = []; } catch {}
  let snap = null, lockedFor = null;
  const base = () => String(ctx.getConfig().crawler_url || "http://10.205.0.81:47900").replace(/\/+$/, "");
  ctx.lcu.on("event", async (e) => {
    if (e.uri === "/lol-champ-select/v1/session" && e.data && e.eventType !== "Delete") {
      const s = e.data, me = (s.myTeam || []).find((p) => p.cellId === s.localPlayerCellId) || {};
      const locked = (s.actions || []).flat().some((a) => a.actorCellId === s.localPlayerCellId && a.type === "pick" && a.completed);
      if (!locked || !me.championId || lockedFor === (s.gameId || me.championId)) return;
      lockedFor = s.gameId || me.championId;
      const role = String(me.assignedPosition || "").toLowerCase();
      snap = { gameId: s.gameId || null, role, picked: me.championId, suggested: null };
      if (!role) return; // blind/ARAM: nothing was suggested
      const ids = (team) => (team || []).map((p) => p.championId).filter((x) => x > 0);
      const bans = (s.actions || []).flat().filter((a) => a.type === "ban" && a.completed && a.championId > 0).map((a) => a.championId);
      const q = new URLSearchParams({ role, enemies: ids(s.theirTeam).join(","), allies: ids((s.myTeam || []).filter((p) => p.cellId !== s.localPlayerCellId)).join(","), bans: bans.join(",") }).toString();
      try {
        const r = await fetch(`${base()}/lol/draft?${q}`, { signal: AbortSignal.timeout(5000) });
        // Your own pick isn't sent as an ally, so it can be the top suggestion (then you "followed" it).
        const top = r.ok ? ((await r.json()).candidates || []).find((c) => !c.lowSample) : null;
        if (top) snap.suggested = Number(top.champion);
      } catch (err) { ctx.log("recap: draft", err.message); }
    } else if (e.uri === "/lol-gameflow/v1/gameflow-phase" && ["None", "Lobby", "Matchmaking"].includes(e.data)) {
      snap = null; lockedFor = null; // dodged or left: that draft never became a game
    } else if (e.uri === "/lol-gameflow/v1/gameflow-phase" && e.data === "EndOfGame" && snap) {
      const eog = await ctx.lcu.request("get", "/lol-end-of-game/v1/eog-stats-block").catch(() => null);
      const row = recapRow(snap, eogResult(eog && eog.data));
      snap = null; lockedFor = null;
      if (!row) return;
      rows = [...rows.filter((r) => !row.gameId || r.gameId !== row.gameId), row].slice(-200);
      try { fs.writeFileSync(ctx.file, JSON.stringify(rows)); } catch (err) { ctx.log("recap: save", err.message); }
      const n = ctx.names;
      ctx.push(`Recap: you picked ${n(row.picked)}${row.suggested ? row.followed ? " (the top suggestion)" : ` (suggested ${n(row.suggested)})` : ""}, ${row.win ? "win" : "loss"}`, row.win ? "success" : "info", "recap");
    }
  });
  return { list: () => ({ rows: rows.slice(-20).reverse(), record: hitRate(rows) }) };
}

module.exports = { attachRecap, recapRow, hitRate, eogResult };
