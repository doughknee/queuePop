# lol-game-queues

*7 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-game-queues/v1/custom` |  |
| GET | `/lol-game-queues/v1/custom-non-default` |  |
| GET | `/lol-game-queues/v1/game-type-config/{gameTypeConfigId}` |  |
| GET | `/lol-game-queues/v1/game-type-config/{gameTypeConfigId}/map/{mapId}` |  |
| GET | `/lol-game-queues/v1/queues` |  |
| GET | `/lol-game-queues/v1/queues/type/{queueType}` |  |
| GET | `/lol-game-queues/v1/queues/{id}` |  |

---

### `GET /lol-game-queues/v1/custom`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-game-queues/v1/custom-non-default`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-game-queues/v1/game-type-config/{gameTypeConfigId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameTypeConfigId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-game-queues/v1/game-type-config/{gameTypeConfigId}/map/{mapId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `gameTypeConfigId` | path | integer (int32) | yes |  |
| `mapId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-game-queues/v1/queues`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-game-queues/v1/queues/type/{queueType}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `queueType` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-game-queues/v1/queues/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---
