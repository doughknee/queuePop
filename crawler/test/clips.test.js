// Published clips (src/clips.js): auth, publish with a stubbed transcode, list, file serving with ranges, proxy rules, unpublish.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { open } = require("../src/db");
const { Limiter } = require("../src/limiter");
const { createServer } = require("../src/server");
const { createStore, transcodeArgs, cleanMeta } = require("../src/clips");

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qpclips-"));
  const store = createStore({ kind: "local", dir, publicBase: "https://clips.example.test" });
  // stand-in for ffmpeg: the "web copy" is the upload itself, the poster a few bytes
  const transcode = async (input, outMp4, outJpg) => { fs.copyFileSync(input, outMp4); fs.writeFileSync(outJpg, "jpg"); };
  const db = open(":memory:");
  const api = createServer({ db, limiter: new Limiter(), version: "test", adminToken: "tok", clips: { store, transcode } });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${api.address().port}`;
  return { dir, db, url, close: () => { api.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const BODY = Buffer.from("0123456789".repeat(100)); // 1000 bytes of "video"

test("publish, list, serve with ranges, unpublish", async () => {
  const t = await setup();
  try {
    const pub = (token, qs = "champion=81&label=Killed%20Sivir&role=bottom&patch=16.21&match=NA1_1&duration=15") =>
      fetch(`${t.url}/admin/clips?${qs}`, { method: "POST", headers: token ? { authorization: "Bearer " + token } : {}, body: BODY });
    assert.strictEqual((await pub()).status, 401);
    assert.strictEqual((await pub("nope")).status, 401);
    assert.strictEqual((await pub("tok", "champion=abc")).status, 400);
    const r = await pub("tok");
    assert.strictEqual(r.status, 200);
    const { clip } = await r.json();
    assert.match(clip.id, /^[a-f0-9]{12}$/);
    assert.strictEqual(clip.url, `https://clips.example.test/${clip.id}.mp4`);
    assert.strictEqual(clip.poster, `https://clips.example.test/${clip.id}.jpg`);
    assert.deepStrictEqual([clip.champion, clip.label, clip.role, clip.patch, clip.matchId, clip.duration, clip.size], [81, "Killed Sivir", "bottom", "16.21", "NA1_1", 15, 1000]);
    assert.ok(fs.existsSync(path.join(t.dir, clip.id + ".mp4")) && fs.existsSync(path.join(t.dir, clip.id + ".jpg")));

    const list = await (await fetch(`${t.url}/lol/clips?champion=81`)).json();
    assert.deepStrictEqual([list.clips.length, list.clips[0].id, list.total, list.bytes], [1, clip.id, 1, 1000]);
    assert.strictEqual((await (await fetch(`${t.url}/lol/clips?champion=103`)).json()).clips.length, 0);

    const full = await fetch(`${t.url}/clips/${clip.id}.mp4`);
    assert.deepStrictEqual([full.status, full.headers.get("content-type"), full.headers.get("accept-ranges"), (await full.arrayBuffer()).byteLength], [200, "video/mp4", "bytes", 1000]);
    const part = await fetch(`${t.url}/clips/${clip.id}.mp4`, { headers: { range: "bytes=10-19" } });
    assert.deepStrictEqual([part.status, part.headers.get("content-range"), Buffer.from(await part.arrayBuffer()).toString()], [206, "bytes 10-19/1000", "0123456789"]);
    // the file route works through a proxy; the admin routes never do
    assert.strictEqual((await fetch(`${t.url}/clips/${clip.id}.jpg`, { headers: { "x-forwarded-for": "8.8.8.8" } })).status, 200);
    assert.strictEqual((await fetch(`${t.url}/admin/clips?champion=81`, { method: "POST", headers: { authorization: "Bearer tok", "x-forwarded-for": "8.8.8.8" }, body: BODY })).status, 403);
    assert.strictEqual((await fetch(`${t.url}/clips/..%2Fcrawler.db`)).status, 404);
    assert.strictEqual((await fetch(`${t.url}/clips/zzzzzzzzzzzz.mp4`)).status, 404);

    assert.strictEqual((await fetch(`${t.url}/admin/clips/${clip.id}`, { method: "DELETE" })).status, 401);
    const del = await fetch(`${t.url}/admin/clips/${clip.id}`, { method: "DELETE", headers: { authorization: "Bearer tok" } });
    assert.deepStrictEqual(await del.json(), { ok: true, removed: true });
    assert.ok(!fs.existsSync(path.join(t.dir, clip.id + ".mp4")) && !fs.existsSync(path.join(t.dir, clip.id + ".jpg")));
    assert.strictEqual((await (await fetch(`${t.url}/lol/clips?champion=81`)).json()).clips.length, 0);
  } finally { t.close(); }
});

test("clip details are cleaned; the web copy keeps only the mix track at 720p", () => {
  assert.strictEqual(cleanMeta({ champion: "0" }), null);
  const m = cleanMeta({ champion: "81", label: "x".repeat(200) + "\u0007", duration: "9999" });
  assert.deepStrictEqual([m.game, m.label.length, m.duration], ["lol", 80, 600]);
  const a = transcodeArgs("in.mp4", "out.mp4").join(" ");
  assert.match(a, /-map 0:v:0 -map 0:a:0\?/);
  assert.match(a, /min\(720,ih\)/);
  assert.match(a, /\+faststart/);
});

test("without a clip store the routes say so and the list is empty", async () => {
  const db = open(":memory:");
  const api = createServer({ db, limiter: new Limiter(), version: "test", adminToken: "tok" });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${api.address().port}`;
  try {
    assert.strictEqual((await fetch(`${url}/admin/clips?champion=81`, { method: "POST", headers: { authorization: "Bearer tok" }, body: BODY })).status, 503);
    assert.deepStrictEqual(await (await fetch(`${url}/lol/clips?champion=81`)).json(), { clips: [], total: 0, bytes: 0 });
  } finally { api.close(); }
});
