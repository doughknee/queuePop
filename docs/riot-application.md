# Riot product registration: draft (DONI-693)

For developer.riotgames.com > Register Product. Overwolf requires Riot's approval for any League app, and the stats crawler
needs a production key, since a personal key may not power stats other people see. Fill in the bracketed parts and edit freely.
The product described here is the store edition (DONI-704): it highlights decisions and never makes them. Auto-accept is asked about
separately at the end, so approval of the product doesn't hinge on it.

## Product name
queuePop

## Product URL
https://queuepop.app (Terms: https://queuepop.app/terms.html, Privacy: https://queuepop.app/privacy.html)

## Product description

queuePop is a free Windows desktop companion for League of Legends and Teamfight Tactics (it also covers Deadlock), distributed
through Overwolf. It runs beside the League client and uses the local client API (LCU) and the Live Client Data API. It never
reads game memory and never injects into the game.

What it does:

- **Queue alerts.** When the queue pops it alerts you on Windows, Discord, ntfy or a phone companion page on your own network, so you
  can step away while queuing and get called back. You accept in the League client on your PC, so you are there for
  champ select. Your phone can decline the match (which only removes you from the queue) but cannot accept it.
- **Champ select help.** Optional, off by default, and set up by the player in advance: when it's your turn it hovers your planned ban
  and pick; you lock in. Runes and summoner spells come from the player's saved loadouts once they lock in. For ARAM it shows which bench
  champion fits your team best; you take it.
- **Draft suggestions.** During champ select it shows the top picks for your role against the champions already visible, with win
  rates from aggregated ranked matches, plus a short pre-game plan (common build, skill order, hardest matchups).
- **Stats pages.** Tier lists, champion pages (builds, runes, matchups), leaderboards and player lookups, computed from public
  match data (below).
- **Recorder.** Optionally records the player's own games (video through Overwolf's recorder) and marks kills, deaths and
  objectives on a timeline from the Live Client Data API, after the fact, for review. Nothing is shown in game.

What it does not do: it never accepts a queue, locks in a champion, takes from the ARAM bench or sends trade requests for you; no
in-game overlay during play; no timers of any kind (ability, summoner spell, ultimate, objective); no power-spike or "do X now"
notifications from game state; no names of other players in ranked champ select; no Brawl or League Classic data.

## How we use the Riot API

A server we run (the "stats crawler") collects ranked match data and aggregates it per patch. Only the crawler holds the key;
the app never calls the Riot API itself.

- Endpoints: match-v5 (matches, timelines), league-v4 entries (players to sample, leaderboards), summoner-v4, account-v1
  (Riot IDs for leaderboards and player lookups); for TFT, tft-match-v1 and tft-league-v1.
- Queues: Ranked Solo/Duo, Ranked Flex, ARAM, Normal Draft, Swiftplay; TFT ranked and Double Up.
- Results are cached and served to the app as aggregates (win, pick and ban rates, builds, matchups). Player lookups show
  public match history for a Riot ID the user searches for.
- Expected load: [N] app users at launch. Requests to Riot depend on the crawl rate, not on app users.

## A question, separate from this application

Long queues are the most common reason players ask us for auto-accept: an opt-in setting that accepts the ready check for them,
optionally after a short delay. We have left it out of queuePop because we read your policies as asking products not to remove game
decisions, and because an accepted match needs the player at their PC for champ select. Would you allow an opt-in auto-accept under
any conditions (for example, only while queuePop can see the player is active at the PC, or with a delay)? If not, we'll keep it out.
Either way, this application is for queuePop as described above.

## Monetization
Free. One Overwolf ad in the app's sidebar (never in game). An optional paid supporter tier removes it.

## Contact
Brandon Harris, support@queuepop.app
