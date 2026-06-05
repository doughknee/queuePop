# swagger

*4 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/swagger/v1/api-docs` | Retrieves the API documentation resource listing |
| GET | `/swagger/v1/api-docs/{api}` | Retrieves the API declaration for a supported API |
| GET | `/swagger/v2/swagger.json` | Retrieves the API documentation |
| GET | `/swagger/v3/openapi.json` | Retrieves the API documentation |

---

### `GET /swagger/v1/api-docs`

Retrieves the API documentation resource listing

**Responses**

- **200 OK** — Successful response

---

### `GET /swagger/v1/api-docs/{api}`

Retrieves the API declaration for a supported API

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `api` | path | string | yes | API to get a declaration for |

**Responses**

- **200 OK** — Successful response

---

### `GET /swagger/v2/swagger.json`

Retrieves the API documentation

**Responses**

- **200 OK** — Successful response

---

### `GET /swagger/v3/openapi.json`

Retrieves the API documentation

**Responses**

- **200 OK** — Successful response

---
