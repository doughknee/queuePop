# lol-esport-stream-notifications

*3 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-esport-stream-notifications/v1/live-streams` |  |
| POST | `/lol-esport-stream-notifications/v1/send-stats` |  |
| GET | `/lol-esport-stream-notifications/v1/stream-url` |  |

---

### `GET /lol-esport-stream-notifications/v1/live-streams`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-esport-stream-notifications/v1/send-stats`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `eventType` | path | string | yes |  |
| `matchId` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /lol-esport-stream-notifications/v1/stream-url`

**Responses**

- **200 OK** — Successful response

---
