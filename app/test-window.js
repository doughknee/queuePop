// node test-window.js — saved window bounds only come back when they land on a screen (app/window-state.js, DONI-539).
const assert = require("assert");
const { fitBounds } = require("./window-state");

const one = [{ x: 0, y: 0, width: 1920, height: 1040 }];
const two = [...one, { x: 1920, y: 0, width: 2560, height: 1400 }];
assert.deepStrictEqual(fitBounds({ x: 100, y: 50, width: 1400, height: 900 }, one), { x: 100, y: 50, width: 1400, height: 900 });
assert.deepStrictEqual(fitBounds({ x: 2000, y: 100, width: 1400, height: 900 }, two), { x: 2000, y: 100, width: 1400, height: 900 });
assert.strictEqual(fitBounds({ x: 2000, y: 100, width: 1400, height: 900 }, one), null); // second monitor unplugged
assert.strictEqual(fitBounds({ x: 100, y: -500, width: 1400, height: 900 }, one), null); // title bar above the screen
assert.strictEqual(fitBounds({ x: 1850, y: 10, width: 1400, height: 900 }, one), null); // only a 70 px sliver visible
assert.deepStrictEqual(fitBounds({ x: 0, y: 0, width: 300, height: 200 }, one), { x: 0, y: 0, width: 1280, height: 720 }); // clamped
assert.strictEqual(fitBounds({}, one), null);
assert.strictEqual(fitBounds(null, one), null);
console.log("test-window ok");
