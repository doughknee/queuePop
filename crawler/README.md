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
| `ARAM_SHARE` / `NORMAL_SHARE` / `SWIFT_SHARE` | 0.1 / 0.05 / 0.05 | capped discovery (DONI-596) for ARAM (450), normal draft (400) and swiftplay (480/490): a queue's ids are asked only while it is under this share of the region's League matches fetched in the last hour (plus its ids still waiting), at most one ids call per region and queue per minute. Players of every fetched match of that queue are asked next (ranked players rarely play these modes), so ranked keeps the quota |
| `ADMIN_TOKEN` | none | bearer token for `POST /admin/key` and the status page form. Unset: the endpoint returns 503 |
| `REGIONS` | `na1,kr` | platform ids; add `euw1,eun1` if quota allows |
| `MIN_TIER` | `EMERALD` | lowest ladder tier seeded |
| `QUEUES` | `420,440,450,400,480,490,1100` | drop 1100 to skip TFT, drop 420/440 to skip League |
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

Measured 2026-10-20 05:00–08:00 UTC from the DB (`players.ids_at`, `matches.fetched_at`, `lol_timeline`; per routing host, per hour,
the window includes ~25 min of deploy downtime):

| host (region) | ids calls | match fetches (LoL + TFT) | timelines | total | per hour of uptime |
|---|---|---|---|---|---|
| europe (euw1) | 293 | 2,064 | 99 | 2,457 | ~2,850 |
| asia (kr) | 273 | 2,066 | 110 | 2,449 | ~2,840 |
| americas (na1) | 299 | 2,044 | 92 | 2,434 | ~2,830 |
| sea (oc1) | 916 | 1,456 | 52 | 2,424 | ~2,810 |

The ceiling is 3,000/h (100 per 120 s, padded), so every host runs at ~95%: the crawl is quota-bound, and the `new` backlog stays
under ~30 per region because fetches keep up with discovery. A timeline costs one match fetch, so `TIMELINE_SAMPLE` stays at 0.1
(~100 timelines/h per host, ~10k a day across four hosts); raising it would slow match fetches one for one. Revisit with a production
key (much higher limits; the limiter adopts them from the headers). oc1 spends more on `ids` because its ladder is small and most
players have nothing new each hour.

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
  route serves and when that data was last rebuilt; the status page lists it),
  `health: { lol|tft: { patch, hourly: { region: [24 matches per hour, oldest first] }, last24h, rows, lowSampleShare } }` (D16: the status page
  draws one sparkline per region, the default patch's row count and its share under 200 games, plus the last backup; computed by the aggregation worker after each pass, `health.at`)
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
- Modes (D13, DONI-596): only solo/duo (420) is stored under the plain patch; flex, ARAM, normal draft and swiftplay are stored under
  `"<patch>-flex"`, `-aram`, `-normal`, `-swift`, so every per-patch aggregate serves them apart. `?queue=440|450|400|480|490` (or
  `flex|aram|normal|swift`) on any League stats endpoint (`/lol/tiers`, `/lol/champion/{id}`, items/runes/spells, draft, plan, ...) reads
  one; the response echoes `queue` (440, 450, 400 or 480) and the suffixed patch. `?queue=420|ranked|solo` = default. A suffixed
  `?patch` picks its mode too. ARAM roles are empty (role `""`, no matchups). `/patches` lists `flex`, `aram`, `normal`, `swift` like
  `lol` with `counts.<mode>` per plain patch; no mode ever becomes the League default patch. Region weighting is solo only.
- Input hardening (DONI-568): malformed %-encoding in a path answers 400; `limit` is truncated to an integer; draft ids accept only
  `:TOP|JUNGLE|MIDDLE|BOTTOM|UTILITY` tags (400 otherwise); `?days` is echoed only by routes that apply it (tiers, champion strip, comps);
  a `-aram` suffix on `?patch` means ARAM; `/status` is LAN-only like `/`, and any request carrying `x-forwarded-for` counts as not LAN.
- `GET /patches` → `{ lol: ["16.21", "16.20", ...], tft: [...], counts: { lol: { patch: matches }, tft: { patch: matches } }, minMatches: { lol: 2000, tft: 1000 },
  default: { lol, tft } }`, newest first. `default` is what every endpoint uses without `?patch` (D11): the newest patch with at least
  `minMatches` matches (TFT matches = boards / 8), else the patch with the most. So on patch day the app stays on the old patch until
  the new one has ~2 h of League crawl (~1,000 matches/h) and then switches by itself; an explicit `?patch` always wins. A new patch
  always starts fresh rows in every stats table (stats are keyed by patch; `test/rollover.test.js`).
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
    Since D14 only completed items count (`src/lol-items.js`: has a recipe, not a consumable/trinket, builds into nothing but tier-3
    boots or an Ornn upgrade; Data Dragon, refreshed daily into `meta.lolItems`): components and starters (Kindlegem, Dark Seal,
    Doran's, World Atlas) no longer take slots, like Lolalytics' core.
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
- Region weighting (2026-10-20 accuracy audit): `/lol/tiers` with `region=all` (default) and two or more regions returns win, pick and ban
  rates as the regions' rates weighted by their share of seeded League players (`weighting: { region: share }` in the response, from
  `meta.regionWeights`, refreshed after each aggregation pass), like Lolalytics' global view. `games`/`wins` stay raw totals. Before,
  every region counted equally (oc1 has ~5% of the players and ~25% of our sample).
- Windows and trends (DONI-513 data side): `?days=N` (1..90, or `patch` = the default whole patch) on `/lol/tiers`,
  `/lol/champion/{id}` (strip and roles only; builds, matchups and depth blocks stay per patch), `/tft/comps` and `/tft/comp/{id}`
  (the comp row; units/augments/traits stay per patch) reads the last N UTC days of the patch (today counts as one) from
  `stats_{lol_matches,lol_champ,lol_bans,tft_boards,tft_comp}_daily`; the response echoes `days` and `since` (YYYY-MM-DD).
  `?trend=1` adds `daily: [{ day, games, winRate }]` to tier rows and `daily: [{ day, games, avgPlacement }]` to comp rows.
- Game length and depth (D6): `/lol/champion/{id}` adds `length: [{ bucket, from, to, games, winRate, share }]` (5-minute buckets of
  `matches.duration`, `to: null` = 45 min and longer) and `depth: { players, gamesPerPlayer }`; `/lol/tiers` rows add `players` and
  `gamesPerPlayer` (distinct puuids per champion+role; with bracket=all a player seen in two brackets counts twice). Matches stored
  before the column existed get `duration` from `npm run -s backfill-length` (raw retention window only), then `aggregate`.
- `GET /lol/draft?role=MIDDLE&allies=7,64&enemies=9,8:TOP&bans=1,2&pool=103,99&patch&region&bracket&limit` (D8, champ select;
  `pool` optional: only those champions, any sample) →
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
  so Master+ LP is at most 30 min old; `division` is null for Master+. For TFT, Riot's ladder `wins` are top-4 finishes and `losses`
  bottom-4, so a TFT row's `winRate` is the ladder **top-4 rate** (not 1st places); `crawled.top4Rate` is the same from our boards. TFT rows add `crawled: { games, avgPlacement, top4Rate }` over
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
  `{ patch, region, bracket, minGames, boards, comps: [{ id, traits, carry, units, games, avgPlacement, top4Rate, winRate, pickRate, lowSample }] }`, top 200 by games
  (`units` = up to 9 units on at least 30% of the comp's boards, most frequent first; `activeTraits` = its 8 most frequent
  `{ key: "<trait>:<tier>", frequency }`, the shape of `/tft/comp/{id}`)
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

**TFT comp rule (DONI-577, 2026-10-20):** per patch, every carry (the unit holding the most items, then star, cost, name) gets a label,
the non-unique trait active on most of its boards (id `"<trait>,<carry>"`, e.g. `DA_Riftbeast18,DA_Krug18`). Carries with 200+ boards get a
centroid: the units on at least 30% of their boards (at most 9). Every board then joins the centroid whose unit set it overlaps most
(Jaccard >= 0.3; ties: the bigger comp), else its own carry comp, so a board counts toward the comp it looks like, whoever holds
the items (`src/tft-comps.js`, in the aggregation worker, ~22 s on 390k boards). History: DONI-502 keyed each board by its top
trait (it split one carry by how far the board got); D14 keyed by carry (5-cost carries read optimistic: a 5-cost only holds the
most items on boards that lasted). Against MetaTFT the mean gap over 7 matched comps went 0.46 -> 0.25 places (Elder Dragon 3.55 ->
4.16 vs 4.50, Alune 3.25 -> 3.95 vs 4.29). `tft_participants.comp` stores the carry; `npm run -s backfill-comps` re-derives it from
raw. `/tft/units` counts a unit once per board (its highest star), like MetaTFT's frequency.

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
npm run backfill-modes   # one-off (DONI-596, stop the service first): flex rows stored before DONI-596 get "-flex"; the next aggregation pass rebuilds those patches
npm run backfill-patch   # one-off (stop the service first; db busy_timeout is 5 s): re-derive patch/set from stored raw for '?' rows, drop stale '?' stats; then run aggregate (Docker: node src/main.js backfill-patch)
npm run aggregate        # rebuild all stats now (every patch) (in Docker: docker exec queuepop-crawler node src/main.js aggregate)
```

`fixtures/` holds schema-faithful responses (Riot DTO shapes, synthetic values): 3 ladder lists,
3 entries pages, 3 id lists and 3 matches each for League and TFT, plus 3 League timelines (with item purchase, undo and sell events consistent with the matches' final items).

## Get a personal API key

1. Sign in at https://developer.riotgames.com with the Riot account that owns the project.
2. Register Product → Personal API Key; describe queuePop's stats crawler for personal use.
3. The key arrives on the dashboard once approved; it does not expire. One key per product, never more.

## Accuracy check, 2026-10-20

Ours (patch 16.20, all four regions, after the 09:12Z pass) against lolalytics.com (champion pages, Master+, 16.20, global) and
metatft.com (units and comps, Platinum+, last 3 days, 18.4b), read 08:10–09:30Z. Lolalytics' rates average 52.37% at Master+
(they count the bracket's own players; we count all ten), so their win rate is shown normalised to a 50% average
(theirs − 2.37). Noise = 1 SE of our win rate, √(p(1−p)/n); "noise" = within 2 SE.

**First finding (fixed, #127): our "Emerald+" was Master+.** The crawl asked the oldest-asked player first, highest tier among
equals, so after two days 95% of 16.20's League matches were Master+ (participants: Master 299k, GM 63k, Challenger 22k, Diamond
49k, Emerald 20k). Against Lolalytics' Emerald+ our win/pick/ban were off by several points; against its Master+ (below) win rates
agree within noise. Sampling now targets each tier's population share (floored at 4%), so the default bracket converges on real
Emerald+ within about a day; 16.20's Master+-heavy rows stay until the patch turns over. Until then compare against Master+.

League, the 15 most-played champions in their main role:

| Champion | our games | win ours / theirs (norm.) | Δ (1 SE) | pick ours / theirs | ban ours / theirs | keystone | core (our games) | worst counters ours / theirs |
|---|---|---|---|---|---|---|---|---|
| Jhin bottom | 9,887 | 49.5 / 49.4 | +0.1 (±0.5) noise | 20.0 / 18.33 | 2.2 / 1.65 | Fleet Footwork / Fleet Footwork ✓ | Hubris › Phantom Dancer › Infinity Edge (156) / Hubris › Boots of Swiftness › Phantom Dancer: 2/3 | Swain (115), Corki (178) / Aurelion Sol, Yasuo: 0/2 |
| Lee Sin jungle | 8,135 | 50.4 / 49.6 | +0.8 (±0.6) noise | 16.4 / 15.93 | 22.6 / 20.87 | Conqueror / Conqueror ✓ | Eclipse › Black Cleaver › Mercury's Treads (55) / Eclipse › Plated Steelcaps › Black Cleaver: 2/3 | Skarner (150), Zyra (115) / Zyra, Rammus: 1/2 |
| Kai'Sa bottom | 7,240 | 49.6 / 49.8 | -0.3 (±0.6) noise | 14.6 / 18.5 | 1.8 / 3.03 | Lethal Tempo / Lethal Tempo ✓ | Kraken Slayer › Guinsoo's Rageblade › Terminus (195) / Kraken Slayer › Guinsoo's Rageblade › Gluttonous Greaves: 2/3 | Swain (83), Lucian (303) / Swain, Kog'Maw: 1/2 |
| Nautilus utility | 6,729 | 50.3 / 49.0 | +1.3 (±0.6) **out** | 13.6 / 11.28 | 11.6 / 13.5 | Aftershock / Aftershock ✓ | Locket of the Iron Solari › Plated Steelcaps › Knight's Vow (52) / Celestial Opposition › Locket of the Iron Solari › Boots of Swiftness: 1/3 | Pantheon (140), Neeko (75) / Rell, Renata Glasc: 0/2 |
| Tristana bottom | 6,789 | 51.6 / 51.2 | +0.4 (±0.6) noise | 13.7 / 11.77 | 16.2 / 10.87 | Lethal Tempo / Lethal Tempo ✓ | Yun Tal Wildarrows › Infinity Edge › Navori Flickerblade (137) / Yun Tal Wildarrows › Infinity Edge › Berserker's Greaves: 2/3 | Xayah (311), Lucian (307) / Hwei, Corki: 1/2 |
| Thresh utility | 6,902 | 52.9 / 52.5 | +0.4 (±0.6) noise | 13.9 / 15.72 | 12.0 / 12.91 | Aftershock / Aftershock ✓ | Boots of Swiftness › Locket of the Iron Solari › Knight's Vow (101) / Solstice Sleigh › Boots of Swiftness › Locket of the Iron Solari: 2/3 | Zilean (84), Poppy (87) / Janna, Rell: 0/2 |
| Lulu utility | 6,261 | 50.5 / 49.7 | +0.8 (±0.6) noise | 12.7 / 13.99 | 14.6 / 15.15 | Summon Aery / Summon Aery ✓ | Ardent Censer › Ionian Boots of Lucidity › Mikael's Blessing (59) / Dream Maker › Ardent Censer › Ionian Boots of Lucidity: 2/3 | Senna (228), Sona (168) / Vel'Koz, Taric: 0/2 |
| Jinx bottom | 5,838 | 51.7 / 52.1 | -0.4 (±0.7) noise | 11.8 / 14.16 | 3.8 / 5.1 | Lethal Tempo / Lethal Tempo ✓ | Hexoptics C44 › Runaan's Hurricane › Infinity Edge (117) / Hexoptics C44 › Berserker's Greaves › Runaan's Hurricane: 2/3 | Smolder (62), Twitch (124) / Twitch, Ziggs: 1/2 |
| Yunara bottom | 5,494 | 49.8 / 49.5 | +0.3 (±0.7) noise | 11.1 / 11.37 | 7.5 / 7.45 | Lethal Tempo / Lethal Tempo ✓ | Yun Tal Wildarrows › Runaan's Hurricane › Infinity Edge (117) / Yun Tal Wildarrows › Gluttonous Greaves › Runaan's Hurricane: 2/3 | Draven (131), Caitlyn (355) / Veigar, Tristana: 1/2 |
| Ezreal bottom | 5,176 | 45.7 / 45.8 | -0.1 (±0.7) noise | 10.5 / 11 | 4.5 / 4.37 | Lethal Tempo / Lethal Tempo ✓ | Trinity Force › Endless Hunger › Spear of Shojin (34) / Trinity Force › Ionian Boots of Lucidity › Manamune: 1/3 | Twitch (90), Kalista (176) / Yasuo, Hwei: 0/2 |
| Caitlyn bottom | 5,138 | 48.4 / 49.2 | -0.8 (±0.7) noise | 10.4 / 11.4 | 11.4 / 16.85 | Lethal Tempo / Lethal Tempo ✓ | Hexoptics C44 › Infinity Edge › Lord Dominik's Regards (82) / Hexoptics C44 › Berserker's Greaves › Infinity Edge: 2/3 | Viktor (84), Kai'Sa (284) / Hwei, Syndra: 0/2 |
| Locke middle | 4,982 | 50.1 / 49.8 | +0.3 (±0.7) noise | 10.1 / 8.99 | 36.8 / 36.57 | Electrocute / Electrocute ✓ | Lich Bane › Shadowflame › Zhonya's Hourglass (50) / Lich Bane › Sorcerer's Shoes › Shadowflame: 2/3 | Zoe (106), Irelia (75) / Akshan, Yone: 0/2 |
| Alistar utility | 4,904 | 52.2 / 52.1 | +0.1 (±0.7) noise | 9.9 / 7.48 | 3.6 / 2.73 | Aftershock / Aftershock ✓ | Boots of Swiftness › Zeke's Convergence › Knight's Vow (40) / Celestial Opposition › Boots of Swiftness › Zeke's Convergence: 2/3 | Galio (54), Neeko (73) / Taric, Janna: 1/2 |
| Graves jungle | 4,802 | 49.1 / 49.5 | -0.3 (±0.7) noise | 9.7 / 9.09 | 11.3 / 11.89 | Dark Harvest / Dark Harvest ✓ | Hubris › The Collector › Lord Dominik's Regards (94) / Hubris › The Collector › Lord Dominik's Regards: 3/3 | Shyvana (64), Zac (51) / Naafiri, Sejuani: 0/2 |
| Syndra middle | 4,792 | 51.1 / 50.1 | +1.0 (±0.7) noise | 9.7 / 8.26 | 15.9 / 10.2 | Arcane Comet / Arcane Comet ✓ | Blackfire Torch › Cosmic Drive › Rabadon's Deathcap (21) / Luden's Echo › Sorcerer's Shoes › Shadowflame: 0/3 | Cassiopeia (48), Yasuo (158) / Katarina, Fizz: 0/2 |

**Verdicts, League.** Win rate: 14 of 15 within 2 SE; Nautilus is 2.2 SE (+1.3 points), about what one row in fifteen does by
chance. Keystone: 15/15. Pick and ban: systematic, not a counting bug: we weight our four regions equally (oc1 gets a quarter of
the sample although it is a small server), Lolalytics weights every region by volume; per region they agree (KR Lee Sin pick ours
26.7% vs 24.7%). Core: 2/3 items in common for 11 of 15; the third is almost always boots. Two causes, both found here:
components and starters took build slots (fixed, #130: only completed items count) and tier-2 boots auto-upgrade to tier 3 late
in the game with no purchase event, so they fell out of the final-inventory filter (fixed going forward in this PR; timelines
already stored keep the old gap). Still open: support quest finals (Solstice Sleigh, Celestial Opposition) upgrade from World
Atlas without any purchase event, so support cores start at the second completed item; Syndra's 0/3 rests on 21 games.
Counters: our "worst two" are lane opponents (same role) with 50–350 games each, ±3–7 points per matchup, so their order is
inside noise; Lolalytics also counts non-lane enemies (Lux and Aurelion Sol against Jhin).

TFT, the 15 most-played units (ours count a unit once per board since #132) and our top 10 comps:

| Unit | our boards | avg place ours / MetaTFT | Δ | frequency ours / MetaTFT |
|---|---|---|---|---|
| Sentinel | 150,928 | 4.33 / 4.27 | +0.06 | 39.1% / 38.9% |
| Amumu | 113,046 | 4.43 / 4.35 | +0.08 | 29.3% / 29.6% |
| Fiddlesticks | 111,444 | 4.46 / 4.45 | +0.01 | 28.8% / 25.7% |
| Diana | 100,983 | 4.42 / 4.47 | -0.05 | 26.1% / 26.5% |
| Taric | 85,700 | 3.93 / 3.89 | +0.04 | 22.2% / 25.6% |
| Krug | 79,888 | 4.41 / 4.37 | +0.04 | 20.7% / 17% |
| Ornn | 77,577 | 4.45 / 4.56 | -0.11 | 20.1% / 18.6% |
| Soraka | 73,103 | 4.29 / 4.15 | +0.14 | 18.9% / 16.8% |
| Vi | 71,371 | 4.61 / 4.63 | -0.02 | 18.5% / 17.6% |
| Hecarim | 70,095 | 4.56 / 4.61 | -0.05 | 18.1% / 19% |
| Ezreal | 68,024 | 4.31 / 4.29 | +0.02 | 17.6% / 17.2% |
| Aphelios | 65,932 | 4.25 / 4.21 | +0.04 | 17.1% / 16.6% |
| Kennen | 65,304 | 3.96 / 3.95 | +0.01 | 16.9% / 20.2% |
| Gnar | 64,851 | 3.80 / 3.77 | +0.03 | 16.8% / 17.8% |
| Sett | 63,892 | 4.48 / 4.50 | -0.02 | 16.5% / 12.9% |

| Comp (ours: trait + carry) | our boards | avg place ours / MetaTFT (same carry) | board share ours / MetaTFT |
|---|---|---|---|
| Rapidfire Aphelios | 35,884 | 4.33 / 4.31 | 9.3% / 7.3% |
| Spellweaver Ahri | 29,592 | 4.71 / 4.46 | 7.7% / 3.6% |
| Executioner Azir | 21,990 | 3.95 / 4.17 | 5.7% / 7.5% |
| Riftbeast Krug | 16,461 | 3.72 / no comp with that carry | 4.3% / — |
| Spellweaver Cassiopeia | 12,746 | 4.00 / no comp with that carry | 3.3% / — |
| Brawler Alistar | 12,397 | 3.84 / 4.24 | 3.2% / 0.9% |
| Riftbeast Elder Dragon | 12,022 | 3.55 / 4.50 | 3.1% / 9.9% |
| Blackthorn Malphite | 11,565 | 4.97 / 4.60 | 3.0% / 2.0% |
| Vanguard Alune | 11,079 | 3.25 / 4.29 | 2.9% / 1.5% |
| Executioner Ezreal | 10,093 | 5.40 / no comp with that carry | 2.6% / — |

**Verdicts, TFT.** Units: average placement within ±0.15 for all 15 (11 within ±0.06), frequency within 3 points except Krug and
Sett (+4) and Kennen/Taric (−3); MetaTFT is Platinum+ over the last 3 days, we are Emerald+ (Master+-heavy, see above) over the
whole patch, which moves both. Comps: the first rule (each board's top trait) split one carry by how far the board got, e.g.
Executioner Azir 3.01 vs Flora Fatalis Azir 5.03 against MetaTFT's 4.10; one comp per carry (#132) brings Azir to 3.95 vs 4.17
(all of MetaTFT's Azir comps, board-weighted) and Aphelios to 4.33 vs 4.31. Still outside: comps carried by a 5-cost (Elder Dragon
3.55 vs 4.50, Alune 3.25 vs 4.29, Alistar 3.84 vs 4.24). Our carry is the unit holding the most items, and a 5-cost only holds
the most items on boards that lasted long, so for those carries the label still encodes the outcome. MetaTFT clusters whole
boards by composition, which our deterministic rule can't match; follow-up issue DONI-577 (composition clustering). Until then
read the avg place of a 5-cost-carry comp as optimistic.

**Update 10:25Z (DONI-577 live, #160 + #170):** comps are now clustered by board composition. Avg place vs MetaTFT: Azir 4.30 vs
4.17, Alistar 4.27 vs 4.24, Malphite 4.71 vs 4.60, Ahri 4.53 vs 4.46, Aphelios 4.43 vs 4.31, Elder Dragon 4.18 vs 4.50 (was 3.55),
Alune 3.88 vs 4.29 (was 3.25); the remaining 0.3–0.4 on the 5-cost comps is mostly tier mix (16.20 is Master+-heavy here,
MetaTFT is Platinum+). League `region=all` rates are now population-weighted (#158; euw1 42%, kr 38%, na1 18%, oc1 2%).

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

Updates (from the repo root on the dev PC; never copies `.env`, `data/` or `backups/`). `backfill-comps` rewrites every TFT board and took
~10 min of downtime on 2026-10-20 (2.2 GB DB); `backfill-length`/`backfill-players` 2-3 min each.

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
