# recofriender

*20 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/recofriender/v1/config` |  |
| GET | `/recofriender/v1/config/{network}` |  |
| GET | `/recofriender/v1/contacts` |  |
| POST | `/recofriender/v1/contacts/{accountId}/available` |  |
| POST | `/recofriender/v1/contacts/{accountId}/dismissed` |  |
| POST | `/recofriender/v1/contacts/{accountId}/invited` |  |
| GET | `/recofriender/v1/debug` |  |
| PUT | `/recofriender/v1/debug` |  |
| GET | `/recofriender/v1/faq-url` |  |
| GET | `/recofriender/v1/registrations` |  |
| DELETE | `/recofriender/v1/registrations/{network}` |  |
| GET | `/recofriender/v1/registrations/{network}` |  |
| POST | `/recofriender/v1/registrations/{network}` |  |
| DELETE | `/recofriender/v2/contacts` |  |
| GET | `/recofriender/v2/contacts` |  |
| GET | `/recofriender/v2/contacts/page` |  |
| GET | `/recofriender/v2/contacts/{accountId}` |  |
| DELETE | `/recofriender/v2/dismissed` |  |
| GET | `/recofriender/v2/dismissed` |  |
| GET | `/recofriender/v2/dismissed/page` |  |

---

### `GET /recofriender/v1/config`

**Responses**

- **200 OK** — Successful response

---

### `GET /recofriender/v1/config/{network}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `network` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /recofriender/v1/contacts`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | query | integer (int64) |  |  |
| `source` | query | string |  |  |
| `friendState` | query | string |  |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /recofriender/v1/contacts/{accountId}/available`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | path | integer (int64) | yes |  |
| `retainInCache` | query | boolean |  |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /recofriender/v1/contacts/{accountId}/dismissed`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | path | integer (int64) | yes |  |
| `retainInCache` | query | boolean |  |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /recofriender/v1/contacts/{accountId}/invited`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | path | integer (int64) | yes |  |
| `retainInCache` | query | boolean |  |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /recofriender/v1/debug`

**Responses**

- **200 OK** — Successful response

---

### `PUT /recofriender/v1/debug`

**Responses**

- **200 OK** — Successful response

---

### `GET /recofriender/v1/faq-url`

**Responses**

- **200 OK** — Successful response

---

### `GET /recofriender/v1/registrations`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `cb` | query | string |  |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /recofriender/v1/registrations/{network}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `network` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /recofriender/v1/registrations/{network}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `network` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /recofriender/v1/registrations/{network}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `network` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /recofriender/v2/contacts`

**Responses**

- **204 No Content** — No content

---

### `GET /recofriender/v2/contacts`

**Responses**

- **200 OK** — Successful response

---

### `GET /recofriender/v2/contacts/page`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `start` | query | integer (int64) | yes |  |
| `limit` | query | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /recofriender/v2/contacts/{accountId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `accountId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /recofriender/v2/dismissed`

**Responses**

- **204 No Content** — No content

---

### `GET /recofriender/v2/dismissed`

**Responses**

- **200 OK** — Successful response

---

### `GET /recofriender/v2/dismissed/page`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `start` | query | integer (int64) | yes |  |
| `limit` | query | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---
