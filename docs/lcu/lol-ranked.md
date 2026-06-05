# lol-ranked

*12 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-ranked/v1/apex-leagues/{queueType}/{tier}` |  |
| GET | `/lol-ranked/v1/current-lp-change-notification` |  |
| GET | `/lol-ranked/v1/notifications` |  |
| POST | `/lol-ranked/v1/notifications/{id}/acknowledge` |  |
| GET | `/lol-ranked/v1/ranked-dashboard/{summonerId}` |  |
| GET | `/lol-ranked/v1/ranked-overview/{summonerId}` |  |
| GET | `/lol-ranked/v1/ranked-reward-update` |  |
| GET | `/lol-ranked/v1/ranked-rewards-data` |  |
| GET | `/lol-ranked/v1/signed-ranked-dashboard` |  |
| GET | `/lol-ranked/v1/summoner-top-champs/{summonerId}` |  |
| GET | `/lol-ranked/v1/vignette-notifications` |  |
| GET | `/lol-ranked/v2/tiers` |  |

---

### `GET /lol-ranked/v1/apex-leagues/{queueType}/{tier}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `queueType` | path | string , x ∈ { NONE , SOLO5V5 , FLEXTT , FLEXSR } | yes |  |
| `tier` | path | string , x ∈ { NONE , IRON , BRONZE , SILVER , GOLD , PLATINUM , DIAMOND , MASTER , GRANDMASTER , CHALLENGER } | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-ranked/v1/current-lp-change-notification`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-ranked/v1/notifications`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-ranked/v1/notifications/{id}/acknowledge`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-ranked/v1/ranked-dashboard/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-ranked/v1/ranked-overview/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-ranked/v1/ranked-reward-update`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-ranked/v1/ranked-rewards-data`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-ranked/v1/signed-ranked-dashboard`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-ranked/v1/summoner-top-champs/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-ranked/v1/vignette-notifications`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-ranked/v2/tiers`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerIds` | query | integer[] | yes |  |
| `queueTypes` | query | object[] | yes |  |

**Responses**

- **200 OK** — Successful response

---
