# queuePop stats crawler

Crawls ranked League (solo 420, flex 440) and TFT (ranked 1100) matches with one Riot **personal**
API key, stores them in SQLite, aggregates per-patch stats, and serves them as JSON for the app's
League and TFT worlds. Node 24, no dependencies (`node:sqlite`, `node:http`).

```
seed   league-v4 / tft-league-v1 ladders, MIN_TIER and up, top down  -> players
ids    match-v5 / tft-match-v1 by-puuid ids, newest first            -> matches (status new; the match id
       is the primary key, so a match seen by ten players is fetched once)
fetch  one match per request: raw JSON gzipped + normalised rows     -> matches.raw, *_participants
       + a timeline for TIMELINE_SAMPLE of League matches             -> lol_participants.skills
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
| `ADMIN_TOKEN` | none | bearer token for `POST /admin/key` and the status page form. Unset: the endpoint returns 503 |
| `REGIONS` | `na1,kr` | platform ids; add `euw1,eun1` if quota allows |
| `MIN_TIER` | `EMERALD` | lowest ladder tier seeded |
| `QUEUES` | `420,440,1100` | drop 1100 to skip TFT, drop 420/440 to skip League |
| `DB_PATH` | `data/crawler.db` | `/data/crawler.db` in the image |
| `PORT` | `47900` | |
| `TIMELINE_SAMPLE` | `0.1` | share of League matches that also fetch a timeline (skill order); each costs one more request |
| `AGGREGATE_EVERY_MIN` | `60` | minutes between aggregation passes; one runs on start if the last is older. Only patches with new matches are recomputed |
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
`bracket` (minimum tier: `emerald` = Emerald and above; default `all`), `min_games` (default 200).
Rates are 0..1, 4 decimals. Every row carries `games` (its sample size) and `lowSample: games < min_games`:
low-sample rows are kept and flagged so the UI greys them, never dropped. Responses echo `minGames`.
Champion ids are Riot numeric keys (Data Dragon `key`); build keys are strings.

- `GET /health` → `{ ok, version }`
- `GET /status` → `{ matches: {lol: {done, new, skip, missing}, tft}, players: {lol, tft}, lastFetch, aggregatedAt, nextAggregation, aggregateEveryMin, retentionDays, disk: { dbBytes, walBytes, rawBytes, rawMatches }, key, seed, rateLimits }`
- `GET /` → the status page (`src/status.html`, one static file): progress, per-bucket usage bars, DB size, key source,
  and a form to paste a new Riot key (password + admin token). Refreshes every 10 s.
- `POST /admin/key` `{ "key": "RGAPI-…" }` with `Authorization: Bearer <ADMIN_TOKEN>` → stores the key in the `meta` table.
  The Riot client reads it (meta first, `RIOT_API_KEY` second) on every request, so no restart. 401 bad/missing token,
  400 malformed key, 503 no `ADMIN_TOKEN` configured. The key is never logged or returned; `/status` shows
  `key: { source: "meta"|"env"|"none", set_at }`. `/` and `/admin/*` answer only loopback and private-LAN
  sources (10/8, 172.16/12, 192.168/16); others get 403.
- `GET /patches` → `{ lol: ["16.20", ...], tft: [...] }` newest first
- `GET /lol/tiers?patch&region&bracket&role` (role `top|jungle|middle|bottom|utility`) →
  `{ patch, region, bracket, minGames, role, matches, champions: [{ champion, role, games, wins, winRate, pickRate, banRate, lowSample }] }`
  sorted by games. One row per champion × role.
- `GET /lol/champion/{id}?patch&region&bracket&role` (role defaults to the most played) →
  `{ champion, role, roles: [{role, games}], strip: { games, wins, winRate, pickRate, banRate, matches, lowSample },
  builds: { item, keystone, rune, spells, skills: [{ key, games, winRate, pickRate, lowSample }] }, matchups: [{ opponent, games, winRate, lowSample }] }`.
  `spells` keys are `"4,14"` (sorted ids). `skills` keys are the max order, e.g. `"QEW"`; they come from the
  timeline sample, so their `pickRate` is out of the sampled games. Matchups are the enemy in the same role.
- `GET /tft/comps?patch&region&bracket` →
  `{ patch, region, bracket, minGames, boards, comps: [{ id, traits, games, avgPlacement, top4Rate, winRate, pickRate, lowSample }] }`, top 200 by games
- `GET /tft/comp/{id}` (id URL-encoded) → the comp row plus `units` and `augments`: `[{ key, games, frequency, avgPlacement, top4Rate, lowSample }]`; 404 when unknown

**TFT comp rule:** a comp is the sorted, comma-joined set of traits at their second breakpoint or higher
(`tier_current >= 2`), e.g. `TFT16_Bastion,TFT16_Sorcerer`; `none` when there is none. Deliberately
simple; MetaTFT-style clustering is a later issue.

**Brackets:** a match's bracket is the ladder tier of the seeded player whose history surfaced it.

**Not collected:** item build order (needs a timeline for every match, halving throughput). Raw match JSON is kept gzipped in `matches.raw`, so new stats can be
recomputed without refetching.

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

## Run and test

```bash
npm test                 # rate limiter, pipeline on fixtures, aggregation math
npm run mock             # mock Riot API on :47901 serving fixtures/
RIOT_API_KEY=x RIOT_BASE_URL=http://127.0.0.1:47901 REGIONS=na1 npm start
npm run aggregate        # rebuild all stats now (every patch) (in Docker: docker exec queuepop-crawler node src/main.js aggregate)
```

`fixtures/` holds schema-faithful responses (Riot DTO shapes, synthetic values): 3 ladder lists,
3 entries pages, 3 id lists and 3 matches each for League and TFT, plus 3 League timelines.

## Get a personal API key

1. Sign in at https://developer.riotgames.com with the Riot account that owns the project.
2. Register Product → Personal API Key; describe queuePop's stats crawler for personal use.
3. The key arrives on the dashboard once approved; it does not expire. One key per product, never more.

## Deploy to Unraid

```bash
scp -r crawler root@unraid:/mnt/user/appdata/queuepop-crawler
cd /mnt/user/appdata/queuepop-crawler && cp .env.example .env   # paste RIOT_API_KEY, set TZ
docker compose up -d --build
curl http://127.0.0.1:47900/status
docker compose logs -f
```

## Production key later

Once the League and TFT pages visibly work, Register Product → Production API Key on the developer
portal with a description, screenshots, and a working prototype; Riot reviews it (weeks) and grants
much higher limits. Swap the key (status page or `POST /admin/key`, or `RIOT_API_KEY`); the limiter picks up the new limits from the response headers.
