# lol-player-messaging

*4 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-player-messaging/v1/celebration/notification` |  |
| DELETE | `/lol-player-messaging/v1/celebration/notification/{id}/acknowledge` |  |
| GET | `/lol-player-messaging/v1/notification` |  |
| DELETE | `/lol-player-messaging/v1/notification/{id}/acknowledge` |  |

---

### `GET /lol-player-messaging/v1/celebration/notification`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-player-messaging/v1/celebration/notification/{id}/acknowledge`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-player-messaging/v1/notification`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-player-messaging/v1/notification/{id}/acknowledge`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---
