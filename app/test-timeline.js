// node test-timeline.js — queue timeline messages and the champ select clock (app/timeline.js, DONI-423).
const assert = require("assert");
const { EventEmitter } = require("events");
const { timelineMessage: M, csRemaining, attachTimeline } = require("./timeline");

assert.strictEqual(M("queue", { estimateS: 0 }), null); // no estimate, no push
assert.strictEqual(M("queue", { estimateS: 170 }).text, "In queue. About 3 min to a match.");
assert.strictEqual(M("queue", { estimateS: 20 }).text, "In queue. About 1 min to a match."); // never "0 min"
assert.deepStrictEqual(M("accepted", { csLeftS: 150, loadS: 60 }), { key: "accepted", text: "Match accepted. Your game starts in about 4 min.", seconds: 210 });
assert.strictEqual(M("soon", { csLeftS: 120, loadS: 60 }), null);
assert.strictEqual(M("soon", { csLeftS: 25, loadS: 60 }).key, "soon");

const turn = (done) => [{ completed: done }];
assert.strictEqual(csRemaining({ timer: { phase: "FINALIZATION", adjustedTimeLeftInPhase: 20000 } }), 20);
assert.strictEqual(csRemaining({ timer: { phase: "BAN_PICK", adjustedTimeLeftInPhase: 25000 }, actions: [turn(true), turn(false), turn(false), turn(false)] }), 25 + 2 * 30 + 30);
assert.strictEqual(csRemaining({ timer: { phase: "PLANNING", adjustedTimeLeftInPhase: 10000 }, actions: [turn(false), turn(false)] }), 10 + 30 + 2 * 30 + 30);
assert.strictEqual(csRemaining({}), 30);

// A whole queue: three pushes at most, once each, and a fresh set for the next queue.
(async () => {
  const lcu = new EventEmitter(), pushed = [];
  lcu.request = async () => ({ status: 200, data: { estimatedQueueTime: 200, timeInQueue: 20 } });
  const tl = attachTimeline({ lcu, push: (m, l, k) => pushed.push(k + ":" + m), notifier: { alert: async () => {} }, getConfig: () => ({ timeline_load_seconds: 60 }) });
  const ev = (uri, data) => lcu.emit("event", { uri, eventType: "Update", data });
  ev("/lol-gameflow/v1/gameflow-phase", "Matchmaking"); await new Promise((r) => setImmediate(r));
  ev("/lol-gameflow/v1/gameflow-phase", "Matchmaking"); await new Promise((r) => setImmediate(r));
  const cs = (left, phase = "BAN_PICK") => ev("/lol-champ-select/v1/session", { timer: { phase, adjustedTimeLeftInPhase: left }, actions: [turn(false), turn(false)] });
  cs(30000); cs(28000); cs(20000, "FINALIZATION");
  assert.deepStrictEqual(pushed.map((p) => p.split(".")[0]), ["timeline:In queue", "timeline:Match accepted", "timeline:About 90 seconds until your game starts: come back"]);
  assert.ok(tl.status().until > Date.now());
  ev("/lol-gameflow/v1/gameflow-phase", "EndOfGame");
  assert.strictEqual(tl.status(), null);
  ev("/lol-gameflow/v1/gameflow-phase", "Matchmaking"); await new Promise((r) => setImmediate(r));
  assert.strictEqual(pushed.length, 4); // next queue starts over
  console.log("test-timeline ok");
})().catch((e) => { console.error(e); process.exit(1); });
