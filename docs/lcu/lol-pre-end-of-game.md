# lol-pre-end-of-game

*4 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/lol-pre-end-of-game/v1/complete/{sequenceEventName}` |  |
| GET | `/lol-pre-end-of-game/v1/currentSequenceEvent` |  |
| DELETE | `/lol-pre-end-of-game/v1/registration/{sequenceEventName}` |  |
| POST | `/lol-pre-end-of-game/v1/registration/{sequenceEventName}/{priority}` |  |

---

### `POST /lol-pre-end-of-game/v1/complete/{sequenceEventName}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `sequenceEventName` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /lol-pre-end-of-game/v1/currentSequenceEvent`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-pre-end-of-game/v1/registration/{sequenceEventName}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `sequenceEventName` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-pre-end-of-game/v1/registration/{sequenceEventName}/{priority}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `sequenceEventName` | path | string | yes |  |
| `priority` | path | integer (int32) | yes |  |

**Responses**

- **204 No Content** — No content

---
