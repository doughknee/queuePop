# patcher

*25 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/patcher/v1/executable-version` |  |
| GET | `/patcher/v1/notifications` |  |
| POST | `/patcher/v1/notifications` |  |
| DELETE | `/patcher/v1/notifications/{id}` |  |
| GET | `/patcher/v1/p2p/status` |  |
| PATCH | `/patcher/v1/p2p/status` |  |
| GET | `/patcher/v1/products` |  |
| POST | `/patcher/v1/products/league_of_legends/full-repair-request` |  |
| DELETE | `/patcher/v1/products/{product-id}` |  |
| PUT | `/patcher/v1/products/{product-id}` |  |
| POST | `/patcher/v1/products/{product-id}/detect-corruption-request` |  |
| POST | `/patcher/v1/products/{product-id}/inject-error` |  |
| POST | `/patcher/v1/products/{product-id}/partial-repair-request` |  |
| GET | `/patcher/v1/products/{product-id}/paths` |  |
| POST | `/patcher/v1/products/{product-id}/signal-start-patching-delayed` |  |
| POST | `/patcher/v1/products/{product-id}/start-checking-request` |  |
| POST | `/patcher/v1/products/{product-id}/start-patching-request` |  |
| GET | `/patcher/v1/products/{product-id}/state` |  |
| POST | `/patcher/v1/products/{product-id}/stop-checking-request` |  |
| POST | `/patcher/v1/products/{product-id}/stop-patching-request` |  |
| GET | `/patcher/v1/products/{product-id}/tags` |  |
| DELETE | `/patcher/v1/products/{product-id}/{component-id}/http-headers` |  |
| PUT | `/patcher/v1/products/{product-id}/{component-id}/http-headers` |  |
| PUT | `/patcher/v1/self-update-restart` |  |
| GET | `/patcher/v1/status` |  |

---

### `GET /patcher/v1/executable-version`

**Responses**

- **200 OK** — Successful response

---

### `GET /patcher/v1/notifications`

**Responses**

- **200 OK** — Successful response

---

### `POST /patcher/v1/notifications`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `notificationId` | query | string , x ∈ { UnspecifiedError , ConnectionError , MissingFilesError , FailedToWriteError , WillRestoreClientBackupOnRestart , DidRestoreClientBackup } | yes |  |

**Responses**

- **204 No Content** — No content

---

### `DELETE /patcher/v1/notifications/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /patcher/v1/p2p/status`

**Responses**

- **200 OK** — Successful response

---

### `PATCH /patcher/v1/p2p/status`

**Responses**

- **200 OK** — Successful response

---

### `GET /patcher/v1/products`

**Responses**

- **200 OK** — Successful response

---

### `POST /patcher/v1/products/league_of_legends/full-repair-request`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /patcher/v1/products/{product-id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /patcher/v1/products/{product-id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /patcher/v1/products/{product-id}/detect-corruption-request`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /patcher/v1/products/{product-id}/inject-error`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |
| `component-id` | query | string | yes |  |
| `error` | query | string , x ∈ { UnspecifiedError , FailedToFindFile , FailedToResolveHostName , FailedFailedToWriteFile } | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /patcher/v1/products/{product-id}/partial-repair-request`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /patcher/v1/products/{product-id}/paths`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /patcher/v1/products/{product-id}/signal-start-patching-delayed`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /patcher/v1/products/{product-id}/start-checking-request`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /patcher/v1/products/{product-id}/start-patching-request`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /patcher/v1/products/{product-id}/state`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /patcher/v1/products/{product-id}/stop-checking-request`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /patcher/v1/products/{product-id}/stop-patching-request`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /patcher/v1/products/{product-id}/tags`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /patcher/v1/products/{product-id}/{component-id}/http-headers`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |
| `component-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /patcher/v1/products/{product-id}/{component-id}/http-headers`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `product-id` | path | string | yes |  |
| `component-id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /patcher/v1/self-update-restart`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `forceRestartOnSelfUpdate` | query | boolean | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /patcher/v1/status`

**Responses**

- **200 OK** — Successful response

---
