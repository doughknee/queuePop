// node test-recorder-video.js — ffmpeg command builders, clip windows and the size cap (app/recorder-video.js, DONI-523 Q21).
// Never runs a capture.
const assert = require("assert");
const { chooseBackend, clipRequest, placeClips, createVideo, captureArgs, clipWindows, clipArgs, chooseDeletions, pickEncoder, listedEncoders, ownVideos } = require("./recorder-video");

assert.strictEqual(pickEncoder(" V....D h264_amf  AMD AMF H.264\n V....D h264_nvenc NVIDIA NVENC H.264"), "h264_nvenc");
assert.strictEqual(pickEncoder(" V....D h264_qsv  H.264 (Intel Quick Sync)"), "h264_qsv");
assert.strictEqual(pickEncoder(" V....D libx264"), "libx264");
assert.strictEqual(pickEncoder(""), "libx264");
// what probe() test-encodes, in order (a full build lists NVENC on AMD cards too), always ending at libx264
assert.deepStrictEqual(listedEncoders(" V....D h264_amf\n V....D h264_nvenc\n V....D h264_qsv"), ["h264_nvenc", "h264_amf", "h264_qsv", "libx264"]);
assert.deepStrictEqual(listedEncoders(""), ["libx264"]);

const a = captureArgs({ encoder: "h264_nvenc", preset: "1080p60", out: "C:\\rec\\NA1_1.mkv" });
const fi = a.indexOf("-filter_complex");
assert.strictEqual(a[fi + 1], "ddagrab=output_idx=0:framerate=60,hwdownload,format=bgra,scale=-2:1080,format=nv12");
assert.ok(a.includes("h264_nvenc") && a.join(" ").endsWith("-g 120 -f matroska C:\\rec\\NA1_1.mkv"));
const b = captureArgs({ encoder: "libx264", preset: "720p30", out: "x.mkv" });
assert.ok(b.join(" ").includes("framerate=30,hwdownload,format=bgra,scale=-2:720,format=yuv420p") && b.includes("ultrafast"));
assert.ok(captureArgs({ encoder: "nope", preset: "nope", out: "x.mkv" }).includes("libx264")); // unknown → safe defaults

// Clip windows: kill = 10 s before, 5 after; overlapping ones merge; clamped to the video; offset maps game time to video time;
// events without a clip span (end) are skipped.
const ev = [{ id: 1, t: 100, type: "kill" }, { id: 2, t: 104, type: "kill" }, { id: 3, t: 300, type: "death" }, { id: 4, t: 5, type: "kill" },
  { id: 5, t: 700, type: "end" }, { id: 6, t: 1185, type: "objective" }];
assert.deepStrictEqual(clipWindows(ev, 20, 1210).map((w) => [w.start, w.end, w.ids.join("+")]),
  [[15, 30, "4"], [110, 129, "1+2"], [310, 323, "3"], [1195, 1210, "6"]]);
assert.deepStrictEqual(clipWindows([{ id: 1, t: 0, type: "kill" }], 0, 100).map((w) => [w.start, w.end]), [[0, 5]]); // clamped at 0
assert.strictEqual(clipWindows([{ id: 1, t: 500, type: "kill" }], 0, 100).length, 0); // past the end of the video: no clip
assert.deepStrictEqual(clipArgs("in.mkv", 110, 129, "out.mp4"), ["-hide_banner", "-loglevel", "error", "-y", "-ss", "110", "-i", "in.mkv", "-t", "19", "-c", "copy", "-avoid_negative_ts", "make_zero", "out.mp4"]);

// Size cap: oldest first until it fits.
const GB = 1024 ** 3;
assert.deepStrictEqual(chooseDeletions([{ path: "new", size: 3 * GB, mtime: 3 }, { path: "old", size: 2 * GB, mtime: 1 }, { path: "mid", size: 2 * GB, mtime: 2 }], 4 * GB), ["old", "mid"]);
assert.deepStrictEqual(chooseDeletions([{ path: "a", size: GB, mtime: 1 }], 4 * GB), []);
// favourites are skipped: the next oldest goes instead
assert.deepStrictEqual(chooseDeletions([{ path: "new", size: 3 * GB, mtime: 3 }, { path: "old", size: 2 * GB, mtime: 1 }, { path: "mid", size: 2 * GB, mtime: 2 }], 4 * GB, new Set(["old"])), ["mid", "new"]);
// The size cap only sees the recorder's own videos (the folder may be your Videos folder).
assert.deepStrictEqual(ownVideos(["NA1_1.json", "NA1_1.mkv", "NA1_1-clip2.mp4", "obs 2024.mkv", "NA1_2.mkv", "x.json", "x.mp4", "555.json", "555.mkv"]),
  ["NA1_1.mkv", "NA1_1-clip2.mp4", "555.mkv"]);
// Engine: the companion's Overwolf recorder when it says ready, else ffmpeg, else nothing.
assert.strictEqual(chooseBackend({ recorder: { ready: true } }, { found: true }), "overwolf");
assert.strictEqual(chooseBackend({ recorder: { ready: false } }, { found: true }), "ffmpeg");
assert.strictEqual(chooseBackend({ app: "queuepop-overlay" }, { found: false }), null); // an old companion without a recorder
assert.strictEqual(chooseBackend(null, { found: true }), "ffmpeg");

// Live clip requests: game time 100 happened at wall 1_000_000 (clock: wall 900_000 = game time 0). The kill reaches us
// 2 s late, so 12 s of past and 3 s still to come; capped at the 30 s buffer and at how long the recording has run;
// too old for the buffer (a backlog after a restart) or no span: no clip.
const clock = { wall: 900000, gameTime: 0 };
assert.deepStrictEqual(clipRequest({ t: 100, type: "kill" }, clock, 1002000, 0), { pastSeconds: 12, afterSeconds: 3 });
assert.deepStrictEqual(clipRequest({ t: 100, type: "death" }, clock, 1000000, 0), { pastSeconds: 10, afterSeconds: 3 });
assert.deepStrictEqual(clipRequest({ t: 100, type: "multikill" }, clock, 1020000, 0), { pastSeconds: 29, afterSeconds: 0 });
assert.deepStrictEqual(clipRequest({ t: 100, type: "kill" }, clock, 1000000, 996000), { pastSeconds: 4, afterSeconds: 5 }); // recording 4 s old
assert.strictEqual(clipRequest({ t: 100, type: "kill" }, clock, 1060000, 0), null);
assert.strictEqual(clipRequest({ t: 100, type: "end" }, clock, 1000000, 0), null);
assert.strictEqual(clipRequest({ t: 100, type: "assist" }, clock, 1000000, 0), null); // live clips: kills, multikills, deaths, objectives
assert.deepStrictEqual(clipRequest({ t: 100, type: "kill" }, null, 1000000, 0), { pastSeconds: 10, afterSeconds: 5 }); // no clock yet
assert.deepStrictEqual(placeClips([{ at: 15000, ms: 15000, file: "c" }], 5000), [{ at: 15000, ms: 15000, file: "c", start: 10, end: 25 }]);

// A whole Overwolf game against a stub companion: start, two kills in one clip, a death, stop. The recording JSON gets
// the shape Recordings reads: video {file, length, offset}, clips [{file, start, end, types, ids}].
(async () => {
  const calls = [], saved = {};
  let n = 0;
  const stub = async (p, body) => {
    calls.push([p, body]);
    if (p === "/health") return { recorder: { ready: true, encoder: "h264_texture_amf" } };
    if (p === "/recorder/start") return { ok: true, encoder: "h264_texture_amf", width: 2580, height: 1080, fps: 60, startEpoch: 1000 };
    if (p === "/recorder/clip") return n++ < 2 ? { ok: true, file: "C:/rec/NA1_9-clip1.mp4", startTimeEpoch: 60000, duration: 20000 } : { ok: true, file: "C:/rec/NA1_9-clip2.mp4", startTimeEpoch: 200000, duration: 13000 };
    if (p === "/recorder/stop") return { ok: true, file: "C:/rec/NA1_9.mp4", duration: 600000, startTimeEpoch: 4000 };
  };
  const v = createVideo({ getConfig: () => ({ recorder: { enabled: true, video: true, preset: "1080p60" } }), dir: () => "C:/rec", log() {}, push() {},
    recorder: { update: (id, patch) => Object.assign(saved, patch), list: () => [] }, companion: stub, probe: async () => ({ found: false }) });
  const rec = { matchId: "NA1_9", game: "league", events: [], clock: { wall: Date.now(), gameTime: 0 } };
  await v.start(rec);
  assert.strictEqual(calls[1][0], "/recorder/start");
  assert.strictEqual(calls[1][1].processName, "League of Legends.exe");
  assert.deepStrictEqual([calls[1][1].height, calls[1][1].fps], [1080, 60]);
  v.onEvents(rec, [{ id: 1, t: 0, type: "kill" }, { id: 2, t: 0, type: "kill" }, { id: 3, t: 0, type: "end" }]);
  v.onEvents(rec, [{ id: 4, t: 0, type: "death" }]);
  await v.stop(rec);
  assert.strictEqual(calls.filter((c) => c[0] === "/recorder/clip").length, 3); // end has no clip
  assert.deepStrictEqual({ file: saved.video.file, length: saved.video.length, engine: saved.video.engine }, { file: "C:/rec/NA1_9.mp4", length: 600, engine: "overwolf" });
  assert.ok(Math.abs(saved.video.offset - (rec.clock.wall - 4000) / 1000) < 0.2); // video time at game time 0, from the first frame
  assert.deepStrictEqual(saved.clips.map((c) => [c.file, c.start, c.end, c.types.join("+"), c.ids.join("+")]),
    [["C:/rec/NA1_9-clip1.mp4", 56, 76, "kill+kill", "1+2"], ["C:/rec/NA1_9-clip2.mp4", 196, 209, "death", "4"]]);
  // On ow-electron a ready in-process recorder (ow-recorder.js) takes the game; the companion is never asked.
  const used = [], remote = [];
  const ow = { status: () => ({ ready: true, encoder: "obs_x264" }),
    start: async (b) => (used.push(["start", b.processName]), { ok: true, encoder: "obs_x264", startEpoch: 1000 }),
    clip: async () => (used.push(["clip"]), { ok: true, file: "C:/rec/D_1-clip1.mp4", startTimeEpoch: 5000, duration: 15000 }),
    stop: async () => (used.push(["stop"]), { ok: true, file: "C:/rec/D_1.mp4", duration: 60000, startTimeEpoch: 1000 }) };
  const saved2 = {};
  const v2 = createVideo({ getConfig: () => ({ recorder: { enabled: true, video: true } }), dir: () => "C:/rec", log() {}, push() {},
    recorder: { update: (id, patch) => Object.assign(saved2, patch), list: () => [] }, ow, companion: async (p) => (remote.push(p), null), probe: async () => ({ found: false }) });
  assert.strictEqual((await v2.engine()).inProcess, true);
  const rec2 = { matchId: "D_1", game: "deadlock", events: [], clock: null };
  await v2.start(rec2);
  v2.onEvents(rec2, [{ id: 1, t: 0, type: "kill" }]);
  await v2.stop(rec2);
  assert.deepStrictEqual(used, [["start", "deadlock.exe"], ["clip"], ["stop"]]);
  assert.deepStrictEqual(remote, []);
  assert.deepStrictEqual([saved2.video.file, saved2.clips[0].start, saved2.clips[0].end], ["C:/rec/D_1.mp4", 4, 19]);
  console.log("test-recorder-video ok");
})().catch((e) => { console.error(e); process.exit(1); });
