// node test-steam.js: the Deadlock account from Steam's loginusers.vdf (app/steam-account.js).
const assert = require("assert");
const { accountFromVdf } = require("./steam-account");
const vdf = (users) => `"users"\n{\n${users.map(([id, recent, ts]) => `\t"${id}"\n\t{\n\t\t"AccountName"\t\t"x"\n\t\t"MostRecent"\t\t"${recent}"\n\t\t"Timestamp"\t\t"${ts}"\n\t}\n`).join("")}}`;
assert.strictEqual(accountFromVdf(vdf([["76561197960265729", "1", "5"]])), "1"); // id64 minus the base
assert.strictEqual(accountFromVdf(vdf([["76561198000000000", "0", "9"], ["76561198000000123", "1", "1"]])), "39734395"); // MostRecent wins
assert.strictEqual(accountFromVdf(vdf([["76561198000000000", "0", "9"], ["76561198000000123", "0", "1"]])), "39734272"); // else the newest
assert.strictEqual(accountFromVdf(""), "");
console.log("test-steam ok");
