# plugin-manager

*7 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/plugin-manager/v1/plugin-stats/log` | Write the current plugin stats for the log file. |
| GET | `/plugin-manager/v1/status` | Get the status of the plugin manager. |
| GET | `/plugin-manager/v2/descriptions` | Get all plugin descriptions. |
| GET | `/plugin-manager/v2/descriptions/{plugin}` | Get a plugin description. |
| GET | `/plugin-manager/v2/plugins` | Get diagnostic information for all plugins. |
| GET | `/plugin-manager/v2/plugins/{plugin}` | Get diagnostic information for a single plugin. |
| GET | `/plugin-manager/v3/plugins-manifest` | Get the plugin manifest. |

---

### `GET /plugin-manager/v1/plugin-stats/log`

Write the current plugin stats for the log file.

**Responses**

- **204 No Content** — No content

---

### `GET /plugin-manager/v1/status`

Get the status of the plugin manager.

**Responses**

- **200 OK** — Successful response

---

### `GET /plugin-manager/v2/descriptions`

Get all plugin descriptions.

**Responses**

- **200 OK** — Successful response

---

### `GET /plugin-manager/v2/descriptions/{plugin}`

Get a plugin description.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `plugin` | path | string | yes | Plugin name |

**Responses**

- **200 OK** — Successful response

---

### `GET /plugin-manager/v2/plugins`

Get diagnostic information for all plugins.

**Responses**

- **200 OK** — Successful response

---

### `GET /plugin-manager/v2/plugins/{plugin}`

Get diagnostic information for a single plugin.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `plugin` | path | string | yes | Plugin name |

**Responses**

- **200 OK** — Successful response

---

### `GET /plugin-manager/v3/plugins-manifest`

Get the plugin manifest.

**Responses**

- **200 OK** — Successful response

---
