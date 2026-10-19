const test = require("node:test");
const assert = require("node:assert");
const { Limiter } = require("../src/limiter");

// Fake clock: sleepers queue up; run() lets everything runnable settle, then jumps to the next timer.
function fake() {
  let t = 1_000_000;
  const timers = [];
  const l = new Limiter({ now: () => t, sleep: (ms) => new Promise((r) => timers.push({ at: t + ms, r })) });
  l.run = async (p) => {
    let done = false;
    p.then(() => { done = true; });
    for (;;) {
      await new Promise((r) => setImmediate(r));
      if (done) return p;
      timers.sort((a, b) => a.at - b.at);
      const x = timers.shift();
      t = Math.max(t, x.at);
      x.r();
    }
  };
  return l;
}

function assertWindows(times) {
  times.sort((a, b) => a - b);
  for (let i = 0; i + 100 < times.length; i++) assert.ok(times[i + 100] - times[i] >= 120000, `>100 calls in 120s at ${i}`);
  for (let i = 0; i + 20 < times.length; i++) assert.ok(times[i + 20] - times[i] >= 1000, `>20 calls in 1s at ${i}`);
}

test("never more than 100 calls per 120s or 20 per 1s, sequential", async () => {
  const l = fake();
  const times = [];
  await l.run((async () => { for (let i = 0; i < 600; i++) { await l.take("na1", "m"); times.push(l.now()); } })());
  assertWindows(times);
  // and it isn't just slow: 600 calls fit in ~6 windows
  assert.ok(times.at(-1) - times[0] < 6 * 121000);
});

test("never more than 100 calls per 120s, 300 concurrent callers", async () => {
  const l = fake();
  const times = [];
  await l.run(Promise.all(Array.from({ length: 300 }, () => l.take("na1", "m").then(() => times.push(l.now())))));
  assertWindows(times);
});

test("headers tighten limits and 429 Retry-After blocks the bucket", async () => {
  const l = fake();
  const h = (o) => new Headers(o);
  await l.run(l.take("na1", "ids"));
  l.update("na1", "ids", h({ "x-method-rate-limit": "2:10" }), 200);
  await l.run(l.take("na1", "ids"));
  const t0 = l.now();
  await l.run(l.take("na1", "ids")); // third call must wait out the 2/10s method window
  assert.ok(l.now() - t0 >= 9000);
  l.update("na1", "ids", h({ "retry-after": "7", "x-rate-limit-type": "application" }), 429);
  const t1 = l.now();
  await l.run(l.take("na1", "other"));
  assert.ok(l.now() - t1 >= 7000);
});
