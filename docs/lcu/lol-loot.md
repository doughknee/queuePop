# lol-loot

*24 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-loot/v1/currency-configuration` |  |
| GET | `/lol-loot/v1/enabled` |  |
| GET | `/lol-loot/v1/loot-grants` |  |
| DELETE | `/lol-loot/v1/loot-grants/{id}` |  |
| GET | `/lol-loot/v1/loot-items` |  |
| GET | `/lol-loot/v1/new-player-check-done` |  |
| POST | `/lol-loot/v1/new-player-check-done/{newValue}` |  |
| GET | `/lol-loot/v1/player-display-categories` |  |
| GET | `/lol-loot/v1/player-loot` |  |
| GET | `/lol-loot/v1/player-loot-map` |  |
| GET | `/lol-loot/v1/player-loot-notifications` |  |
| POST | `/lol-loot/v1/player-loot-notifications/{id}/acknowledge` |  |
| GET | `/lol-loot/v1/player-loot/{lootId}` |  |
| GET | `/lol-loot/v1/player-loot/{lootId}/context-menu` |  |
| POST | `/lol-loot/v1/player-loot/{lootId}/context-menu` |  |
| DELETE | `/lol-loot/v1/player-loot/{lootId}/new-notification` |  |
| POST | `/lol-loot/v1/player-loot/{lootName}/redeem` |  |
| GET | `/lol-loot/v1/ready` |  |
| GET | `/lol-loot/v1/recipes/configuration` |  |
| GET | `/lol-loot/v1/recipes/initial-item/{lootId}` |  |
| POST | `/lol-loot/v1/recipes/initial-item/{lootId}` |  |
| POST | `/lol-loot/v1/recipes/{recipeName}/craft` |  |
| POST | `/lol-loot/v1/refresh` |  |
| GET | `/lol-loot/v2/player-loot-map` |  |

---

### `GET /lol-loot/v1/currency-configuration`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-loot/v1/enabled`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/loot-grants`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-loot/v1/loot-grants/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/loot-items`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/new-player-check-done`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-loot/v1/new-player-check-done/{newValue}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `newValue` | path | boolean | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/player-display-categories`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/player-loot`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/player-loot-map`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/player-loot-notifications`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-loot/v1/player-loot-notifications/{id}/acknowledge`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/player-loot/{lootId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `lootId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/player-loot/{lootId}/context-menu`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `lootId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-loot/v1/player-loot/{lootId}/context-menu`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `lootId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-loot/v1/player-loot/{lootId}/new-notification`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `lootId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-loot/v1/player-loot/{lootName}/redeem`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `lootName` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/ready`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v1/recipes/configuration`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-loot/v1/recipes/initial-item/{lootId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `lootId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-loot/v1/recipes/initial-item/{lootId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `lootId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-loot/v1/recipes/{recipeName}/craft`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `recipeName` | path | string | yes |  |
| `repeat` | query | integer (int32) |  |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-loot/v1/refresh`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `force` | query | boolean | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loot/v2/player-loot-map`

**Responses**

- **200 OK** — Successful response

---
