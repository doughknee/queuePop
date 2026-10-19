// Riot rate limiter: one sliding-window log per bucket. Buckets are the app limit per routing host
// ("na1", "americas") and the method limit per host+method. Limits start at the personal-key values
// and follow X-App-Rate-Limit / X-Method-Rate-Limit once Riot sends them; 429s block the bucket for
// Retry-After seconds.

const PERSONAL = "20:1,100:120";
// Riot counts arrival time, we count send time; pad every window so latency jitter can't push us over.
const PAD = 500;

const parse = (h) => h.split(",").map((p) => { const [n, s] = p.split(":").map(Number); return { n, ms: s * 1000 }; });

class Limiter {
  constructor({ now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), app = PERSONAL } = {}) {
    this.now = now;
    this.sleep = sleep;
    this.app = app;
    this.buckets = new Map();
  }

  bucket(key, limits) {
    if (!this.buckets.has(key)) this.buckets.set(key, { limits: limits ? parse(limits) : [], log: [], until: 0 });
    return this.buckets.get(key);
  }

  // Resolves when one request to host/method may be sent, and records it.
  async take(host, method) {
    const bs = [this.bucket(host, this.app), this.bucket(host + " " + method)];
    for (;;) {
      const t = this.now();
      let wait = 0;
      for (const b of bs) {
        wait = Math.max(wait, b.until - t);
        const max = Math.max(0, ...b.limits.map((l) => l.ms)) + PAD;
        while (b.log.length && b.log[0] <= t - max) b.log.shift();
        for (const { n, ms } of b.limits) {
          const inWindow = b.log.filter((x) => x > t - ms - PAD).length;
          if (inWindow >= n) wait = Math.max(wait, b.log[b.log.length - n] + ms + PAD - t);
        }
      }
      if (wait <= 0) { for (const b of bs) b.log.push(t); return; }
      await this.sleep(wait);
    }
  }

  // Feed every response's headers back in.
  update(host, method, headers, status) {
    const app = headers.get("x-app-rate-limit"), meth = headers.get("x-method-rate-limit");
    if (app) this.bucket(host).limits = parse(app);
    if (meth) this.bucket(host + " " + method).limits = parse(meth);
    if (status === 429) {
      const type = headers.get("x-rate-limit-type");
      const b = this.bucket(type === "application" ? host : host + " " + method);
      // "service" 429s often come without Retry-After; back off 5s.
      b.until = this.now() + (Number(headers.get("retry-after")) || 5) * 1000;
    }
  }

  state() {
    const t = this.now();
    return Object.fromEntries([...this.buckets].map(([k, b]) => [k, {
      limits: b.limits.map(({ n, ms }) => ({ limit: n, windowSec: ms / 1000, used: b.log.filter((x) => x > t - ms).length })),
      blockedSec: Math.max(0, Math.ceil((b.until - t) / 1000)),
    }]));
  }
}

module.exports = { Limiter };
