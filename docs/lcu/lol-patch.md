# lol-patch

*12 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-patch/v1/environment` |  |
| GET | `/lol-patch/v1/notifications` |  |
| DELETE | `/lol-patch/v1/notifications/{id}` |  |
| POST | `/lol-patch/v1/products/league_of_legends/detect-corruption-request` |  |
| GET | `/lol-patch/v1/products/league_of_legends/install-location` |  |
| POST | `/lol-patch/v1/products/league_of_legends/partial-repair-request` |  |
| POST | `/lol-patch/v1/products/league_of_legends/start-checking-request` |  |
| POST | `/lol-patch/v1/products/league_of_legends/start-patching-request` |  |
| GET | `/lol-patch/v1/products/league_of_legends/state` |  |
| POST | `/lol-patch/v1/products/league_of_legends/stop-checking-request` |  |
| POST | `/lol-patch/v1/products/league_of_legends/stop-patching-request` |  |
| PUT | `/lol-patch/v1/self-update-restart` |  |

---

### `GET /lol-patch/v1/environment`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-patch/v1/notifications`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-patch/v1/notifications/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-patch/v1/products/league_of_legends/detect-corruption-request`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-patch/v1/products/league_of_legends/install-location`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-patch/v1/products/league_of_legends/partial-repair-request`

**Responses**

- **204 No Content** — No content

---

### `POST /lol-patch/v1/products/league_of_legends/start-checking-request`

**Responses**

- **204 No Content** — No content

---

### `POST /lol-patch/v1/products/league_of_legends/start-patching-request`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-patch/v1/products/league_of_legends/state`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-patch/v1/products/league_of_legends/stop-checking-request`

**Responses**

- **204 No Content** — No content

---

### `POST /lol-patch/v1/products/league_of_legends/stop-patching-request`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `restart` | query | boolean | yes |  |

**Responses**

- **204 No Content** — No content

---

### `PUT /lol-patch/v1/self-update-restart`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `forceRestartOnSelfUpdate` | query | boolean | yes |  |

**Responses**

- **204 No Content** — No content

---
