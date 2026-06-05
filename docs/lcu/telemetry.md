# telemetry

*4 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/telemetry/v1/application-start-time` | Gets the millisecond UNIX timestamp of when the application was started. |
| POST | `/telemetry/v1/common-data/{key}` | Adds/updates a common data key and value to be sent with every subsequent event. |
| POST | `/telemetry/v1/events-with-perf-info/{eventType}` | Adds a new event to be sent to Dradis and/or other analytics/monitoring data sinks. This will include current performance information along with the passed in data. Each call will record the performance counters then reset them for use in the next call. All events will have their eventType prefixed with "" |
| POST | `/telemetry/v1/events/{eventType}` | Adds a new event to be sent to Dradis and/or other analytics/monitoring data sinks. All events will have their eventType prefixed with "" |

---

### `GET /telemetry/v1/application-start-time`

Gets the millisecond UNIX timestamp of when the application was started.

**Responses**

- **200 OK** — Successful response

---

### `POST /telemetry/v1/common-data/{key}`

Adds/updates a common data key and value to be sent with every subsequent event.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `key` | path | string | yes | The name of the common data key |

**Responses**

- **204 No Content** — No content

---

### `POST /telemetry/v1/events-with-perf-info/{eventType}`

Adds a new event to be sent to Dradis and/or other analytics/monitoring data sinks. This will include current performance information along with the passed in data. Each call will record the performance counters then reset them for use in the next call. All events will have their eventType prefixed with ""

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `eventType` | path | string | yes | The name of the event type |

**Responses**

- **204 No Content** — No content

---

### `POST /telemetry/v1/events/{eventType}`

Adds a new event to be sent to Dradis and/or other analytics/monitoring data sinks. All events will have their eventType prefixed with ""

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `eventType` | path | string | yes | The name of the event type |

**Responses**

- **204 No Content** — No content

---
