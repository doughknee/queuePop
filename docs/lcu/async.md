# async

*3 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/async/v1/result/{asyncToken}` | Retrieves the result of a completed asynchronous operation. |
| DELETE | `/async/v1/status/{asyncToken}` | Cancels the asynchronous operation or removes its completion status. |
| GET | `/async/v1/status/{asyncToken}` | Retrieves details on the current state of an asynchronous operation. |

---

### `GET /async/v1/result/{asyncToken}`

Retrieves the result of a completed asynchronous operation.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `asyncToken` | path | integer (int32) | yes | ID of the asynchronous operation to check |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /async/v1/status/{asyncToken}`

Cancels the asynchronous operation or removes its completion status.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `asyncToken` | path | integer (int32) | yes | ID of the asynchronous operation to remove |

**Responses**

- **200 OK** — Successful response

---

### `GET /async/v1/status/{asyncToken}`

Retrieves details on the current state of an asynchronous operation.

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `asyncToken` | path | integer (int32) | yes | ID of the asynchronous operation to check |

**Responses**

- **200 OK** — Successful response

---
