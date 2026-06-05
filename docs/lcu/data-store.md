# data-store

*4 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/data-store/v1/install-dir` | Gets the current install directory (used internally.) |
| GET | `/data-store/v1/install-settings/{path}` | Get the data for the specified key from the install settings. |
| POST | `/data-store/v1/install-settings/{path}` | Set the data for the specified key from the install settings. |
| GET | `/data-store/v1/system-settings/{path}` | Get the setting for the specified key. |

---

### `GET /data-store/v1/install-dir`

Gets the current install directory (used internally.)

**Responses**

- **200 OK** — Successful response

---

### `GET /data-store/v1/install-settings/{path}`

Get the data for the specified key from the install settings.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `path` | path | string | yes | The path to the settings key |

**Responses**

- **200 OK** — Successful response

---

### `POST /data-store/v1/install-settings/{path}`

Set the data for the specified key from the install settings.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `path` | path | string | yes | The path to the settings key |

**Responses**

- **204 No Content** — No content

---

### `GET /data-store/v1/system-settings/{path}`

Get the setting for the specified key.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `path` | path | string | yes | The path to the settings key |

**Responses**

- **200 OK** — Successful response

---
