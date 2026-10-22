# Riot product registration: draft (DONI-693)

For developer.riotgames.com > Register Product. Overwolf requires Riot's approval for any League app, and the stats crawler
needs a production key, since a personal key may not power stats other people see. Fill in the bracketed parts and edit freely.
Be plain about automation: it's the part Riot is most likely to ask about, and it's better they hear it from us.

## Product name
queuePop

## Product URL
[site URL] (Terms: [site]/terms.html, Privacy: [site]/privacy.html)

## Product description

queuePop is a free Windows desktop companion for League of Legends and Teamfight Tactics (it also covers Deadlock), distributed
through Overwolf. It runs beside the League client and uses the local client API (LCU) and the Live Client Data API. It never
reads game memory and never injects into the game.

What it does:

- **Queue alerts and auto-accept.** It accepts the ready check for you (with an optional delay) and can alert you on Windows,
  Discord, ntfy or a phone companion page on your own network, so you can step away while queuing. You can decline from your phone.
- **Champ select help.** Optional, off by default, and set up by the player in advance: preferred picks and bans per role, which it
  hovers and locks at a time the player chooses; runes and summoner spells from the player's saved loadouts; ARAM bench swaps
  from the player's own priority list. A "stepping away" switch turns these on until the player comes back.
- **Draft suggestions.** During champ select it shows the top picks for your role against the champions already visible, with win
  rates from aggregated ranked matches, plus a short pre-game plan (common build, skill order, hardest matchups).
- **Stats pages.** Tier lists, champion pages (builds, runes, matchups), leaderboards and player lookups, computed from public
  match data (below).
- **Recorder.** Optionally records the player's own games (video through Overwolf's recorder) and marks kills, deaths and
  objectives on a timeline from the Live Client Data API, after the fact, for review. Nothing is shown in game.

What it does not do: no in-game overlay during play, no timers of any kind (ability, summoner spell, ultimate, objective), no
power-spike or "do X now" notifications from game state, no names of other players in ranked champ select, no Brawl or League
Classic data.

## How we use the Riot API

A server we run (the "stats crawler") collects ranked match data and aggregates it per patch. Only the crawler holds the key;
the app never calls the Riot API itself.

- Endpoints: match-v5 (matches, timelines), league-v4 entries (players to sample, leaderboards), summoner-v4, account-v1
  (Riot IDs for leaderboards and player lookups); for TFT, tft-match-v1 and tft-league-v1.
- Queues: Ranked Solo/Duo, Ranked Flex, ARAM, Normal Draft, Swiftplay; TFT ranked and Double Up.
- Results are cached and served to the app as aggregates (win, pick and ban rates, builds, matchups). Player lookups show
  public match history for a Riot ID the user searches for.
- Expected load: [N] app users at launch. Requests to Riot depend on the crawl rate, not on app users.

## Monetization
Free. One Overwolf ad in the app's sidebar (never in game). An optional paid supporter tier removes it.

## Contact
Brandon Harris, [contact email]
