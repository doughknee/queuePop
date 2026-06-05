# lol-maps

*6 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/lol-maps/v1/map` |  |
| GET | `/lol-maps/v1/map/{id}` |  |
| GET | `/lol-maps/v1/maps` |  |
| GET | `/lol-maps/v2/map/{id}/{gameMode}` |  |
| GET | `/lol-maps/v2/map/{id}/{gameMode}/{gameMutator}` |  |
| GET | `/lol-maps/v2/maps` |  |

---

### `POST /lol-maps/v1/map`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-maps/v1/map/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-maps/v1/maps`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-maps/v2/map/{id}/{gameMode}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |
| `gameMode` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-maps/v2/map/{id}/{gameMode}/{gameMutator}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |
| `gameMode` | path | string | yes |  |
| `gameMutator` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-maps/v2/maps`

**Responses**

- **200 OK** — Successful response

---
