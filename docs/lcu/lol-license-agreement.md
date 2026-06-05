# lol-license-agreement

*4 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-license-agreement/v1/agreements` |  |
| POST | `/lol-license-agreement/v1/agreements/{id}/accept` |  |
| POST | `/lol-license-agreement/v1/agreements/{id}/decline` |  |
| GET | `/lol-license-agreement/v1/all-agreements` |  |

---

### `GET /lol-license-agreement/v1/agreements`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-license-agreement/v1/agreements/{id}/accept`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-license-agreement/v1/agreements/{id}/decline`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-license-agreement/v1/all-agreements`

**Responses**

- **200 OK** — Successful response

---
