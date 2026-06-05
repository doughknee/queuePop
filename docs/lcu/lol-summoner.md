# lol-summoner

*17 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-summoner/v1/check-name-availability/{name}` |  |
| GET | `/lol-summoner/v1/current-summoner` |  |
| GET | `/lol-summoner/v1/current-summoner/autofill` |  |
| PUT | `/lol-summoner/v1/current-summoner/icon` |  |
| GET | `/lol-summoner/v1/current-summoner/jwt` |  |
| POST | `/lol-summoner/v1/current-summoner/name` |  |
| GET | `/lol-summoner/v1/current-summoner/rerollPoints` |  |
| GET | `/lol-summoner/v1/current-summoner/summoner-profile` |  |
| POST | `/lol-summoner/v1/current-summoner/summoner-profile` |  |
| POST | `/lol-summoner/v1/current-summoner/xpInfo` |  |
| GET | `/lol-summoner/v1/summoner-profile` |  |
| GET | `/lol-summoner/v1/summoners` |  |
| POST | `/lol-summoner/v1/summoners` |  |
| GET | `/lol-summoner/v1/summoners/{id}` |  |
| GET | `/lol-summoner/v2/summoner-icons` |  |
| GET | `/lol-summoner/v2/summoner-names` |  |
| GET | `/lol-summoner/v2/summoners` |  |

---

### `GET /lol-summoner/v1/check-name-availability/{name}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `name` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v1/current-summoner`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v1/current-summoner/autofill`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-summoner/v1/current-summoner/icon`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v1/current-summoner/jwt`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-summoner/v1/current-summoner/name`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v1/current-summoner/rerollPoints`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v1/current-summoner/summoner-profile`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-summoner/v1/current-summoner/summoner-profile`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-summoner/v1/current-summoner/xpInfo`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v1/summoner-profile`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `puuid` | query | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v1/summoners`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `name` | query | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-summoner/v1/summoners`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v1/summoners/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v2/summoner-icons`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `ids` | query | integer[] | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v2/summoner-names`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `ids` | query | integer[] | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-summoner/v2/summoners`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `name` | query | string |  |  |
| `ids` | query | integer[] |  |  |

**Responses**

- **200 OK** — Successful response

---
