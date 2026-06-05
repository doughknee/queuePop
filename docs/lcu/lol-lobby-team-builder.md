# lol-lobby-team-builder

*41 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-lobby-team-builder/champ-select/v1/bannable-champions` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/current-champion` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/disabled-champions` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/has-auto-assigned-smite` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/implementation-active` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/pickable-champions` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/pickable-skins` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/preferences` |  |
| POST | `/lol-lobby-team-builder/champ-select/v1/retrieve-latest-game-dto` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/sending-loadouts-gcos-enabled` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/session` |  |
| PATCH | `/lol-lobby-team-builder/champ-select/v1/session/actions/{id}` |  |
| POST | `/lol-lobby-team-builder/champ-select/v1/session/actions/{id}/complete` |  |
| POST | `/lol-lobby-team-builder/champ-select/v1/session/bench/swap/{championId}` |  |
| PATCH | `/lol-lobby-team-builder/champ-select/v1/session/my-selection` |  |
| POST | `/lol-lobby-team-builder/champ-select/v1/session/my-selection/reroll` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/session/timer` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/session/trades` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/session/trades/{id}` |  |
| POST | `/lol-lobby-team-builder/champ-select/v1/session/trades/{id}/accept` |  |
| POST | `/lol-lobby-team-builder/champ-select/v1/session/trades/{id}/cancel` |  |
| POST | `/lol-lobby-team-builder/champ-select/v1/session/trades/{id}/decline` |  |
| POST | `/lol-lobby-team-builder/champ-select/v1/session/trades/{id}/request` |  |
| POST | `/lol-lobby-team-builder/champ-select/v1/simple-inventory` |  |
| GET | `/lol-lobby-team-builder/champ-select/v1/team-boost` |  |
| POST | `/lol-lobby-team-builder/champ-select/v1/team-boost/purchase` |  |
| POST | `/lol-lobby-team-builder/v1/invitations/accept` |  |
| DELETE | `/lol-lobby-team-builder/v1/lobby` |  |
| GET | `/lol-lobby-team-builder/v1/lobby` |  |
| POST | `/lol-lobby-team-builder/v1/lobby` |  |
| GET | `/lol-lobby-team-builder/v1/lobby/countdown` |  |
| POST | `/lol-lobby-team-builder/v1/lobby/members/{id}/kick` |  |
| POST | `/lol-lobby-team-builder/v1/lobby/members/{id}/promote` |  |
| GET | `/lol-lobby-team-builder/v1/matchmaking` |  |
| POST | `/lol-lobby-team-builder/v1/matchmaking/low-priority-queue/abandon` |  |
| POST | `/lol-lobby-team-builder/v1/matchmaking/search` |  |
| POST | `/lol-lobby-team-builder/v1/position-preferences` |  |
| POST | `/lol-lobby-team-builder/v1/ready-check/accept` |  |
| POST | `/lol-lobby-team-builder/v1/ready-check/decline` |  |
| GET | `/lol-lobby-team-builder/v1/tb-enabled-features` |  |
| POST | `/lol-lobby-team-builder/v2/position-preferences` |  |

---

### `GET /lol-lobby-team-builder/champ-select/v1/bannable-champions`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/current-champion`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/disabled-champions`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/has-auto-assigned-smite`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/implementation-active`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/pickable-champions`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/pickable-skins`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/preferences`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/champ-select/v1/retrieve-latest-game-dto`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/sending-loadouts-gcos-enabled`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/session`

**Responses**

- **200 OK** — Successful response

---

### `PATCH /lol-lobby-team-builder/champ-select/v1/session/actions/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/champ-select/v1/session/actions/{id}/complete`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/champ-select/v1/session/bench/swap/{championId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `championId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PATCH /lol-lobby-team-builder/champ-select/v1/session/my-selection`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/champ-select/v1/session/my-selection/reroll`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/session/timer`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/session/trades`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/champ-select/v1/session/trades/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/champ-select/v1/session/trades/{id}/accept`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/champ-select/v1/session/trades/{id}/cancel`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/champ-select/v1/session/trades/{id}/decline`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/champ-select/v1/session/trades/{id}/request`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/champ-select/v1/simple-inventory`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-lobby-team-builder/champ-select/v1/team-boost`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/champ-select/v1/team-boost/purchase`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/v1/invitations/accept`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-lobby-team-builder/v1/lobby`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-lobby-team-builder/v1/lobby`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/v1/lobby`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/v1/lobby/countdown`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/v1/lobby/members/{id}/kick`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/v1/lobby/members/{id}/promote`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/v1/matchmaking`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/v1/matchmaking/low-priority-queue/abandon`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/v1/matchmaking/search`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/v1/position-preferences`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/v1/ready-check/accept`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/v1/ready-check/decline`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby-team-builder/v1/tb-enabled-features`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby-team-builder/v2/position-preferences`

**Responses**

- **200 OK** — Successful response

---
