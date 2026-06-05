# voice-chat

*26 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/voice-chat/v1/audio-properties` |  |
| GET | `/voice-chat/v1/call-stats/aggregate` |  |
| GET | `/voice-chat/v1/call-stats/{id}` |  |
| GET | `/voice-chat/v1/codec-settings` |  |
| PUT | `/voice-chat/v1/codec-settings` |  |
| GET | `/voice-chat/v1/config` |  |
| GET | `/voice-chat/v1/errors` |  |
| GET | `/voice-chat/v1/push-to-talk` |  |
| PUT | `/voice-chat/v1/push-to-talk` |  |
| POST | `/voice-chat/v1/push-to-talk/check-available` |  |
| POST | `/voice-chat/v1/sessions/{id}` |  |
| GET | `/voice-chat/v2/devices/capture` |  |
| GET | `/voice-chat/v2/devices/capture/permission` |  |
| PUT | `/voice-chat/v2/devices/capture/prompt-for-permission` |  |
| GET | `/voice-chat/v2/devices/render` |  |
| DELETE | `/voice-chat/v2/sessions` |  |
| GET | `/voice-chat/v2/sessions` |  |
| POST | `/voice-chat/v2/sessions` |  |
| DELETE | `/voice-chat/v2/sessions/{id}` |  |
| GET | `/voice-chat/v2/sessions/{id}` |  |
| POST | `/voice-chat/v2/sessions/{id}` |  |
| GET | `/voice-chat/v2/sessions/{sessionId}/participants/{participantId}` |  |
| PUT | `/voice-chat/v2/sessions/{sessionId}/participants/{participantId}` |  |
| GET | `/voice-chat/v2/settings` |  |
| PUT | `/voice-chat/v2/settings` |  |
| GET | `/voice-chat/v2/state` |  |

---

### `GET /voice-chat/v1/audio-properties`

**Responses**

- **200 OK** — Successful response

---

### `GET /voice-chat/v1/call-stats/aggregate`

**Responses**

- **200 OK** — Successful response

---

### `GET /voice-chat/v1/call-stats/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /voice-chat/v1/codec-settings`

**Responses**

- **200 OK** — Successful response

---

### `PUT /voice-chat/v1/codec-settings`

**Responses**

- **204 No Content** — No content

---

### `GET /voice-chat/v1/config`

**Responses**

- **200 OK** — Successful response

---

### `GET /voice-chat/v1/errors`

**Responses**

- **200 OK** — Successful response

---

### `GET /voice-chat/v1/push-to-talk`

**Responses**

- **200 OK** — Successful response

---

### `PUT /voice-chat/v1/push-to-talk`

**Responses**

- **200 OK** — Successful response

---

### `POST /voice-chat/v1/push-to-talk/check-available`

**Responses**

- **200 OK** — Successful response

---

### `POST /voice-chat/v1/sessions/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /voice-chat/v2/devices/capture`

**Responses**

- **200 OK** — Successful response

---

### `GET /voice-chat/v2/devices/capture/permission`

**Responses**

- **200 OK** — Successful response

---

### `PUT /voice-chat/v2/devices/capture/prompt-for-permission`

**Responses**

- **204 No Content** — No content

---

### `GET /voice-chat/v2/devices/render`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /voice-chat/v2/sessions`

**Responses**

- **204 No Content** — No content

---

### `GET /voice-chat/v2/sessions`

**Responses**

- **200 OK** — Successful response

---

### `POST /voice-chat/v2/sessions`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `JWT` | header | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /voice-chat/v2/sessions/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /voice-chat/v2/sessions/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /voice-chat/v2/sessions/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |
| `JWT` | header | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /voice-chat/v2/sessions/{sessionId}/participants/{participantId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `sessionId` | path | string | yes |  |
| `participantId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /voice-chat/v2/sessions/{sessionId}/participants/{participantId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `sessionId` | path | string | yes |  |
| `participantId` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /voice-chat/v2/settings`

**Responses**

- **200 OK** — Successful response

---

### `PUT /voice-chat/v2/settings`

**Responses**

- **204 No Content** — No content

---

### `GET /voice-chat/v2/state`

**Responses**

- **200 OK** — Successful response

---
