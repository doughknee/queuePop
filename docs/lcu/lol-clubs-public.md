# lol-clubs-public

*3 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-clubs-public/v1/clubs/public` |  |
| GET | `/lol-clubs-public/v1/clubs/public/{summonerId}` |  |
| GET | `/lol-clubs-public/v1/clubs/public/{summonerId}/tag` |  |

---

### `GET /lol-clubs-public/v1/clubs/public`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerNames` | query | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clubs-public/v1/clubs/public/{summonerId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clubs-public/v1/clubs/public/{summonerId}/tag`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---
