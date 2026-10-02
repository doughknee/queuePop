If you've seen **two Ezreals** in the champ picker since League Classic launched, this is the release that sends the impostor home. The rest of it is about one thing: when something fails, queuePop now *tells you* instead of smiling and nodding.

## 🏛️ League Classic

- **The double-champion bug is fixed.** Classic added a second copy of every returning champion to the client's list, and the picker (and your saved pick lists) could land on the wrong one. queuePop now keeps the real one every time.
- **Classic draft actually works.** Classic has bans but no assigned positions, so auto pick/ban silently did nothing. It now falls back to your role-priority role (or the first role with picks) and runs bans, picks, spells, runes and skins as normal.
- **A rejected pick no longer stalls champ select.** If the client refuses a champ, queuePop moves to the next one on your list instead of standing there looking locked in.

## 🔔 Failures you can see

- **Discord and desktop alerts** that fail now show up as a warning in the activity feed and on the Alerts page. Previously a dead webhook still said "sent".
- **PLAY, cancel and quick-queue errors** pop a toast ("Riot Client not found", "Lobby error") instead of doing nothing.
- **A failed update** re-enables the Update button and says why. "No release found" and "couldn't reach the server" are now different messages.

## 🧹 Small things

- **Start in the tray** is a new checkbox on the Alerts page.
- The window size is no longer saved while minimised, so no more 160×28 ghost windows.
- The bench-grab delay slider and the backend finally agree on the maximum (3 s).
- The champ select log rotates at 1 MB instead of growing forever.
- README and the site now describe the app you're actually running.

Four small automated checks ride along under `tests/` so these stay fixed. o7
