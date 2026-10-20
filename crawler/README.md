# queuePop stats crawler

Crawls ranked League (solo 420, flex 440) and TFT (ranked 1100) matches with one Riot **personal**
API key, stores them in SQLite, aggregates per-patch stats, and serves them as JSON for the app's
League and TFT worlds. Node 24, no dependencies (`node:sqlite`, `node:http`).

```
seed   league-v4 / tft-league-v1 ladders, MIN_TIER and up, top down  -> players
ids    match-v5 / tft-match-v1 by-puuid ids, newest first            -> matches (status new; the match id
       is the primary key, so a match seen by ten players is fetched once)
fetch  one match per request: raw JSON gzipped + normalised rows     -> matches.raw, *_participants
       + a timeline for TIMELINE_SAMPLE of League matches             -> lol_participants.skills, lol_timeline
agg    every AGGREGATE_EVERY_MIN (changed patches only) or `npm run aggregate` -> stats_* (counts)
prune  daily: raw JSON older than RAW_RETENTION_DAYS and already aggregated -> matches.raw = NULL
api    GET endpoints below; rates computed from the counts at read time
```

Every job keeps its place in the DB (`meta` seed cursor, `players.ids_at`, `matches.status`), so a
restart resumes. Regions are the parallelism: each region runs a ladder loop on its platform host
(`na1`) and a match loop on its regional host (`americas`); each host is its own rate bucket.

## Config (env)

| var | default | |
|---|---|---|
| `RIOT_API_KEY` | none | personal key. Without it (and without one posted to `/admin/key`) the service only serves the existing DB |
| `LOOKUPS_PER_MIN` | 3 | uncached `/lol/summoner` + `/tft/player` lookups allowed per minute (each costs up to ~23 Riot requests) |
| `BACKUP_DIR` | `/backups` (image) | nightly `VACUUM INTO` target (compose mounts `./backups`, inside appdata so the server backup copies it); empty = off. `npm run -s backup` runs one now |
| `BACKUP_KEEP` | 3 | newest `crawler-YYYYMMDD-HHMM.db` files kept; only files with that name are ever deleted |
| `BACKUP_HOUR_UTC` | 10 | hour of the nightly backup (03:00 PT); waits while an aggregation pass runs; `/status` `backup` = `{ at, file, bytes, ms, removed }` |
| `ADMIN_TOKEN` | none | bearer token for `POST /admin/key` and the status page form. Unset: the endpoint returns 503 |
| `REGIONS` | `na1,kr` | platform ids; add `euw1,eun1` if quota allows |
| `MIN_TIER` | `EMERALD` | lowest ladder tier seeded |
| `QUEUES` | `420,440,1100` | drop 1100 to skip TFT, drop 420/440 to skip League |
| `DB_PATH` | `data/crawler.db` | `/data/crawler.db` in the image |
| `PORT` | `47900` | |
| `TIMELINE_SAMPLE` | `0.1` | share of League matches that also fetch a timeline (skill order, starting/early items, build order); each costs one more request |
| `AGGREGATE_EVERY_MIN` | `60` | minutes between aggregation passes; one runs on start if the last is older. Only patches with new matches are recomputed. The pass runs in a worker thread (`src/agg-worker.js`, own connection): the API keeps answering from the previous stats, the crawl loops pause until it commits (DONI-547) |
| `RAW_RETENTION_DAYS` | `7` | see Retention |
| `RIOT_BASE_URL` | Riot | point at the mock server instead |

## Rate limits

Personal key: 20 requests / 1 s and 100 / 120 s per routing host. `src/limiter.js` keeps a
sliding-window log per host (app limit) and per host+method (method limit), pads each window by
500 ms for latency jitter, adopts `X-App-Rate-Limit` / `X-Method-Rate-Limit` from responses, and on
429 blocks the bucket for `Retry-After` (5 s if absent). `test/limiter.test.js` proves no 120 s window
ever holds more than 100 calls. Throughput is about 0.83 requests/s per host: roughly 70k match
fetches a day per regional host (`euw1` and `eun1` share `europe`).

## Endpoints

All `GET` except the admin key POST below, JSON, CORS `*`, no auth (loopback/LAN only). Common query params:
`patch` (default newest, e.g. `16.20`), `region` (`na1`… or `all`, default all),
`set` (TFT only: newest patch with that set number, echoed back; `matches.set` comes from `tft_set_number`),
`bracket` (minimum tier: `emerald` = Emerald and above; default `all`), `min_games` (default 200).
Rates are 0..1, 4 decimals. Every row carries `games` (its sample size) and `lowSample: games < min_games`:
low-sample rows are kept and flagged so the UI greys them, never dropped. Responses echo `minGames`.
Champion ids are Riot numeric keys (Data Dragon `key`); build keys are strings.

- `GET /health` → `{ ok, version }`
- `GET /status` → `{ matches: {lol: {done, new, skip, missing}, tft}, players: {lol, tft}, lastFetch, aggregatedAt, nextAggregation, aggregateEveryMin, retentionDays, disk: { dbBytes, walBytes, rawBytes, rawMatches }, key, seed, rateLimits,
  aggregates: { at, ms, dirty: [patch], patches: { patch: { at, ms } } }, endpoints: [{ path, game, patch, updatedAt, live? }] }` (`endpoints`: what each
  route serves and when that data was last rebuilt; the status page lists it)
- `GET /` → the status page (`src/status.html`, one static file): progress, per-bucket usage bars, DB size, key source,
  and a form to paste a new Riot key (password + admin token). Refreshes every 10 s.
- `POST /admin/key` `{ "key": "RGAPI-…" }` with `Authorization: Bearer <ADMIN_TOKEN>` → stores the key in the `meta` table.
  The Riot client reads it (meta first, `RIOT_API_KEY` second) on every request, so no restart. 401 bad/missing token,
  400 malformed key, 503 no `ADMIN_TOKEN` configured. The key is never logged or returned; `/status` shows
  `key: { source: "meta"|"env"|"none", set_at, valid, reason, since }`. `/` and `/admin/*` answer only loopback and private-LAN
  sources (10/8, 172.16/12, 192.168/16); others get 403.
- Key health: when Riot answers 401/403 (an expired development key answers 403 Forbidden), the crawler stores
  `meta.keyBad = { hash, reason, since }`, logs once, and every loop idles (one check per 10 s, no Riot calls) while the
  current key still has that hash. `/status` `key.valid` is false with `reason` ("403 Forbidden") and `since`; the status
  page shows it in red. Posting a new key changes the hash, so the crawl resumes by itself on the next loop.
- `GET /patches` → `{ lol: ["16.20", ...], tft: [...] }` newest first
- `GET /lol/tiers?patch&region&bracket&role` (role `top|jungle|middle|bottom|utility`) →
  `{ patch, region, bracket, minGames, role, matches, avgWinRate, regions: ["euw1", ...], champions: [{ champion, role, games, wins, winRate,
  pickRate, banRate, lowSample, laneShare, delta, pbi, best: { players, games, winRate, delta, avgTier } | null }] }`
  sorted by games. One row per champion × role. `regions` = every crawled region (for the app's filter).
  `laneShare` = the row's games / the champion's games in all roles; `delta` = winRate − `avgWinRate` (wins / games over every
  row under the same patch/region/bracket); `pbi` (pick-ban influence) = delta × 100 × banRate / (1 − pickRate), 2 decimals.
  `best` = players with >= 20 games on the champion (any role) in the patch under the filter, pooled: `games`, `winRate`,
  `delta` = their win rate − the row's, `avgTier` = mean rank as a tier index (Iron 0 … Challenger 9) plus division
  (IV 0, III .25, II .5, I .75); null when nobody qualifies. For `best`, `bracket` filters the players' own seeded tier.
- `GET /lol/champion/{id}/players?patch&region&bracket&role` → `{ ..., champion, role, minPlayerGames: 20, players: [{ riotId,
  region, tier, division, lp, rank, games, wins, winRate }] }`: the top 50 by win rate (ties: more games), >= 20 games each.
- `GET /lol/champion/{id}?patch&region&bracket&role` (role defaults to the most played) →
  `{ champion, role, roles: [{role, games}], strip: { games, wins, winRate, pickRate, banRate, matches, lowSample },
  builds: { item, keystone, rune, spells, skills: [{ key, games, winRate, pickRate, lowSample }] }, matchups: [{ opponent, games, winRate, lowSample }] }`.
  `spells` keys are `"4,14"` (sorted ids). `skills` keys are the max order, e.g. `"QEW"`; they come from the
  timeline sample, so their `pickRate` is out of the sampled games. Matchups are the enemy in the same role.
  Champion depth (DONI-507, `src/agg-champion.js`), same response:
  - `timelineGames`: this champion+role's games with a sampled timeline, the denominator of the four timeline blocks.
  - `starting: [{ key, games, winRate, pickRate, lowSample }]` key = items bought before 1:30, sorted ids with repeats (`"1055,2003,2003"`).
  - `early: [...]` key = one item first bought 1:30–10:00 (consumables and trinkets left out); a game counts once per item.
  - `buildOrder: { core: [...], slots: [[...] × 6] }`, each `{ key, games, winRate, pickRate, avgMinute, lowSample }`. A build is
    the final-inventory items in first-purchase order (bought after 1:30, no consumables); `slots[n]` = what was item n+1
    (pickRate out of games that reached that slot), `core` key = the first three in order (`"3020,3078,6672"`), timed at the third.
  - `skills: { 6, 10, 15: [{ key, ... }] }` key = the first N skill points (`"QEWQQR"`); games shorter than N levels drop out.
  - `objectives: [{ objective, games, secured, securedRate, securedWinRate, yielded, yieldedRate, yieldedWinRate, lowSample }]` for
    `first_blood first_tower first_dragon grubs herald baron first_inhibitor atakhan soul`: secured = your team took it first,
    yielded = the enemy did (neither when nobody did); rates out of the strip's games; win rates null when 0 games. Soul = 4+ dragons.
  - `sides: { blue: { games, winRate }, red }`.
  - `shards: [{ key, ... }]` stat mods `"offense,flex,defense"` ids (`"5008,5008,5011"`), read from raw match JSON like objectives.
  - `synergies: [{ ally, role, games, winRate, pickRate, delta1, delta2, lowSample }]`, top 60 same-team champion+role by games.
  - `matchups[]` also carry `pickRate` (share of your games against them), `delta1` = win rate vs them − your average,
    `delta2` = win rate vs them − (your average − their average in that role + 0.5), null when they have no games in that role.
    Synergy `delta2` = win rate together − (your average + their average − 0.5).
- Windows and trends (DONI-513 data side): `?days=N` (1..90, or `patch` = the default whole patch) on `/lol/tiers`,
  `/lol/champion/{id}` (strip and roles only; builds, matchups and depth blocks stay per patch), `/tft/comps` and `/tft/comp/{id}`
  (the comp row; units/augments/traits stay per patch) reads the last N UTC days of the patch (today counts as one) from
  `stats_{lol_matches,lol_champ,lol_bans,tft_boards,tft_comp}_daily`; the response echoes `days` and `since` (YYYY-MM-DD).
  `?trend=1` adds `daily: [{ day, games, winRate }]` to tier rows and `daily: [{ day, games, avgPlacement }]` to comp rows.
- Game length and depth (D6): `/lol/champion/{id}` adds `length: [{ bucket, from, to, games, winRate, share }]` (5-minute buckets of
  `matches.duration`, `to: null` = 45 min and longer) and `depth: { players, gamesPerPlayer }`; `/lol/tiers` rows add `players` and
  `gamesPerPlayer` (distinct puuids per champion+role; with bracket=all a player seen in two brackets counts twice). Matches stored
  before the column existed get `duration` from `npm run -s backfill-length` (raw retention window only), then `aggregate`.
- `GET /lol/draft?role=MIDDLE&allies=7,64&enemies=9,8:TOP&bans=1,2&patch&region&bracket&limit` (D8, champ select) →
  `{ patch, region, bracket, role, lane, allies, enemies, bans, candidates: [{ champion, score, games, winRate, lowSample, components: {
  base: { value, games }, lane: { champion, value, games } | null, enemies: [{ champion, value, games }], allies: [{ champion, value, games }] } }] }`,
  best first (default 30, max 100). Ids may carry `:ROLE`. `score` is in win-rate points: `base` (role win rate − 0.5, shrunk by
  n/(n+200)) + `lane` (matchup delta2 vs the enemy in our role, n/(n+100)) + 0.5 × mean of the other enemies (win rate vs them − own,
  from `stats_lol_vs`, n/(n+100)) + 0.5 × mean of the allies' synergy delta2 (n/(n+100)). Each component's `value` is the raw delta and
  `games` its sample. Lane enemy: the one given as `id:<role>`, else the enemy whose most-played role is ours. Banned and picked
  champions are not candidates; candidates need 50 games in the role. 400 on a bad role or id.
- `GET /lol/plan/{champion}?role&enemies=9,8&patch&region&bracket` (D8) → `{ champion, role, games, winRate, core, starting, skillOrder,
  skills15, keystone, spells, shards, threats: [{ champion, games, winRate, delta }] (the two worst among the enemies), objectives, sides }`
  (each build field is the most-picked row of the champion page, or null).
- `GET /lol/match/{id}` (D9, id like `NA1_5663691820`) → `{ source, id, queueId, patch, startedAt, duration, teams: [{ team, win, bans,
  objectives: { baron: { first, kills }, ... } }], participants: [{ puuid, riotId, team, champion, role, win, level, kills, deaths, assists, cs, gold,
  damage, damageTaken, vision, items, trinket, spells, keystone, runes: [{ style, perks }], shards }], timeline }`. `source`: `raw` (stored JSON,
  within raw retention: everything), `rows` (after retention: champions, roles, wins, items, runes, spells, bans, first-objective flags; the
  numbers are null), `riot` (never crawled: fetched on demand through the lookup cap, 429 + Retry-After beyond it, cached 10 min).
  `timeline` = `{ puuid: { start, build: [[item, second]], skills } }` for matches in the timeline sample, else null.
- `GET /tft/match/{id}` (D9) → `{ source, id, queueId, set, startedAt, length, participants: [{ puuid, riotId, placement, level, lastRound, goldLeft,
  damage, eliminated, timeEliminated, traits: [[name, tier, units]], units: [[unit, star, [items]]], augments }] }`, by placement; same sources
  (`rows` adds `comp`, numbers null, traits are `[name, tier]`). 404 unknown, 400 malformed id.
- `GET /lol/items?patch&region&bracket&role&min_games` (DONI-509) → `{ patch, region, bracket, role, minGames, players, winRate,
  items: [{ key, games, wins, winRate, delta, pickRate, lowSample, champions: [{ champion, games, winRate }] }] }`, every finished item
  by games. `players` = champion-games in scope (10 per match, or the role's games) and is the `pickRate` base; `delta` = winRate −
  the scope's `winRate`; `champions` = the top 5 champions finishing with it. `/lol/runes` → same head plus `keystones`, `runes`
  (every rune incl. keystones) and `shards` (stat-mod triples); `/lol/spells` → `spells` (keys `"4,14"`). Rolled up at read time
  from `stats_lol_build` / `stats_lol_shards` and memoised until the next aggregation pass.
- `GET /lol/leaderboard?region&limit` and `GET /tft/leaderboard?region&limit` (DONI-508/512) → `{ game, region, players: [{ rank, riotId,
  region, tier, division, lp, wins, losses, games, winRate, updatedAt }] }`, ladder order (tier, division, LP), `limit` default 100, max 500.
  From the `players` table: the daily ladder walk plus a re-read of the three apex ladders every 30 min (`meta apex:<game>:<region>`),
  so Master+ LP is at most 30 min old; `division` is null for Master+. TFT rows add `crawled: { games, avgPlacement, top4Rate }` over
  every board we hold for that player (null when none). Riot ids come from `lol_names` (both games; null until we crawled one of their
  matches). `/lol/leaderboard?champion=<id>[&role]` is the champion leaderboard (same as `/lol/champion/{id}/players`).
- `GET /lol/summoner/{riotId}?region=na1` and `GET /tft/player/{riotId}?region=na1` (riotId `Name#TAG` URL-encoded, or `Name-TAG`;
  region defaults to the first of REGIONS) → on-demand from Riot: account-v1, league entries by puuid, last 20 match ids, and each
  match from our DB when we still hold its raw JSON, else from Riot (~23 requests worst case). League:
  `{ game, riotId, puuid, region, level, iconId, ranked: [{ queue, tier, division, lp, wins, losses }], matches: [{ id, queueId, startedAt,
  duration, champion, role, win, kills, deaths, assists, cs, gold, items, spells, keystone }], fetchedAt }`; TFT: same head (no level/icon),
  `matches: [{ id, queueId, startedAt, length, placement, level, traits: [[name, tier]], units: [[unit, star, [items]]], augments }]`.
  Cached 10 min per game+region+id (case-insensitive); at most `LOOKUPS_PER_MIN` (default 3) uncached lookups a minute, beyond that
  429 with `Retry-After`; 404 unknown Riot id, 400 bad id/region, 503 while the key is invalid. The app's `get_match_history` uses
  this to back-fill a short League history (DONI-524).
- `GET /tft/comps?patch&region&bracket` →
  `{ patch, region, bracket, minGames, boards, comps: [{ id, traits, carry, games, avgPlacement, top4Rate, winRate, pickRate, lowSample }] }`, top 200 by games
- `GET /tft/comp/{id}` (id URL-encoded) → the comp row plus `units`, `augments` and `activeTraits` (key `"<trait>:<tier_current>"`):
  `[{ key, games, frequency, avgPlacement, top4Rate, lowSample }]`; 404 when unknown
- `GET /tft/meta[?set=18]` → `{ set, mutator, fetchedAt, units: { apiName: { name, cost, traits: [traitApiName], icon } },
  traits: { apiName: { name, icon, breakpoints: [minUnits] } }, items: { apiName: { name, icon } }, augments: { ... } }` for the
  newest crawled set (Community Dragon `cdragon/tft/en_us.json`, setData `TFTSet<N>`; icons are CDragon PNG URLs). Fetched at
  most once a day and kept in `meta.tftMeta`; on a CDragon failure the last copy is served with `stale: true` (503 when none).

TFT stat pages (DONI-510/511), all `?patch&region&bracket&min_games`, every row `{ games, avgPlacement, top4Rate, winRate, frequency, lowSample }`
(`frequency` = games / boards in scope unless noted). Read from `stats_tft_{unit,unit_item,item,augment,trait}`, built from
`tft_participants.board` (`[[unit, star, [items]]]`), `traits` and `augments`; memoised until the next aggregation.
- `GET /tft/units` → `{ ..., boards, units: [{ key, ...row, stars: [{ star, ...row }], items: [{ key, games, avgPlacement }] (top 3) }] }` by games.
  A unit fielded twice on one board counts twice.
- `GET /tft/unit/{key}` → the unit row plus `stars`, `items` (top 40 single items), `itemSets` (top 20 full sets, sorted keys joined
  by `,`, `""` = no items) and `comps` (top 20 `{ id, games, frequency, avgPlacement, top4Rate, lowSample }`); for these three
  `frequency` is out of the unit's own games. 404 when the unit has no games in scope.
- `GET /tft/items` → `items: [{ key, ...row, units: [{ unit, games, avgPlacement, top4Rate }] (top 5 holders) }]`; a row counts item copies.
- `GET /tft/augments` → `augments: [{ key, ...row, stages: [{ stage: "2-1"|"3-2"|"4-2", ...row }] }]` (stage = pick order). Riot's
  tft-match-v1 sends no augments for set 18 (0 of 318,648 boards on 2026-10-20), so the list is empty and the response carries `note`.
- `GET /tft/traits` → `traits: [{ key, ...row, tiers: [{ tier, ...row }] }]`, tier = `tier_current` (breakpoint index; unit counts per
  breakpoint are in `/tft/meta` `traits[key].breakpoints`).

**TFT comp rule (DONI-502):** a comp id is `"<top trait>,<carry unit>"`, e.g. `DA_18_Invoker,DA_18_Ahri`
(`traits: [top trait]`, `carry`). Top trait: the active
trait (`tier_current >= 1`) that is not a one-unit unique trait (`tier_total > 1`), by highest `tier_current`, then most units,
then name; `none` when there is none. Carry: the unit holding the most items, then highest star, then highest cost, then name.
Deterministic. On 3,200 live boards (16.20) it put 0% in `none` (the old "traits at tier >= 2" rule: 22.5%) and explained
2.7x more placement variance. After a rule change run `npm run -s backfill-comps` (re-keys boards and rewrites `board` from raw JSON; boards
whose raw retention already dropped keep their old trait-only id), then `npm run -s aggregate`.

**Players (DONI-506, `src/agg-players.js`):** `lol_names` (puuid → latest Riot id `name#tag`, region) is written for every
stored League match; `npm run backfill-players` fills it from the raw JSON still inside the retention window, then run
`npm run aggregate`. `stats_lol_player_champ` (patch, region, bracket = the player's seeded tier, puuid, role, champion,
games, wins, division, lp, rank_n) is rebuilt per patch with the other stats; rows under 3 games are not stored.
Tier/LP are the player's latest ladder entry, not the rank at each game.

**Tier rule (app, `src/webui/js/stats-api.js`):** 0.55 × percentile(win rate shrunk by 100 games) + 0.20 × percentile(PBI)
+ 0.15 × percentile(best.winRate) + 0.10 × percentile(best.avgTier) (missing parts: 0.5); top 10% S, 20% A, 40% B, 20% C,
10% D, each in thirds (S+ S S- … D-). `lowSample` rows are not tiered and sort last.

**Brackets:** a match's bracket is the ladder tier of the seeded player whose history surfaced it.

**Timeline sample:** starting/early items, build order and skill orders come only from the `TIMELINE_SAMPLE` share of
matches (10% now, so roughly one in ten of a champion's games; Home raises it with the production key). Timelines are
not stored raw, so these fill forward from deploy: there is nothing to backfill and no `backfill-timeline` script.
**Objectives and stat mods** are read from raw match JSON at the start of each aggregation pass for every League match that has raw and
no `lol_objectives` rows yet (`lol_shards` with them), so after deploy they backfill themselves for matches inside `RAW_RETENTION_DAYS`
(run `npm run aggregate` once to recompute every patch). Raw match JSON is kept gzipped in `matches.raw`, so new stats
can be recomputed without refetching.

## Retention

The gzipped raw match JSON is ~50 KB/match and dominates the file. A minute after start and then daily, the crawler
sets `matches.raw = NULL` for matches whose game started more than `RAW_RETENTION_DAYS` ago **and** that an
aggregation pass has already counted, then runs `PRAGMA incremental_vacuum` to give the pages back. Normalised rows
(`*_participants`, `lol_bans`) and `stats_*` are never deleted. The raw window only matters for recomputing after a
schema change, so do that within it.

New databases get `auto_vacuum=INCREMENTAL`. A database created before that needs a one-time `VACUUM`
(`npm run vacuum`; in Docker `docker exec queuepop-crawler node src/main.js vacuum`). It rewrites the file, so it
needs free disk about the size of the DB and blocks the crawler's writes while it runs (they retry). `/status`
`disk` shows `dbBytes`, `walBytes`, `rawBytes` and `rawMatches`.

TFT patch: Riot's tft-match-v1 now sends a placeholder `game_version` (`TFT Unreal Version ?.?.?.?`), so when it
has no number the patch is the League patch whose first crawled game started latest at or before the TFT game's
`game_datetime` (fallbacks: newest League patch, then `set<N>`). `backfill-patch` applies the same rule to old rows.

## Run and test

```bash
npm test                 # rate limiter, pipeline on fixtures, aggregation math
npm run mock             # mock Riot API on :47901 serving fixtures/
RIOT_API_KEY=x RIOT_BASE_URL=http://127.0.0.1:47901 REGIONS=na1 npm start
npm run backfill-patch   # one-off (stop the service first; db busy_timeout is 5 s): re-derive patch/set from stored raw for '?' rows, drop stale '?' stats; then run aggregate (Docker: node src/main.js backfill-patch)
npm run aggregate        # rebuild all stats now (every patch) (in Docker: docker exec queuepop-crawler node src/main.js aggregate)
```

`fixtures/` holds schema-faithful responses (Riot DTO shapes, synthetic values): 3 ladder lists,
3 entries pages, 3 id lists and 3 matches each for League and TFT, plus 3 League timelines (with item purchase, undo and sell events consistent with the matches' final items).

## Get a personal API key

1. Sign in at https://developer.riotgames.com with the Riot account that owns the project.
2. Register Product → Personal API Key; describe queuePop's stats crawler for personal use.
3. The key arrives on the dashboard once approved; it does not expire. One key per product, never more.

## Deploy to Unraid

First install:

```bash
scp -r crawler root@unraid:/mnt/user/appdata/queuepop-crawler
cd /mnt/user/appdata/queuepop-crawler && cp .env.example .env   # paste RIOT_API_KEY, set TZ
mkdir -p data backups && chown -R 1000:1000 data backups   # the image runs as "node" (uid 1000); a root-owned ./data crash-loops with
                                           # "unable to open database file" (DONI-494)
docker compose up -d --build
curl http://127.0.0.1:47900/status
docker compose logs -f
```

Updates (from the repo root on the dev PC; never copies `.env` or `data/`):

```bash
scp -q -r crawler/Dockerfile crawler/docker-compose.yml crawler/package.json crawler/README.md crawler/src crawler/fixtures crawler/test unraid:/mnt/user/appdata/queuepop-crawler/
ssh unraid 'cd /mnt/user/appdata/queuepop-crawler && docker compose up -d --build'
```

A script that writes the DB (`backfill-*`, `aggregate`) runs with the service stopped, so the two never hold write locks at once:
`docker compose build && docker compose stop && docker compose run --rm --no-deps crawler npm run -s <script> && docker compose up -d`.
A forced `aggregate` over one full patch took ~6 min on 2026-10-20 (45k League + 39k TFT matches).

## Production key later

Once the League and TFT pages visibly work, Register Product → Production API Key on the developer
portal with a description, screenshots, and a working prototype; Riot reviews it (weeks) and grants
much higher limits. Swap the key (status page or `POST /admin/key`, or `RIOT_API_KEY`); the limiter picks up the new limits from the response headers.
