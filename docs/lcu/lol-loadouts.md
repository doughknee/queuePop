# lol-loadouts

*7 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/lol-loadouts/v4/loadouts` |  |
| GET | `/lol-loadouts/v4/loadouts/scope/account` |  |
| GET | `/lol-loadouts/v4/loadouts/scope/{scope}/{scopeItemId}` |  |
| DELETE | `/lol-loadouts/v4/loadouts/{id}` |  |
| PATCH | `/lol-loadouts/v4/loadouts/{id}` |  |
| PUT | `/lol-loadouts/v4/loadouts/{id}` |  |
| GET | `/lol-loadouts/v4/loadouts/{loadoutId}` |  |

---

### `POST /lol-loadouts/v4/loadouts`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loadouts/v4/loadouts/scope/account`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loadouts/v4/loadouts/scope/{scope}/{scopeItemId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `scope` | path | string | yes |  |
| `scopeItemId` | path | integer (int32) |  |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-loadouts/v4/loadouts/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `PATCH /lol-loadouts/v4/loadouts/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-loadouts/v4/loadouts/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-loadouts/v4/loadouts/{loadoutId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `loadoutId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---
