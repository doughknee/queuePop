# lol-match-history

*8 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-match-history/v1/delta` |  |
| GET | `/lol-match-history/v1/friend-matchlists/{accountId}` |  |
| GET | `/lol-match-history/v1/game-timelines/{gameId}` |  |
| GET | `/lol-match-history/v1/games/{gameId}` |  |
| GET | `/lol-match-history/v1/matchlist` |  |
| GET | `/lol-match-history/v1/recently-played-summoners` |  |
| GET | `/lol-match-history/v1/web-url` |  |
| GET | `/lol-match-history/v2/matchlist` |  |

---

### `GET /lol-match-history/v1/delta`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-match-history/v1/friend-matchlists/{accountId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-match-history/v1/game-timelines/{gameId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-match-history/v1/games/{gameId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-match-history/v1/matchlist`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-match-history/v1/recently-played-summoners`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-match-history/v1/web-url`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-match-history/v2/matchlist`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `begIndex` | query | integer (int32) | yes |  |
| `endIndex` | query | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---
