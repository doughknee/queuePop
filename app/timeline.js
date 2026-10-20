// Queue timeline (DONI-423): "how long do I have?" for the player who stepped away. At most three pushes per queue:
// in queue with an ETA, match accepted with when the game starts, and 90 s before that, "come back". The phone also
// shows a live countdown (companion /api/status timeline). Pushes go through the activity feed (the phone sees every
// one) and notifier.alert("timeline") for Windows/Discord when that alert is ticked (off by default).
const TURN_S = 30, FINALIZE_S = 30, COME_BACK_S = 90;

// Champ select seconds left from a /lol-champ-select/v1/session: the current timer, plus 30 s per turn still to come,
// plus finalization. Pure; app/test-timeline.js checks it.
function csRemaining(session) {
  const t = (session && session.timer) || {}, left = Math.max(0, Number(t.adjustedTimeLeftInPhase) || 0) / 1000;
  if (t.phase === "FINALIZATION") return Math.round(left);
  const turns = ((session && session.actions) || []).filter((group) => Array.isArray(group) && group.some((a) => !a.completed)).length;
  const planning = t.phase === "PLANNING" ? TURN_S : 0; // the current timer is planning; every turn is still ahead
  return Math.round(left + planning + Math.max(0, turns - (t.phase === "PLANNING" ? 0 : 1)) * TURN_S + FINALIZE_S);
}

const mins = (s) => Math.max(1, Math.round(s / 60));
// One step of the timeline → {key, text, seconds} or null. key names the push (each fires once per queue).
function timelineMessage(step, { estimateS = 0, csLeftS = 0, loadS = 60 } = {}) {
  if (step === "queue") return estimateS > 0 ? { key: "queue", text: `In queue. About ${mins(estimateS)} min to a match.`, seconds: Math.round(estimateS) } : null;
  const toGame = csLeftS + loadS;
  if (step === "accepted") return { key: "accepted", text: `Match accepted. Your game starts in about ${mins(toGame)} min.`, seconds: Math.round(toGame) };
  if (step === "soon") return toGame <= COME_BACK_S ? { key: "soon", text: "About 90 seconds until your game starts: come back.", seconds: Math.round(toGame) } : null;
  return null;
}

// ctx: { lcu, push, notifier, getConfig }
function attachTimeline(ctx) {
  let sent = new Set(), now = null; // now = {text, until (ms epoch)} for the phone's countdown
  const loadS = () => Math.min(300, Math.max(0, Number(ctx.getConfig().timeline_load_seconds) || 60));
  const fire = (m) => {
    if (!m || sent.has(m.key)) return;
    sent.add(m.key);
    now = { text: m.text, until: Date.now() + m.seconds * 1000, step: m.key };
    ctx.push(m.text, m.key === "soon" ? "danger" : "info", "timeline");
    ctx.notifier.alert("timeline", "queuePop", m.text, "Queue timeline").catch(() => {});
  };
  ctx.lcu.on("event", async (e) => {
    if (e.eventType === "Delete") return;
    if (e.uri === "/lol-gameflow/v1/gameflow-phase") {
      if (["None", "Lobby", "EndOfGame"].includes(e.data)) { sent = new Set(); now = null; }
      if (e.data === "InProgress") now = null;
      if (e.data === "Matchmaking" && sent.has("accepted")) { sent = new Set(); now = null; } // dodged: a fresh queue
      if (e.data === "Matchmaking" && !sent.has("queue")) {
        const r = await ctx.lcu.request("get", "/lol-matchmaking/v1/search").catch(() => null);
        const d = (r && r.data) || {};
        fire(timelineMessage("queue", { estimateS: (Number(d.estimatedQueueTime) || 0) - (Number(d.timeInQueue) || 0) }));
      }
    } else if (e.uri === "/lol-champ-select/v1/session" && e.data) {
      const csLeftS = csRemaining(e.data);
      if (!sent.has("accepted")) fire(timelineMessage("accepted", { csLeftS, loadS: loadS() }));
      else if (now) now.until = Date.now() + (csLeftS + loadS()) * 1000; // keep the phone's countdown honest as picks happen
      fire(timelineMessage("soon", { csLeftS, loadS: loadS() }));
    }
  });
  return { status: () => (now && now.until > Date.now() - 5000 ? { ...now } : null) };
}

module.exports = { attachTimeline, timelineMessage, csRemaining };
