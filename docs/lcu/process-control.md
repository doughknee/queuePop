# process-control

*5 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/process-control/v1/process` | Returns information about the process-control. |
| POST | `/process-control/v1/process/quit` | Quits the application. |
| POST | `/process-control/v1/process/restart` | Restarts the application. Does nothing if there is already a waiting delayed restart. Optionally accepts specific version to restart. |
| POST | `/process-control/v1/process/restart-to-repair` | Restarts the application in order to perform a full repair (including self repair). |
| POST | `/process-control/v1/process/restart-to-update` | Restarts the application in order to perform a self-update. |

---

### `GET /process-control/v1/process`

Returns information about the process-control.

**Responses**

- **200 OK** — Successful response

---

### `POST /process-control/v1/process/quit`

Quits the application.

**Responses**

- **204 No Content** — No content

---

### `POST /process-control/v1/process/restart`

Restarts the application. Does nothing if there is already a waiting delayed restart. Optionally accepts specific version to restart.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `delaySeconds` | query | integer (int32) | yes |  |
| `restartVersion` | query | integer (int32) |  |  |

**Responses**

- **204 No Content** — No content

---

### `POST /process-control/v1/process/restart-to-repair`

Restarts the application in order to perform a full repair (including self repair).

**Responses**

- **204 No Content** — No content

---

### `POST /process-control/v1/process/restart-to-update`

Restarts the application in order to perform a self-update.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `delaySeconds` | query | integer (int32) | yes |  |
| `selfUpdateUrl` | query | string | yes |  |

**Responses**

- **204 No Content** — No content

---
