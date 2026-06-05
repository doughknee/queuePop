# riotclient

*38 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/riotclient/addorupdatemetric` | Adds or Updates a Metric |
| DELETE | `/riotclient/affinity` | Deletes the current runtime affinity of the application. |
| GET | `/riotclient/affinity` | Get the current runtime affinity of the application. |
| POST | `/riotclient/affinity` | Sets the current runtime affinity of the application. |
| GET | `/riotclient/app-name` | Application name without file extension |
| GET | `/riotclient/app-port` | Get the TCP port number that the remoting server is listening on. |
| GET | `/riotclient/auth-token` | Return the auth token used by the remoting server |
| GET | `/riotclient/command-line-args` | Get the command line parameters for the application |
| GET | `/riotclient/get_region_locale` | Get the current region and locale. |
| POST | `/riotclient/kill-and-restart-ux` | Kills the ux process and restarts it. Used only when the ux process crashes. |
| POST | `/riotclient/kill-ux` | Kills the ux process. |
| POST | `/riotclient/launch-ux` | Launches the ux process. |
| GET | `/riotclient/machine-id` | Base64 encoded uuid identifying the user's machine |
| POST | `/riotclient/new-args` | Endpoint for passing in new data. |
| GET | `/riotclient/region-locale` | Get the current region and locale. |
| PUT | `/riotclient/region-locale` | Update the region and locale. |
| PUT | `/riotclient/region-locale/ack` | Ux acknowledges the update to the region and locale. |
| POST | `/riotclient/set_region_locale` | Update the region and locale. |
| POST | `/riotclient/show-swagger` | Open swagger in the default browser. |
| DELETE | `/riotclient/splash` | Hide the splash screen. |
| PUT | `/riotclient/splash` | Show the splash screen. |
| GET | `/riotclient/system-info/v1/basic-info` | Get basic system information: OS, memory, processor speed, and number of physical cores |
| GET | `/riotclient/trace` | Retrieves a completed scheduler trace. |
| POST | `/riotclient/unload` | Unloads the UX process |
| GET | `/riotclient/ux-crash-count` | Returns whether the ux has crashed or not |
| POST | `/riotclient/ux-flash` | Flash the ux process' main window and the taskbar/dock icon, if they exist. |
| PUT | `/riotclient/ux-load-complete` | Ux notification that it has completed loading the main window. |
| POST | `/riotclient/ux-minimize` | Minimize the ux process and all its windows if it exists. This does not kill the ux. |
| POST | `/riotclient/ux-show` | Shows the ux process if it exists; create and show if it does not. |
| GET | `/riotclient/ux-state` | Get the current Ux state. |
| PUT | `/riotclient/ux-state/ack` | Ux acknowledges the update to the Ux state. |
| DELETE | `/riotclient/v1/auth-tokens/{authToken}` | Unregister an existing auth token. |
| PUT | `/riotclient/v1/auth-tokens/{authToken}` | Register an auth token. This is any alpha-numeric string that will be used as a password with the riot user when making requests. |
| POST | `/riotclient/v1/bugsplat/logs` | Adds the enclosed log to the app's bugsplat report. |
| GET | `/riotclient/v1/bugsplat/platform-id` | Get the bugsplat platform id. |
| PUT | `/riotclient/v1/bugsplat/platform-id` | Tags the bugsplat with a platform id so it can be filtered more easily. |
| GET | `/riotclient/zoom-scale` | Gets the last known posted zoom-scale value. |
| POST | `/riotclient/zoom-scale` | Handles changing the zoom scale value. |

---

### `POST /riotclient/addorupdatemetric`

Adds or Updates a Metric

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `group` | query | string | yes | Name of metric group |
| `object` | query | string | yes | Name of metric object |
| `name` | query | string | yes | Name of metric item |
| `value` | query | integer (int64) | yes | Value to store |

**Responses**

- **204 No Content** — No content

---

### `DELETE /riotclient/affinity`

Deletes the current runtime affinity of the application.

**Responses**

- **204 No Content** — No content

---

### `GET /riotclient/affinity`

Get the current runtime affinity of the application.

**Responses**

- **200 OK** — Successful response

---

### `POST /riotclient/affinity`

Sets the current runtime affinity of the application.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `newAffinity` | query | string | yes | The new affinity to use. |

**Responses**

- **204 No Content** — No content

---

### `GET /riotclient/app-name`

Application name without file extension

**Responses**

- **200 OK** — Successful response

---

### `GET /riotclient/app-port`

Get the TCP port number that the remoting server is listening on.

**Responses**

- **200 OK** — Successful response

---

### `GET /riotclient/auth-token`

Return the auth token used by the remoting server

**Responses**

- **200 OK** — Successful response

---

### `GET /riotclient/command-line-args`

Get the command line parameters for the application

**Responses**

- **200 OK** — Successful response

---

### `GET /riotclient/get_region_locale`

Get the current region and locale.

**Responses**

- **200 OK** — Successful response

---

### `POST /riotclient/kill-and-restart-ux`

Kills the ux process and restarts it. Used only when the ux process crashes.

**Responses**

- **204 No Content** — No content

---

### `POST /riotclient/kill-ux`

Kills the ux process.

**Responses**

- **204 No Content** — No content

---

### `POST /riotclient/launch-ux`

Launches the ux process.

**Responses**

- **204 No Content** — No content

---

### `GET /riotclient/machine-id`

Base64 encoded uuid identifying the user's machine

**Responses**

- **200 OK** — Successful response

---

### `POST /riotclient/new-args`

Endpoint for passing in new data.

**Responses**

- **204 No Content** — No content

---

### `GET /riotclient/region-locale`

Get the current region and locale.

**Responses**

- **200 OK** — Successful response

---

### `PUT /riotclient/region-locale`

Update the region and locale.

**Responses**

- **204 No Content** — No content

---

### `PUT /riotclient/region-locale/ack`

Ux acknowledges the update to the region and locale.

**Responses**

- **204 No Content** — No content

---

### `POST /riotclient/set_region_locale`

Update the region and locale.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `region` | query | string | yes | Name of the region. |
| `locale` | query | string | yes | Name of the locale. |

**Responses**

- **204 No Content** — No content

---

### `POST /riotclient/show-swagger`

Open swagger in the default browser.

**Responses**

- **204 No Content** — No content

---

### `DELETE /riotclient/splash`

Hide the splash screen.

**Responses**

- **204 No Content** — No content

---

### `PUT /riotclient/splash`

Show the splash screen.

**Responses**

- **204 No Content** — No content

---

### `GET /riotclient/system-info/v1/basic-info`

Get basic system information: OS, memory, processor speed, and number of physical cores

**Responses**

- **200 OK** — Successful response

---

### `GET /riotclient/trace`

Retrieves a completed scheduler trace.

**Responses**

- **200 OK** — Successful response

---

### `POST /riotclient/unload`

Unloads the UX process

**Responses**

- **204 No Content** — No content

---

### `GET /riotclient/ux-crash-count`

Returns whether the ux has crashed or not

**Responses**

- **200 OK** — Successful response

---

### `POST /riotclient/ux-flash`

Flash the ux process' main window and the taskbar/dock icon, if they exist.

**Responses**

- **204 No Content** — No content

---

### `PUT /riotclient/ux-load-complete`

Ux notification that it has completed loading the main window.

**Responses**

- **204 No Content** — No content

---

### `POST /riotclient/ux-minimize`

Minimize the ux process and all its windows if it exists. This does not kill the ux.

**Responses**

- **204 No Content** — No content

---

### `POST /riotclient/ux-show`

Shows the ux process if it exists; create and show if it does not.

**Responses**

- **204 No Content** — No content

---

### `GET /riotclient/ux-state`

Get the current Ux state.

**Responses**

- **200 OK** — Successful response

---

### `PUT /riotclient/ux-state/ack`

Ux acknowledges the update to the Ux state.

**Responses**

- **204 No Content** — No content

---

### `DELETE /riotclient/v1/auth-tokens/{authToken}`

Unregister an existing auth token.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `authToken` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /riotclient/v1/auth-tokens/{authToken}`

Register an auth token. This is any alpha-numeric string that will be used as a password with the riot user when making requests.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `authToken` | path | string | yes | Authentication token to add. |

**Responses**

- **200 OK** — Successful response

---

### `POST /riotclient/v1/bugsplat/logs`

Adds the enclosed log to the app's bugsplat report.

**Responses**

- **204 No Content** — No content

---

### `GET /riotclient/v1/bugsplat/platform-id`

Get the bugsplat platform id.

**Responses**

- **200 OK** — Successful response

---

### `PUT /riotclient/v1/bugsplat/platform-id`

Tags the bugsplat with a platform id so it can be filtered more easily.

**Responses**

- **204 No Content** — No content

---

### `GET /riotclient/zoom-scale`

Gets the last known posted zoom-scale value.

**Responses**

- **200 OK** — Successful response

---

### `POST /riotclient/zoom-scale`

Handles changing the zoom scale value.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `newZoomScale` | query | number (double) | yes | The new value of the zoom scale. |

**Responses**

- **204 No Content** — No content

---
