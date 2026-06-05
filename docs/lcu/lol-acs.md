# lol-acs

*11 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/lol-acs/v1/acs-endpoint-override` |  |
| GET | `/lol-acs/v1/delta` |  |
| GET | `/lol-acs/v1/games/{gameId}` |  |
| GET | `/lol-acs/v1/gametimelines/{gameId}` |  |
| GET | `/lol-acs/v1/matchlists/{accountId}` |  |
| GET | `/lol-acs/v1/recently-played-champions/{accountId}` |  |
| GET | `/lol-acs/v2/matchlists` |  |
| GET | `/lol-acs/v2/recently-played-champions/current-summoner` |  |
| GET | `/lol-acs/v2/recently-played-champions/{accountId}` |  |
| GET | `/lol-acs/v2/request-recently-played-champions/current-summoner` |  |
| GET | `/lol-acs/v2/request-recently-played-champions/{accountId}` |  |

---

### `POST /lol-acs/v1/acs-endpoint-override`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-acs/v1/delta`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-acs/v1/games/{gameId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-acs/v1/gametimelines/{gameId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-acs/v1/matchlists/{accountId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-acs/v1/recently-played-champions/{accountId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | path | integer (int64) | yes |  |
| `force` | query | boolean | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-acs/v2/matchlists`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | query | integer (int64) | yes |  |
| `begIndex` | query | integer (int32) | yes |  |
| `endIndex` | query | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-acs/v2/recently-played-champions/current-summoner`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `force` | query | boolean | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-acs/v2/recently-played-champions/{accountId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-acs/v2/request-recently-played-champions/current-summoner`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `force` | query | boolean | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /lol-acs/v2/request-recently-played-champions/{accountId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | path | integer (int64) | yes |  |
| `force` | query | boolean | yes |  |

**Responses**

- **204 No Content** — No content

---
