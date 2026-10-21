// node test-recorder-video.js — ffmpeg command builders, clip windows and the size cap (app/recorder-video.js, DONI-523 Q21).
// Never runs a capture.
const assert = require("assert");
const { captureArgs, clipWindows, clipArgs, chooseDeletions, pickEncoder, listedEncoders, ownVideos } = require("./recorder-video");

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
// The size cap only sees the recorder's own videos (the folder may be your Videos folder).
assert.deepStrictEqual(ownVideos(["NA1_1.json", "NA1_1.mkv", "NA1_1-clip2.mp4", "obs 2024.mkv", "NA1_2.mkv", "x.json", "x.mp4", "555.json", "555.mkv"]),
  ["NA1_1.mkv", "NA1_1-clip2.mp4", "555.mkv"]);
console.log("test-recorder-video ok");
