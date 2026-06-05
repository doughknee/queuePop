# lol-career-stats

*13 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-career-stats/v1/champion-averages/season/{season}/{championId}/{position}/{tier}/{queue}` |  |
| GET | `/lol-career-stats/v1/champion-averages/{championId}/{position}/{tier}/{queue}` |  |
| GET | `/lol-career-stats/v1/champion-experts/season/{season}/{championId}/{position}` |  |
| GET | `/lol-career-stats/v1/champion-experts/{championId}/{position}` |  |
| POST | `/lol-career-stats/v1/champion-stats-percentiles` |  |
| GET | `/lol-career-stats/v1/position-averages/season/{season}/{position}/{tier}/{queue}` |  |
| GET | `/lol-career-stats/v1/position-averages/{position}/{tier}/{queue}` |  |
| GET | `/lol-career-stats/v1/position-experts/season/{season}/{position}` |  |
| GET | `/lol-career-stats/v1/position-experts/{position}` |  |
| POST | `/lol-career-stats/v1/position-stats-percentiles` |  |
| GET | `/lol-career-stats/v1/summoner-games/{puuid}` |  |
| GET | `/lol-career-stats/v1/summoner-games/{puuid}/season/{season}` |  |
| GET | `/lol-career-stats/v1/summoner-stats/{puuid}/{season}/{queue}/{position}` |  |

---

### `GET /lol-career-stats/v1/champion-averages/season/{season}/{championId}/{position}/{tier}/{queue}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `season` | path | integer (int32) | yes |  |
| `championId` | path | integer (int32) | yes |  |
| `position` | path | string , x ∈ { ALL , UNKNOWN , TOP , JUNGLE , MID , BOTTOM , SUPPORT } | yes |  |
| `tier` | path | string , x ∈ { ALL , UNRANKED , IRON , BRONZE , SILVER , GOLD , PLATINUM , DIAMOND , MASTER , GRANDMASTER , CHALLENGER } | yes |  |
| `queue` | path | string , x ∈ { draft5 , rank5flex , rank5solo , blind5 , aram , blind3 , rank3flex , other } | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-career-stats/v1/champion-averages/{championId}/{position}/{tier}/{queue}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `championId` | path | integer (int32) | yes |  |
| `position` | path | string , x ∈ { ALL , UNKNOWN , TOP , JUNGLE , MID , BOTTOM , SUPPORT } | yes |  |
| `tier` | path | string , x ∈ { ALL , UNRANKED , IRON , BRONZE , SILVER , GOLD , PLATINUM , DIAMOND , MASTER , GRANDMASTER , CHALLENGER } | yes |  |
| `queue` | path | string , x ∈ { draft5 , rank5flex , rank5solo , blind5 , aram , blind3 , rank3flex , other } | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-career-stats/v1/champion-experts/season/{season}/{championId}/{position}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `season` | path | integer (int32) | yes |  |
| `championId` | path | integer (int32) | yes |  |
| `position` | path | string , x ∈ { ALL , UNKNOWN , TOP , JUNGLE , MID , BOTTOM , SUPPORT } | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-career-stats/v1/champion-experts/{championId}/{position}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `championId` | path | integer (int32) | yes |  |
| `position` | path | string , x ∈ { ALL , UNKNOWN , TOP , JUNGLE , MID , BOTTOM , SUPPORT } | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-career-stats/v1/champion-stats-percentiles`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-career-stats/v1/position-averages/season/{season}/{position}/{tier}/{queue}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `season` | path | integer (int32) | yes |  |
| `position` | path | string , x ∈ { ALL , UNKNOWN , TOP , JUNGLE , MID , BOTTOM , SUPPORT } | yes |  |
| `tier` | path | string , x ∈ { ALL , UNRANKED , IRON , BRONZE , SILVER , GOLD , PLATINUM , DIAMOND , MASTER , GRANDMASTER , CHALLENGER } | yes |  |
| `queue` | path | string , x ∈ { draft5 , rank5flex , rank5solo , blind5 , aram , blind3 , rank3flex , other } | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-career-stats/v1/position-averages/{position}/{tier}/{queue}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `position` | path | string , x ∈ { ALL , UNKNOWN , TOP , JUNGLE , MID , BOTTOM , SUPPORT } | yes |  |
| `tier` | path | string , x ∈ { ALL , UNRANKED , IRON , BRONZE , SILVER , GOLD , PLATINUM , DIAMOND , MASTER , GRANDMASTER , CHALLENGER } | yes |  |
| `queue` | path | string , x ∈ { draft5 , rank5flex , rank5solo , blind5 , aram , blind3 , rank3flex , other } | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-career-stats/v1/position-experts/season/{season}/{position}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `season` | path | integer (int32) | yes |  |
| `position` | path | string , x ∈ { ALL , UNKNOWN , TOP , JUNGLE , MID , BOTTOM , SUPPORT } | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-career-stats/v1/position-experts/{position}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `position` | path | string , x ∈ { ALL , UNKNOWN , TOP , JUNGLE , MID , BOTTOM , SUPPORT } | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-career-stats/v1/position-stats-percentiles`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-career-stats/v1/summoner-games/{puuid}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `puuid` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-career-stats/v1/summoner-games/{puuid}/season/{season}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `puuid` | path | string | yes |  |
| `season` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-career-stats/v1/summoner-stats/{puuid}/{season}/{queue}/{position}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `puuid` | path | string | yes |  |
| `season` | path | integer (int32) | yes |  |
| `queue` | path | string , x ∈ { draft5 , rank5flex , rank5solo , blind5 , aram , blind3 , rank3flex , other } | yes |  |
| `position` | path | string , x ∈ { ALL , UNKNOWN , TOP , JUNGLE , MID , BOTTOM , SUPPORT } | yes |  |
| `championId` | query | integer (int32) |  |  |

**Responses**

- **200 OK** — Successful response

---
