# gcloud-voice-chat

*26 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/gcloud-voice-chat/v1/audio-properties` |  |
| GET | `/gcloud-voice-chat/v1/call-stats/aggregate` |  |
| GET | `/gcloud-voice-chat/v1/call-stats/{id}` |  |
| GET | `/gcloud-voice-chat/v1/codec-settings` |  |
| PUT | `/gcloud-voice-chat/v1/codec-settings` |  |
| GET | `/gcloud-voice-chat/v1/config` |  |
| GET | `/gcloud-voice-chat/v1/errors` |  |
| GET | `/gcloud-voice-chat/v1/push-to-talk` |  |
| PUT | `/gcloud-voice-chat/v1/push-to-talk` |  |
| POST | `/gcloud-voice-chat/v1/push-to-talk/check-available` |  |
| POST | `/gcloud-voice-chat/v1/sessions/{id}` |  |
| GET | `/gcloud-voice-chat/v2/devices/capture` |  |
| GET | `/gcloud-voice-chat/v2/devices/capture/permission` |  |
| PUT | `/gcloud-voice-chat/v2/devices/capture/prompt-for-permission` |  |
| GET | `/gcloud-voice-chat/v2/devices/render` |  |
| DELETE | `/gcloud-voice-chat/v2/sessions` |  |
| GET | `/gcloud-voice-chat/v2/sessions` |  |
| POST | `/gcloud-voice-chat/v2/sessions` |  |
| DELETE | `/gcloud-voice-chat/v2/sessions/{id}` |  |
| GET | `/gcloud-voice-chat/v2/sessions/{id}` |  |
| POST | `/gcloud-voice-chat/v2/sessions/{id}` |  |
| GET | `/gcloud-voice-chat/v2/sessions/{sessionId}/participants/{participantId}` |  |
| PUT | `/gcloud-voice-chat/v2/sessions/{sessionId}/participants/{participantId}` |  |
| GET | `/gcloud-voice-chat/v2/settings` |  |
| PUT | `/gcloud-voice-chat/v2/settings` |  |
| GET | `/gcloud-voice-chat/v2/state` |  |

---

### `GET /gcloud-voice-chat/v1/audio-properties`

**Responses**

- **200 OK** — Successful response

---

### `GET /gcloud-voice-chat/v1/call-stats/aggregate`

**Responses**

- **200 OK** — Successful response

---

### `GET /gcloud-voice-chat/v1/call-stats/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /gcloud-voice-chat/v1/codec-settings`

**Responses**

- **200 OK** — Successful response

---

### `PUT /gcloud-voice-chat/v1/codec-settings`

**Responses**

- **204 No Content** — No content

---

### `GET /gcloud-voice-chat/v1/config`

**Responses**

- **200 OK** — Successful response

---

### `GET /gcloud-voice-chat/v1/errors`

**Responses**

- **200 OK** — Successful response

---

### `GET /gcloud-voice-chat/v1/push-to-talk`

**Responses**

- **200 OK** — Successful response

---

### `PUT /gcloud-voice-chat/v1/push-to-talk`

**Responses**

- **200 OK** — Successful response

---

### `POST /gcloud-voice-chat/v1/push-to-talk/check-available`

**Responses**

- **200 OK** — Successful response

---

### `POST /gcloud-voice-chat/v1/sessions/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /gcloud-voice-chat/v2/devices/capture`

**Responses**

- **200 OK** — Successful response

---

### `GET /gcloud-voice-chat/v2/devices/capture/permission`

**Responses**

- **200 OK** — Successful response

---

### `PUT /gcloud-voice-chat/v2/devices/capture/prompt-for-permission`

**Responses**

- **204 No Content** — No content

---

### `GET /gcloud-voice-chat/v2/devices/render`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /gcloud-voice-chat/v2/sessions`

**Responses**

- **204 No Content** — No content

---

### `GET /gcloud-voice-chat/v2/sessions`

**Responses**

- **200 OK** — Successful response

---

### `POST /gcloud-voice-chat/v2/sessions`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `JWT` | header | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /gcloud-voice-chat/v2/sessions/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /gcloud-voice-chat/v2/sessions/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /gcloud-voice-chat/v2/sessions/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |
| `JWT` | header | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /gcloud-voice-chat/v2/sessions/{sessionId}/participants/{participantId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `sessionId` | path | string | yes |  |
| `participantId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /gcloud-voice-chat/v2/sessions/{sessionId}/participants/{participantId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `sessionId` | path | string | yes |  |
| `participantId` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /gcloud-voice-chat/v2/settings`

**Responses**

- **200 OK** — Successful response

---

### `PUT /gcloud-voice-chat/v2/settings`

**Responses**

- **204 No Content** — No content

---

### `GET /gcloud-voice-chat/v2/state`

**Responses**

- **200 OK** — Successful response

---
