// Store edition (DONI-704): the build that goes through Riot's and Overwolf's review. Riot's General Policies say a product
// "should not remove game decisions, but may highlight decisions that are important", and an accepted queue needs you at your
// PC for champ select, or nine players lose theirs. So this build calls you back and highlights; it never accepts a queue,
// locks in a champion, grabs from the ARAM bench, sends trade requests or steps away for you. Decline from the phone stays (it
// can't strand a lobby). The personal build (from source, or `npm run dist`) keeps everything. `dist:ow` sets package.json
// `edition: "store"`; QP_EDITION=store tries it from source.
const STORE = process.env.QP_EDITION === "store" || (() => { try { return require("./package.json").edition === "store"; } catch { return false; } })();

// What the automation may do. Pure; app/test-edition.js checks it.
const rules = (store) => ({ autoAccept: !store, lockIn: !store, benchSwap: !store, trades: !store, steppingAway: !store });

// The champ select settings the store edition acts on: picks and bans are hovered from your plan, never locked; no bench grabs,
// no trade requests. Pure; app/test-edition.js checks it.
function storeChampSelect(cs) {
  const s = cs || {};
  return { ...s, trades: { ...(s.trades || {}), enabled: false }, aram: { ...(s.aram || {}), enabled: false, auto_mastery: false } };
}

module.exports = { STORE, RULES: rules(STORE), rules, storeChampSelect, edition: STORE ? "store" : "full" };
