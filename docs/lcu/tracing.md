# tracing

*4 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/tracing/v1/trace/event` | Record a tracing event. |
| POST | `/tracing/v1/trace/module` | Record a module description. |
| POST | `/tracing/v1/trace/phase/begin` | Record a tracing phase beginning. |
| POST | `/tracing/v1/trace/phase/end` | Record a tracing phase ending. |

---

### `POST /tracing/v1/trace/event`

Record a tracing event.

**Responses**

- **204 No Content** — No content

---

### `POST /tracing/v1/trace/module`

Record a module description.

**Responses**

- **204 No Content** — No content

---

### `POST /tracing/v1/trace/phase/begin`

Record a tracing phase beginning.

**Responses**

- **204 No Content** — No content

---

### `POST /tracing/v1/trace/phase/end`

Record a tracing phase ending.

**Responses**

- **204 No Content** — No content

---
