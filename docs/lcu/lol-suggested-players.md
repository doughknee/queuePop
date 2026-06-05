# lol-suggested-players

*4 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/lol-suggested-players/v1/reported-player` |  |
| GET | `/lol-suggested-players/v1/suggested-players` |  |
| DELETE | `/lol-suggested-players/v1/suggested-players/{summonerId}` |  |
| POST | `/lol-suggested-players/v1/victorious-comrade` |  |

---

### `POST /lol-suggested-players/v1/reported-player`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-suggested-players/v1/suggested-players`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-suggested-players/v1/suggested-players/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-suggested-players/v1/victorious-comrade`

**Responses**

- **204 No Content** — No content

---
