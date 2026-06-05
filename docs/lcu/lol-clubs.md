# lol-clubs

*24 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-clubs/v1/clubs` |  |
| GET | `/lol-clubs/v1/clubs/invitations` |  |
| PATCH | `/lol-clubs/v1/clubs/invitations` |  |
| GET | `/lol-clubs/v1/clubs/membership` |  |
| POST | `/lol-clubs/v1/clubs/membership` |  |
| GET | `/lol-clubs/v1/clubs/membership/preferences` |  |
| PATCH | `/lol-clubs/v1/clubs/membership/preferences` |  |
| DELETE | `/lol-clubs/v1/clubs/{clubKey}` |  |
| GET | `/lol-clubs/v1/clubs/{clubKey}` |  |
| PATCH | `/lol-clubs/v1/clubs/{clubKey}` |  |
| GET | `/lol-clubs/v1/clubs/{clubKey}/invitations` |  |
| DELETE | `/lol-clubs/v1/clubs/{clubKey}/invitations/{summonerId}` |  |
| POST | `/lol-clubs/v1/clubs/{clubKey}/invitations/{summonerId}` |  |
| GET | `/lol-clubs/v1/clubs/{clubKey}/members` |  |
| DELETE | `/lol-clubs/v1/clubs/{clubKey}/members/{summonerId}` |  |
| POST | `/lol-clubs/v1/clubs/{clubKey}/members/{summonerId}` |  |
| GET | `/lol-clubs/v1/clubs/{clubKey}/motd` |  |
| PATCH | `/lol-clubs/v1/clubs/{clubKey}/motd` |  |
| GET | `/lol-clubs/v1/clubs/{clubKey}/nominations` |  |
| DELETE | `/lol-clubs/v1/clubs/{clubKey}/nominations/{summonerId}` |  |
| POST | `/lol-clubs/v1/clubs/{clubKey}/nominations/{summonerId}` |  |
| DELETE | `/lol-clubs/v1/clubs/{clubKey}/promotions/{summonerId}` |  |
| POST | `/lol-clubs/v1/clubs/{clubKey}/promotions/{summonerId}` |  |
| POST | `/lol-clubs/v1/clubs/{clubKey}/view` |  |

---

### `GET /lol-clubs/v1/clubs`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clubs/v1/clubs/invitations`

**Responses**

- **200 OK** — Successful response

---

### `PATCH /lol-clubs/v1/clubs/invitations`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clubs/v1/clubs/membership`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clubs/v1/clubs/membership`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clubs/v1/clubs/membership/preferences`

**Responses**

- **200 OK** — Successful response

---

### `PATCH /lol-clubs/v1/clubs/membership/preferences`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-clubs/v1/clubs/{clubKey}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clubs/v1/clubs/{clubKey}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PATCH /lol-clubs/v1/clubs/{clubKey}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clubs/v1/clubs/{clubKey}/invitations`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-clubs/v1/clubs/{clubKey}/invitations/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clubs/v1/clubs/{clubKey}/invitations/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clubs/v1/clubs/{clubKey}/members`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-clubs/v1/clubs/{clubKey}/members/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clubs/v1/clubs/{clubKey}/members/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clubs/v1/clubs/{clubKey}/motd`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PATCH /lol-clubs/v1/clubs/{clubKey}/motd`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clubs/v1/clubs/{clubKey}/nominations`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-clubs/v1/clubs/{clubKey}/nominations/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clubs/v1/clubs/{clubKey}/nominations/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-clubs/v1/clubs/{clubKey}/promotions/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clubs/v1/clubs/{clubKey}/promotions/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clubs/v1/clubs/{clubKey}/view`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `clubKey` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---
