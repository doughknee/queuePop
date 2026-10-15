// node test-lcu.js — asserts the lockfile parser on a fixture.
const assert = require("assert");
const { parseLockfile } = require("./lcu");

const c = parseLockfile("LeagueClient:12345:54321:s3cr3t-Pass_word:https\n");
assert.deepStrictEqual(c, { name: "LeagueClient", pid: 12345, port: 54321, password: "s3cr3t-Pass_word", protocol: "https" });
assert.throws(() => parseLockfile(""));
assert.throws(() => parseLockfile("LeagueClient:1:notaport:pw:https"));
console.log("test-lcu ok");
