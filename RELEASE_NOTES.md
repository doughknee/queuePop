The biggest update queuePop has ever shipped: a champ select that fights for your role, a plan for every position, and a ground-up redesign of the whole app. Here's the tour.

## 🥇 It fights for your role now

Autofilled again? Tell queuePop your role order — Mid first, then Top, then Jungle — and the moment champ select starts, it quietly asks the right teammate to swap. If they decline, it moves down your list and asks the next one. **Pick order works the same way**: prefer picking last so you can counter? It trades draft spots toward the back for you. Set both once in Match settings, drag the chips into your order, and never beg in chat again.

## 🗺️ A real game plan, for every role

The Champ Select page is a full planner now. Build an ordered pick list per role — if your #1 is banned or taken, queuePop takes your #2, then your #3. Add bans, drag everything into order, and give any champ its own loadout. When your list runs out, a fallback of your choosing takes over: most-played, least-played, rustiest, closest to a mastery level, or pure chaos.

## 🔮 Locks in more than the champ

- **Auto runes** — every champ you lock gets the client's recommended rune page, written to one managed page. Zero per-champ setup, your own pages untouched.
- **Default summoner spells per role** — jungle always gets Smite, support always gets your comfort picks, unless a champ's loadout says otherwise.
- **Hide your pick intent** until you lock, so nobody ban-snipes your hover.
- **ARAM upgrades**: a courtesy delay before bench grabs (let teammates look first) and a never-play list for the champs you refuse to touch.

## 🎨 A whole new queuePop

The app has been rebuilt around four simple pages — **Home**, **Champ Select**, **Alerts**, and **About**. Your activity feed and queue picks live on Home with a plan summary you can click straight into; every setting sits where you'd expect and explains itself with a little **?**. Same Hextech soul, none of the old settings maze.

## 🔔 Alerts that answer to you

The new Alerts page puts every way queuePop reaches you in one place. Choose exactly which moments ping you — queue pops, champ select starting, the game going live, or your client disconnecting. Every channel has a test button and a "last sent" receipt so you *know* it works. The phone companion shows its live status and how many phones are connected, and Discord tucks neatly behind a toggle.

## ⏱️ Accept on your terms

New on Home: **Wait before accepting**. Your alerts still fire the instant the queue pops, but queuePop holds the accept for a few seconds of breathing room — time to get back to the desk, or to decline by hand if you need out. If anyone else declines during the wait, it stands down.

## 🏆 Your Service Record

The About page now keeps score: ready checks accepted, champ selects played, picks locked, bench grabs, trades made. Watch the numbers climb, game after game.

## 👀 Watch it work

During champ select, the live view narrates every move as it happens — locks, bench grabs, swaps, runes — and trade chips finally speak plainly: *requesting…*, *accepted*, *declined — cooldown*.

## ✨ Also in this update

- Release notes live right here in the app now (hi!).
- Updates show their download progress and relaunch reliably when they finish.
- The Home queue picker collapsed into tidy rows with live "selected" counts.
- The window opens at a comfier size, every menu shares one style, and a hundred small things line up.

## 🔧 For the curious

Under the hood: the UI was rebuilt as plain-script modules, every new setting is an additive config key (old configs upgrade in place, and downgrade safely), the self-update flow was hardened against relaunch races with a diagnostic `update.log`, and the whole release was smoke-tested over a live debugging harness. The full story is in the commit history.
