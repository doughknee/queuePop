# lol-player-level-up

*3 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-player-level-up/v1/level-up` |  |
| GET | `/lol-player-level-up/v1/level-up-notifications/{pluginName}` |  |
| POST | `/lol-player-level-up/v1/level-up-notifications/{pluginName}` |  |

---

### `GET /lol-player-level-up/v1/level-up`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-player-level-up/v1/level-up-notifications/{pluginName}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `pluginName` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-player-level-up/v1/level-up-notifications/{pluginName}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `pluginName` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---
