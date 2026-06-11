# lol-champ-select

*Refreshed against live client 16.12.785.1316 (2026-06-10) via `GET /help`; the rest of docs/lcu is still the 8.24 scrape.*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-champ-select/v1/all-grid-champions` |  |
| GET | `/lol-champ-select/v1/bannable-champion-ids` | was `bannable-champions` in 8.24 |
| POST | `/lol-champ-select/v1/battle-training/launch` |  |
| GET | `/lol-champ-select/v1/current-champion` |  |
| GET | `/lol-champ-select/v1/disabled-champion-ids` | was `disabled-champions` |
| GET | `/lol-champ-select/v1/grid-champions/{championId}` |  |
| GET | `/lol-champ-select/v1/muted-players` |  |
| GET | `/lol-champ-select/v1/ongoing-champion-swap` | active champ-trade popup |
| GET | `/lol-champ-select/v1/ongoing-pick-order-swap` | active pick-spot-swap popup |
| GET | `/lol-champ-select/v1/ongoing-position-swap` | active role-swap popup |
| POST | `/lol-champ-select/v1/ongoing-champion-swap/{id}/clear` |  |
| POST | `/lol-champ-select/v1/ongoing-pick-order-swap/{id}/clear` |  |
| POST | `/lol-champ-select/v1/ongoing-position-swap/{id}/clear` |  |
| GET | `/lol-champ-select/v1/pickable-champion-ids` | was `pickable-champions` |
| GET | `/lol-champ-select/v1/pickable-skin-ids` | was `pickable-skins` |
| GET | `/lol-champ-select/v1/pin-drop-notification` |  |
| POST | `/lol-champ-select/v1/retrieve-latest-game-dto` |  |
| GET | `/lol-champ-select/v1/session` |  |
| PATCH | `/lol-champ-select/v1/session/actions/{id}` |  |
| POST | `/lol-champ-select/v1/session/actions/{id}/complete` |  |
| POST | `/lol-champ-select/v1/session/bench/swap/{championId}` | ARAM bench grab |
| GET | `/lol-champ-select/v1/session/champion-swaps` |  |
| GET | `/lol-champ-select/v1/session/champion-swaps/{id}` |  |
| POST | `/lol-champ-select/v1/session/champion-swaps/{id}/accept` |  |
| POST | `/lol-champ-select/v1/session/champion-swaps/{id}/cancel` |  |
| POST | `/lol-champ-select/v1/session/champion-swaps/{id}/decline` |  |
| POST | `/lol-champ-select/v1/session/champion-swaps/{id}/request` |  |
| GET | `/lol-champ-select/v1/session/my-selection` |  |
| PATCH | `/lol-champ-select/v1/session/my-selection` |  |
| POST | `/lol-champ-select/v1/session/my-selection/reroll` |  |
| GET | `/lol-champ-select/v1/session/pick-order-swaps` |  |
| GET | `/lol-champ-select/v1/session/pick-order-swaps/{id}` |  |
| POST | `/lol-champ-select/v1/session/pick-order-swaps/{id}/accept` |  |
| POST | `/lol-champ-select/v1/session/pick-order-swaps/{id}/cancel` |  |
| POST | `/lol-champ-select/v1/session/pick-order-swaps/{id}/decline` |  |
| POST | `/lol-champ-select/v1/session/pick-order-swaps/{id}/request` |  |
| GET | `/lol-champ-select/v1/session/position-swaps` |  |
| POST | `/lol-champ-select/v1/session/position-swaps/{id}/accept` |  |
| POST | `/lol-champ-select/v1/session/position-swaps/{id}/cancel` |  |
| POST | `/lol-champ-select/v1/session/position-swaps/{id}/decline` |  |
| POST | `/lol-champ-select/v1/session/position-swaps/{id}/request` |  |
| POST | `/lol-champ-select/v1/session/simple-inventory` |  |
| GET | `/lol-champ-select/v1/session/timer` |  |
| GET | `/lol-champ-select/v1/sfx-notifications` |  |
| GET | `/lol-champ-select/v1/skin-carousel-skins` |  |
| GET | `/lol-champ-select/v1/skin-selector-info` |  |
| GET | `/lol-champ-select/v1/summoners/{slotId}` |  |
| GET | `/lol-champ-select/v1/team-boost` |  |
| POST | `/lol-champ-select/v1/team-boost/purchase` |  |
| POST | `/lol-champ-select/v1/toggle-favorite/{championId}/{position}` |  |
| POST | `/lol-champ-select/v1/toggle-player-muted` |  |

---

## Swaps (champ trades, pick-spot swaps, role swaps)

The 8.24-era `/session/trades/*` routes are **gone** (404 "Invalid URI format").
Swaps now come in three parallel families, each with identical
`request/accept/decline/cancel` actions taking only the swap `id`:

| Family | Session field | Action routes |
| --- | --- | --- |
| Champion trade | `trades` (legacy name kept!) | `/session/champion-swaps/{id}/…` |
| Pick-spot swap | `pickOrderSwaps` | `/session/pick-order-swaps/{id}/…` |
| Role swap | `positionSwaps` | `/session/position-swaps/{id}/…` |

Gotcha: the session JSON still calls champion swaps `trades`, so session reads
keep working while POSTs to the old `/session/trades/{id}/request` 404 — that
mismatch silently broke auto-trades until 2026-06-10.

All three arrays hold the same contract (`ChampSelectSwapContract`):

```json
{ "id": 38, "cellId": 2, "state": "AVAILABLE" }
```

`state` is one of `AVAILABLE`, `BUSY`, `INVALID`, `RECEIVED`, `SENT`,
`DECLINED`, `CANCELLED`, `ACCEPTED`. `RECEIVED` = incoming request to act on;
`AVAILABLE` = we may send a request to that cell.

The `/ongoing-*-swap` GETs return the swap popup currently shown to the local
player (404 "No ongoing … swap." otherwise), e.g. for position swaps:

```json
{ "id": 1, "requestorIndex": 0, "responderIndex": 3,
  "requesterPosition": "middle", "responderPosition": "jungle",
  "state": "RECEIVED", "otherSummonerIndex": 3,
  "initiatedByLocalPlayer": false, "type": "POSITION" }
```

`POST /ongoing-*-swap/{id}/clear` dismisses that popup without answering.

Mirrored (same shapes) under `/lol-lobby-team-builder/champ-select/v1/…` and a
`/lol-champ-select-legacy/v1/session/champion-swaps/…` family for legacy
queues; queuePop uses the `/lol-champ-select/v1` family for everything below.

## ARAM subset pick (the "choose from 2-3" window)

`allowSubsetChampionPicks: true` in the session. The offered champion ids are
exposed ONLY by the lobby-team-builder mirror:

```
GET /lol-lobby-team-builder/champ-select/v1/subset-champion-list  →  [518, 895]
```

(404 "no available pickable subset champion data" outside the window.) The ids
are not in the session, not in `pickable-champion-ids` (whole roster), and not
flagged in the grid or disabled lists. Picking uses the normal action flow —
PATCH hover, then PATCH `completed: true` — and works (verified live, client
16.12), **but only for champs in the subset**: a PATCH for any other champ
returns 204 and is silently ignored.
