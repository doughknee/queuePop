# lol-login

*20 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/lol-login/v1/access-token` |  |
| GET | `/lol-login/v1/account-state` |  |
| POST | `/lol-login/v1/account-state` |  |
| POST | `/lol-login/v1/change-summoner-name` |  |
| GET | `/lol-login/v1/login-data-packet` |  |
| GET | `/lol-login/v1/login-in-game-creds` |  |
| GET | `/lol-login/v1/login-platform-credentials` |  |
| POST | `/lol-login/v1/new-player-flow-completed` |  |
| DELETE | `/lol-login/v1/service-proxy-async-requests/{serviceName}/{methodName}` |  |
| POST | `/lol-login/v1/service-proxy-async-requests/{serviceName}/{methodName}` |  |
| POST | `/lol-login/v1/service-proxy-method-requests` |  |
| POST | `/lol-login/v1/service-proxy-uuid-requests` |  |
| DELETE | `/lol-login/v1/session` |  |
| GET | `/lol-login/v1/session` |  |
| POST | `/lol-login/v1/session` |  |
| POST | `/lol-login/v1/session/invoke` |  |
| DELETE | `/lol-login/v1/shutdown-locks/{lockName}` |  |
| PUT | `/lol-login/v1/shutdown-locks/{lockName}` |  |
| POST | `/lol-login/v1/summoner-created` |  |
| GET | `/lol-login/v1/wallet` |  |

---

### `POST /lol-login/v1/access-token`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-login/v1/account-state`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-login/v1/account-state`

**Responses**

- **204 No Content** — No content

---

### `POST /lol-login/v1/change-summoner-name`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-login/v1/login-data-packet`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-login/v1/login-in-game-creds`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-login/v1/login-platform-credentials`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-login/v1/new-player-flow-completed`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-login/v1/service-proxy-async-requests/{serviceName}/{methodName}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `serviceName` | path | string | yes |  |
| `methodName` | path | string | yes |  |
| `pluginId` | query | integer (int32) | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-login/v1/service-proxy-async-requests/{serviceName}/{methodName}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `serviceName` | path | string | yes |  |
| `methodName` | path | string | yes |  |
| `pluginId` | query | integer (int32) | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-login/v1/service-proxy-method-requests`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `serviceName` | query | string | yes |  |
| `methodName` | query | string | yes |  |
| `responseMethodName` | query | string | yes |  |
| `responseErrorName` | query | string | yes |  |
| `pluginId` | query | integer (int32) | yes |  |
| `payload` | query | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-login/v1/service-proxy-uuid-requests`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `serviceName` | query | string | yes |  |
| `methodName` | query | string | yes |  |
| `pluginId` | query | integer (int32) | yes |  |
| `payload` | query | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-login/v1/session`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-login/v1/session`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-login/v1/session`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-login/v1/session/invoke`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `destination` | query | string | yes |  |
| `method` | query | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-login/v1/shutdown-locks/{lockName}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `lockName` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `PUT /lol-login/v1/shutdown-locks/{lockName}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `lockName` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-login/v1/summoner-created`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-login/v1/wallet`

**Responses**

- **200 OK** — Successful response

---
