# lol-settings

*14 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-settings/v1/account/didreset` |  |
| POST | `/lol-settings/v1/account/save` |  |
| GET | `/lol-settings/v1/account/{category}` |  |
| PATCH | `/lol-settings/v1/account/{category}` |  |
| PUT | `/lol-settings/v1/account/{category}` |  |
| GET | `/lol-settings/v1/local/{category}` |  |
| PATCH | `/lol-settings/v1/local/{category}` |  |
| GET | `/lol-settings/v2/account/{ppType}/{category}` |  |
| PATCH | `/lol-settings/v2/account/{ppType}/{category}` |  |
| PUT | `/lol-settings/v2/account/{ppType}/{category}` |  |
| GET | `/lol-settings/v2/didreset/{ppType}` |  |
| GET | `/lol-settings/v2/local/{category}` |  |
| PATCH | `/lol-settings/v2/local/{category}` |  |
| GET | `/lol-settings/v2/ready` |  |

---

### `GET /lol-settings/v1/account/didreset`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-settings/v1/account/save`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-settings/v1/account/{category}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `category` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PATCH /lol-settings/v1/account/{category}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `category` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-settings/v1/account/{category}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `category` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-settings/v1/local/{category}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `category` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PATCH /lol-settings/v1/local/{category}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `category` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-settings/v2/account/{ppType}/{category}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `ppType` | path | string | yes |  |
| `category` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PATCH /lol-settings/v2/account/{ppType}/{category}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `ppType` | path | string | yes |  |
| `category` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-settings/v2/account/{ppType}/{category}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `ppType` | path | string | yes |  |
| `category` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-settings/v2/didreset/{ppType}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `ppType` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-settings/v2/local/{category}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `category` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PATCH /lol-settings/v2/local/{category}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `category` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-settings/v2/ready`

**Responses**

- **200 OK** — Successful response

---
