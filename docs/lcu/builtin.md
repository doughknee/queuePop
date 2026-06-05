# (builtin)

*19 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/AsyncDelete` | Cancels the asynchronous operation or removes its completion status. |
| POST | `/AsyncResult` | Retrieves the result of a completed asynchronous operation. |
| POST | `/AsyncStatus` | Retrieves details on the current state of an asynchronous operation. |
| POST | `/Cancel` | Attempts to cancel an asynchronous operation |
| POST | `/Exit` | Closes the connection. |
| POST | `/Help` | Returns information on available functions and types |
| POST | `/LoggingGetEntries` | Gets all buffered log entries since the last call. |
| POST | `/LoggingMetrics` | Returns all metrics |
| POST | `/LoggingMetricsMetadata` | Returns metadata for all metrics |
| POST | `/LoggingStart` | Initializes the logging system. |
| POST | `/LoggingStop` | Finalizes the logging system. |
| POST | `/MemoryFilterEnable` | Memory filter prints to the log when memory is allocated or freed that matches the filter parameters set in MemoryFilterSet |
| POST | `/MemoryFilterSet` | Sets the filter parameters for when to print to the log. Use MemoryFilterEnable to start/stop the print outs |
| POST | `/MemoryPools` | Returns current pool usage |
| POST | `/MemoryStats` | Returns aggregate information about memory usage |
| POST | `/MemoryUsage` | Returns current memory usage by callstack site |
| POST | `/Subscribe` | Subscribes to a given event |
| POST | `/Unsubscribe` | Unsubscribes from a given event |
| POST | `/WebSocketFormat` | Controls the console output format |

---

### `POST /AsyncDelete`

Cancels the asynchronous operation or removes its completion status.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `asyncToken` | query | integer (int32) | yes | ID of the asynchronous operation to remove |

**Responses**

- **200 OK** — Successful response

---

### `POST /AsyncResult`

Retrieves the result of a completed asynchronous operation.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `asyncToken` | query | integer (int32) | yes | ID of the asynchronous operation to check |

**Responses**

- **200 OK** — Successful response

---

### `POST /AsyncStatus`

Retrieves details on the current state of an asynchronous operation.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `asyncToken` | query | integer (int32) | yes | ID of the asynchronous operation to check |

**Responses**

- **200 OK** — Successful response

---

### `POST /Cancel`

Attempts to cancel an asynchronous operation

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `asyncToken` | query | integer (int32) | yes | Operation to cancel |

**Responses**

- **200 OK** — Successful response

---

### `POST /Exit`

Closes the connection.

**Responses**

- **200 OK** — Successful response

---

### `POST /Help`

Returns information on available functions and types

With no arguments, returns a list of all available functions and types along with a short description. If a function or type is specified, returns detailed information about it.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `target` | query | string |  | Name of the function or type to describe |
| `format` | query | string , x ∈ { Full , Epytext , Brief , Console } |  | Format for returned information |

**Responses**

- **200 OK** — Successful response

---

### `POST /LoggingGetEntries`

Gets all buffered log entries since the last call.

**Responses**

- **200 OK** — Successful response

---

### `POST /LoggingMetrics`

Returns all metrics

**Responses**

- **200 OK** — Successful response

---

### `POST /LoggingMetricsMetadata`

Returns metadata for all metrics

**Responses**

- **200 OK** — Successful response

---

### `POST /LoggingStart`

Initializes the logging system.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `buffered` | query | boolean |  | Specifies whether logs will be buffered for LoggingGetEntries to work |
| `severity` | query | string , x ∈ { Okay , Warning , Error , Always } |  | Minimum severity level to fire a log event |

**Responses**

- **204 No Content** — No content

---

### `POST /LoggingStop`

Finalizes the logging system.

**Responses**

- **204 No Content** — No content

---

### `POST /MemoryFilterEnable`

Memory filter prints to the log when memory is allocated or freed that matches the filter parameters set in MemoryFilterSet

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `enable` | query | integer (int32) |  | Enable/disable the memory filter |

**Responses**

- **204 No Content** — No content

---

### `POST /MemoryFilterSet`

Sets the filter parameters for when to print to the log. Use MemoryFilterEnable to start/stop the print outs

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `minSize` | query | integer (int32) |  | Optional filter for minimum size to output |
| `maxSize` | query | integer (int32) |  | Optional filter for maximum size to output |
| `minAddress` | query | string |  | Optional filter for minimum address in hex to output |
| `maxAddress` | query | string |  | Optional filter for maximum address in hex to output |

**Responses**

- **204 No Content** — No content

---

### `POST /MemoryPools`

Returns current pool usage

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `contextName` | query | string |  | Name of the context to find (optional) |

**Responses**

- **200 OK** — Successful response

---

### `POST /MemoryStats`

Returns aggregate information about memory usage

'allocation_count' is deprecated, use 'allocated_count' instead.

**Responses**

- **200 OK** — Successful response

---

### `POST /MemoryUsage`

Returns current memory usage by callstack site

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `minSize` | query | integer (int32) |  | Minimum size of total allocations at call site in order to print (optional: MEMORYUSAGE_MINSIZE default) |
| `minCount` | query | integer (int32) |  | Minimum count of total allocations at call site in order to print (optional: MEMORYUSAGE_MINCOUNT default) |

**Responses**

- **200 OK** — Successful response

---

### `POST /Subscribe`

Subscribes to a given event

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `eventName` | query | string | yes | Name of the event to subscribe to |
| `format` | query | string , x ∈ { JSON , YAML , MsgPack } |  | Desired format to receive events in. If unspecified, events will be sent in the active result format at the time. |

**Responses**

- **200 OK** — Successful response

---

### `POST /Unsubscribe`

Unsubscribes from a given event

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `eventName` | query | string | yes | Name of the event to unsubscribe from |

**Responses**

- **200 OK** — Successful response

---

### `POST /WebSocketFormat`

Controls the console output format

With no arguments, returns the current output format being used. If a format is specified, switches the console output to that format.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `format` | query | string , x ∈ { JSON , YAML , MsgPack } |  | Output format to switch to |

**Responses**

- **200 OK** — Successful response

---
