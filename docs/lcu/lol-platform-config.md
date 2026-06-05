# lol-platform-config

*4 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-platform-config/v1/initial-configuration-complete` |  |
| GET | `/lol-platform-config/v1/namespaces` |  |
| GET | `/lol-platform-config/v1/namespaces/{ns}` |  |
| GET | `/lol-platform-config/v1/namespaces/{ns}/{key}` |  |

---

### `GET /lol-platform-config/v1/initial-configuration-complete`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-platform-config/v1/namespaces`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-platform-config/v1/namespaces/{ns}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `ns` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-platform-config/v1/namespaces/{ns}/{key}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `ns` | path | string | yes |  |
| `key` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---
