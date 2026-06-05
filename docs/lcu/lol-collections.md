# lol-collections

*16 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-collections/v1/inventories/chest-eligibility` |  |
| GET | `/lol-collections/v1/inventories/{summonerId}/backdrop` |  |
| GET | `/lol-collections/v1/inventories/{summonerId}/champion-mastery` |  |
| GET | `/lol-collections/v1/inventories/{summonerId}/champion-mastery/top` |  |
| GET | `/lol-collections/v1/inventories/{summonerId}/rune-book` |  |
| PUT | `/lol-collections/v1/inventories/{summonerId}/rune-book` |  |
| PUT | `/lol-collections/v1/inventories/{summonerId}/rune-book/pages/{pageId}` |  |
| PUT | `/lol-collections/v1/inventories/{summonerId}/rune-book/select-page/{pageId}` |  |
| GET | `/lol-collections/v1/inventories/{summonerId}/runes` |  |
| GET | `/lol-collections/v1/inventories/{summonerId}/spells` |  |
| GET | `/lol-collections/v1/inventories/{summonerId}/summoner-icons` |  |
| PUT | `/lol-collections/v1/inventories/{summonerId}/verification` |  |
| GET | `/lol-collections/v1/inventories/{summonerId}/ward-skins` |  |
| GET | `/lol-collections/v1/inventories/{summonerId}/ward-skins/{wardSkinId}` |  |
| GET | `/lol-collections/v2/inventories/{summonerId}/summoner-icons` |  |
| GET | `/lol-collections/v2/inventories/{summonerId}/summoner-icons/{summonerIconId}` |  |

---

### `GET /lol-collections/v1/inventories/chest-eligibility`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v1/inventories/{summonerId}/backdrop`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v1/inventories/{summonerId}/champion-mastery`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v1/inventories/{summonerId}/champion-mastery/top`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |
| `limit` | query | integer (int64) | yes |  |
| `sortRule` | query | string |  |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v1/inventories/{summonerId}/rune-book`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-collections/v1/inventories/{summonerId}/rune-book`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-collections/v1/inventories/{summonerId}/rune-book/pages/{pageId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |
| `pageId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-collections/v1/inventories/{summonerId}/rune-book/select-page/{pageId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |
| `pageId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v1/inventories/{summonerId}/runes`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v1/inventories/{summonerId}/spells`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v1/inventories/{summonerId}/summoner-icons`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-collections/v1/inventories/{summonerId}/verification`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v1/inventories/{summonerId}/ward-skins`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v1/inventories/{summonerId}/ward-skins/{wardSkinId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |
| `wardSkinId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v2/inventories/{summonerId}/summoner-icons`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-collections/v2/inventories/{summonerId}/summoner-icons/{summonerIconId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |
| `summonerIconId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---
