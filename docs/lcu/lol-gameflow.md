# lol-gameflow

*33 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/lol-gameflow/v1/ack-failed-to-launch` |  |
| GET | `/lol-gameflow/v1/active-patcher-lock` |  |
| GET | `/lol-gameflow/v1/availability` |  |
| GET | `/lol-gameflow/v1/basic-tutorial` |  |
| POST | `/lol-gameflow/v1/basic-tutorial/start` |  |
| GET | `/lol-gameflow/v1/battle-training` |  |
| POST | `/lol-gameflow/v1/battle-training/start` |  |
| POST | `/lol-gameflow/v1/battle-training/stop` |  |
| POST | `/lol-gameflow/v1/client-received-message` |  |
| GET | `/lol-gameflow/v1/extra-game-client-args` |  |
| POST | `/lol-gameflow/v1/extra-game-client-args` |  |
| GET | `/lol-gameflow/v1/gameflow-metadata/player-status` |  |
| POST | `/lol-gameflow/v1/gameflow-metadata/player-status` |  |
| GET | `/lol-gameflow/v1/gameflow-metadata/registration-status` |  |
| POST | `/lol-gameflow/v1/gameflow-metadata/registration-status` |  |
| GET | `/lol-gameflow/v1/gameflow-phase` |  |
| POST | `/lol-gameflow/v1/pre-end-game-transition` |  |
| POST | `/lol-gameflow/v1/reconnect` |  |
| GET | `/lol-gameflow/v1/session` |  |
| POST | `/lol-gameflow/v1/session/dodge` |  |
| POST | `/lol-gameflow/v1/session/event` |  |
| POST | `/lol-gameflow/v1/session/game-configuration` |  |
| POST | `/lol-gameflow/v1/session/request-enter-gameflow` |  |
| POST | `/lol-gameflow/v1/session/request-lobby` |  |
| POST | `/lol-gameflow/v1/session/request-tournament-checkin` |  |
| POST | `/lol-gameflow/v1/session/tournament-ended` |  |
| GET | `/lol-gameflow/v1/spectate` |  |
| GET | `/lol-gameflow/v1/spectate/delayed-launch` |  |
| POST | `/lol-gameflow/v1/spectate/launch` |  |
| POST | `/lol-gameflow/v1/spectate/quit` |  |
| POST | `/lol-gameflow/v1/tick` |  |
| GET | `/lol-gameflow/v1/watch` |  |
| POST | `/lol-gameflow/v1/watch/launch` |  |

---

### `POST /lol-gameflow/v1/ack-failed-to-launch`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-gameflow/v1/active-patcher-lock`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-gameflow/v1/availability`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-gameflow/v1/basic-tutorial`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/basic-tutorial/start`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-gameflow/v1/battle-training`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/battle-training/start`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/battle-training/stop`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/client-received-message`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-gameflow/v1/extra-game-client-args`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/extra-game-client-args`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-gameflow/v1/gameflow-metadata/player-status`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/gameflow-metadata/player-status`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-gameflow/v1/gameflow-metadata/registration-status`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/gameflow-metadata/registration-status`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-gameflow/v1/gameflow-phase`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/pre-end-game-transition`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `enabled` | query | boolean | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-gameflow/v1/reconnect`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-gameflow/v1/session`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/session/dodge`

**Responses**

- **204 No Content** — No content

---

### `POST /lol-gameflow/v1/session/event`

**Responses**

- **204 No Content** — No content

---

### `POST /lol-gameflow/v1/session/game-configuration`

**Responses**

- **204 No Content** — No content

---

### `POST /lol-gameflow/v1/session/request-enter-gameflow`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/session/request-lobby`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/session/request-tournament-checkin`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/session/tournament-ended`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-gameflow/v1/spectate`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-gameflow/v1/spectate/delayed-launch`

**Responses**

- **204 No Content** — No content

---

### `POST /lol-gameflow/v1/spectate/launch`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/spectate/quit`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/tick`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-gameflow/v1/watch`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-gameflow/v1/watch/launch`

**Responses**

- **200 OK** — Successful response

---
