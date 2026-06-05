# performance

*5 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/performance/v1/memory` | Returns process memory status |
| POST | `/performance/v1/process/{processId}` | Registers the process and includes it with the performance information. |
| GET | `/performance/v1/report` | Returns the various performance information for the cef processes |
| POST | `/performance/v1/report/restart` | Restarts the CPU timing information and returns the results from PerfReportProcesses |
| GET | `/performance/v1/system-info` | Returns hardware and software specs for the machine the client is running on. |

---

### `GET /performance/v1/memory`

Returns process memory status

**Responses**

- **200 OK** — Successful response

---

### `POST /performance/v1/process/{processId}`

Registers the process and includes it with the performance information.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `processId` | path | integer (int32) | yes | Id of the process to track performance information. |

**Responses**

- **204 No Content** — No content

---

### `GET /performance/v1/report`

Returns the various performance information for the cef processes

**Responses**

- **200 OK** — Successful response

---

### `POST /performance/v1/report/restart`

Restarts the CPU timing information and returns the results from PerfReportProcesses

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `sampleLength` | query | integer (int32) |  | Time in seconds for each CPU timing sample. |
| `sampleCount` | query | integer (int32) |  | Number of samples to record. |

**Responses**

- **200 OK** — Successful response

---

### `GET /performance/v1/system-info`

Returns hardware and software specs for the machine the client is running on.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `full` | query | integer (int32) |  | Returns all available system information |

**Responses**

- **200 OK** — Successful response

---
