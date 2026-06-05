# lol-player-preferences

*5 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/lol-player-preferences/v1/hash` |  |
| POST | `/lol-player-preferences/v1/player-preferences-endpoint-override` |  |
| GET | `/lol-player-preferences/v1/player-preferences-ready` |  |
| PUT | `/lol-player-preferences/v1/preference` |  |
| GET | `/lol-player-preferences/v1/preference/{type}` |  |

---

### `POST /lol-player-preferences/v1/hash`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-player-preferences/v1/player-preferences-endpoint-override`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-player-preferences/v1/player-preferences-ready`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-player-preferences/v1/preference`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-player-preferences/v1/preference/{type}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `type` | path | string | yes |  |
| `hash` | query | string |  |  |

**Responses**

- **200 OK** — Successful response

---
