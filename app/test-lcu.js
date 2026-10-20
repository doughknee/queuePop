// node test-lcu.js — asserts the lockfile parser on a fixture.
const assert = require("assert");
const { parseLockfile } = require("./lcu");

const c = parseLockfile("LeagueClient:12345:54321:s3cr3t-Pass_word:https\n");
assert.deepStrictEqual(c, { name: "LeagueClient", pid: 12345, port: 54321, password: "s3cr3t-Pass_word", protocol: "https" });
assert.throws(() => parseLockfile(""));
assert.throws(() => parseLockfile("LeagueClient:1:notaport:pw:https"));
// DONI-532: a socket whose client stopped answering is dropped after two failed checks, not one.
const { LCU } = require("./lcu");
(async () => {
  const lcu = new LCU();
  let terminated = 0, up = false;
  const ws = { terminate: () => terminated++ };
  lcu.ws = ws;
  lcu.request = () => (up ? Promise.resolve({ status: 200 }) : Promise.reject(new Error("ECONNREFUSED")));
  lcu._watch(ws); clearInterval(ws.probe);
  await ws.check(); assert.strictEqual(terminated, 0);
  up = true; await ws.check(); up = false; await ws.check(); assert.strictEqual(terminated, 0); // a success resets the count
  await ws.check(); assert.strictEqual(terminated, 1);
  console.log("test-lcu ok");
})().catch((e) => { console.error(e); process.exit(1); });
