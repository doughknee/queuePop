# (root)

*2 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/{plugin}/assets/{path}` | Download a backend asset |
| HEAD | `/{plugin}/assets/{path}` | Download the header for a backend asset |

---

### `GET /{plugin}/assets/{path}`

Download a backend asset

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `plugin` | path | string | yes | Plugin name to serve from |
| `path` | path | string | yes | Path to the asset to serve |
| `if-none-match` | header | string |  | optional ETag of the asset that the caller has cached |

**Responses**

- **200 OK** — Successful response

---

### `HEAD /{plugin}/assets/{path}`

Download the header for a backend asset

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `plugin` | path | string | yes | Plugin name to serve from |
| `path` | path | string | yes | Path to the asset to serve |
| `if-none-match` | header | string |  | optional ETag of the asset that the caller has cached |

**Responses**

- **200 OK** — Successful response

---
