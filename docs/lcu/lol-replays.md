# lol-replays

*10 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-replays/v1/configuration` |  |
| GET | `/lol-replays/v1/metadata/{gameId}` |  |
| POST | `/lol-replays/v1/metadata/{gameId}/create/gameVersion/{gameVersion}/gameType/{gameType}/queueId/{queueId}` |  |
| GET | `/lol-replays/v1/rofls/path` |  |
| GET | `/lol-replays/v1/rofls/path/default` |  |
| POST | `/lol-replays/v1/rofls/scan` |  |
| POST | `/lol-replays/v1/rofls/{gameId}/download` |  |
| POST | `/lol-replays/v1/rofls/{gameId}/download/graceful` |  |
| POST | `/lol-replays/v1/rofls/{gameId}/watch` |  |
| POST | `/lol-replays/v2/metadata/{gameId}/create` |  |

---

### `GET /lol-replays/v1/configuration`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-replays/v1/metadata/{gameId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-replays/v1/metadata/{gameId}/create/gameVersion/{gameVersion}/gameType/{gameType}/queueId/{queueId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameId` | path | integer (int64) | yes |  |
| `gameVersion` | path | string | yes |  |
| `gameType` | path | string | yes |  |
| `queueId` | path | integer (int32) | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /lol-replays/v1/rofls/path`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-replays/v1/rofls/path/default`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-replays/v1/rofls/scan`

**Responses**

- **204 No Content** — No content

---

### `POST /lol-replays/v1/rofls/{gameId}/download`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameId` | path | integer (int64) | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-replays/v1/rofls/{gameId}/download/graceful`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameId` | path | integer (int64) | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-replays/v1/rofls/{gameId}/watch`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameId` | path | integer (int64) | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-replays/v2/metadata/{gameId}/create`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameId` | path | integer (int64) | yes |  |

**Responses**

- **204 No Content** — No content

---
