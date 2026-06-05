# lol-regalia

*5 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-regalia/v2/config` |  |
| GET | `/lol-regalia/v2/current-summoner/regalia` |  |
| PUT | `/lol-regalia/v2/current-summoner/regalia` |  |
| GET | `/lol-regalia/v2/summoners/{summonerId}/regalia` |  |
| GET | `/lol-regalia/v2/summoners/{summonerId}/regalia/async` |  |

---

### `GET /lol-regalia/v2/config`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-regalia/v2/current-summoner/regalia`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-regalia/v2/current-summoner/regalia`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-regalia/v2/summoners/{summonerId}/regalia`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |
| `hovercard` | query | boolean | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-regalia/v2/summoners/{summonerId}/regalia/async`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---
