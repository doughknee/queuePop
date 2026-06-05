# lol-chat

*49 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-chat/v1/blocked-players` |  |
| POST | `/lol-chat/v1/blocked-players` |  |
| DELETE | `/lol-chat/v1/blocked-players/{id}` |  |
| GET | `/lol-chat/v1/blocked-players/{id}` |  |
| GET | `/lol-chat/v1/config` |  |
| GET | `/lol-chat/v1/conversations` |  |
| POST | `/lol-chat/v1/conversations` |  |
| DELETE | `/lol-chat/v1/conversations/active` |  |
| GET | `/lol-chat/v1/conversations/active` |  |
| PUT | `/lol-chat/v1/conversations/active` |  |
| GET | `/lol-chat/v1/conversations/notify` |  |
| DELETE | `/lol-chat/v1/conversations/{id}` |  |
| GET | `/lol-chat/v1/conversations/{id}` |  |
| PUT | `/lol-chat/v1/conversations/{id}` |  |
| POST | `/lol-chat/v1/conversations/{id}/closed` |  |
| PUT | `/lol-chat/v1/conversations/{id}/closed` |  |
| DELETE | `/lol-chat/v1/conversations/{id}/messages` |  |
| GET | `/lol-chat/v1/conversations/{id}/messages` |  |
| POST | `/lol-chat/v1/conversations/{id}/messages` |  |
| GET | `/lol-chat/v1/conversations/{id}/participants` |  |
| POST | `/lol-chat/v1/conversations/{id}/participants` |  |
| GET | `/lol-chat/v1/errors` |  |
| DELETE | `/lol-chat/v1/errors/{id}` |  |
| GET | `/lol-chat/v1/friend-counts` |  |
| GET | `/lol-chat/v1/friend-groups` |  |
| POST | `/lol-chat/v1/friend-groups` |  |
| DELETE | `/lol-chat/v1/friend-groups/{id}` |  |
| GET | `/lol-chat/v1/friend-groups/{id}` |  |
| PUT | `/lol-chat/v1/friend-groups/{id}` |  |
| GET | `/lol-chat/v1/friend-groups/{id}/friends` |  |
| GET | `/lol-chat/v1/friend-requests` |  |
| POST | `/lol-chat/v1/friend-requests` |  |
| DELETE | `/lol-chat/v1/friend-requests/{id}` |  |
| PUT | `/lol-chat/v1/friend-requests/{id}` |  |
| GET | `/lol-chat/v1/friends` |  |
| DELETE | `/lol-chat/v1/friends/{id}` |  |
| GET | `/lol-chat/v1/friends/{id}` |  |
| PUT | `/lol-chat/v1/friends/{id}` |  |
| GET | `/lol-chat/v1/me` |  |
| PUT | `/lol-chat/v1/me` |  |
| DELETE | `/lol-chat/v1/session` |  |
| GET | `/lol-chat/v1/session` |  |
| POST | `/lol-chat/v1/session/plain` |  |
| POST | `/lol-chat/v1/session/rso` |  |
| GET | `/lol-chat/v1/settings` |  |
| PUT | `/lol-chat/v1/settings` |  |
| DELETE | `/lol-chat/v1/settings/{key}` |  |
| GET | `/lol-chat/v1/settings/{key}` |  |
| PUT | `/lol-chat/v1/settings/{key}` |  |

---

### `GET /lol-chat/v1/blocked-players`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-chat/v1/blocked-players`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-chat/v1/blocked-players/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/blocked-players/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/config`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/conversations`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-chat/v1/conversations`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-chat/v1/conversations/active`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/conversations/active`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-chat/v1/conversations/active`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/conversations/notify`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-chat/v1/conversations/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/conversations/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-chat/v1/conversations/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-chat/v1/conversations/{id}/closed`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-chat/v1/conversations/{id}/closed`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-chat/v1/conversations/{id}/messages`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/conversations/{id}/messages`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-chat/v1/conversations/{id}/messages`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/conversations/{id}/participants`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-chat/v1/conversations/{id}/participants`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/errors`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-chat/v1/errors/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/friend-counts`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/friend-groups`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-chat/v1/friend-groups`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-chat/v1/friend-groups/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/friend-groups/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-chat/v1/friend-groups/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/friend-groups/{id}/friends`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/friend-requests`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-chat/v1/friend-requests`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-chat/v1/friend-requests/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-chat/v1/friend-requests/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/friends`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-chat/v1/friends/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/friends/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-chat/v1/friends/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/me`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-chat/v1/me`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-chat/v1/session`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/session`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-chat/v1/session/plain`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-chat/v1/session/rso`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/settings`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-chat/v1/settings`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `doAsync` | query | boolean |  |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-chat/v1/settings/{key}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `key` | path | string | yes |  |
| `doAsync` | query | boolean |  |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-chat/v1/settings/{key}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `key` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-chat/v1/settings/{key}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `key` | path | string | yes |  |
| `doAsync` | query | boolean |  |  |

**Responses**

- **200 OK** — Successful response

---
