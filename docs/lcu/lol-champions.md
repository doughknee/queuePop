# lol-champions

*9 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-champions/v1/inventories/{summonerId}/champions` |  |
| GET | `/lol-champions/v1/inventories/{summonerId}/champions-minimal` |  |
| GET | `/lol-champions/v1/inventories/{summonerId}/champions-playable-count` |  |
| GET | `/lol-champions/v1/inventories/{summonerId}/champions/{championId}` |  |
| GET | `/lol-champions/v1/inventories/{summonerId}/champions/{championId}/skins` |  |
| GET | `/lol-champions/v1/inventories/{summonerId}/champions/{championId}/skins/{championSkinId}` |  |
| GET | `/lol-champions/v1/inventories/{summonerId}/champions/{championId}/skins/{skinId}/chromas` |  |
| GET | `/lol-champions/v1/inventories/{summonerId}/skins-minimal` |  |
| GET | `/lol-champions/v1/owned-champions-minimal` |  |

---

### `GET /lol-champions/v1/inventories/{summonerId}/champions`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-champions/v1/inventories/{summonerId}/champions-minimal`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-champions/v1/inventories/{summonerId}/champions-playable-count`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-champions/v1/inventories/{summonerId}/champions/{championId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |
| `championId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-champions/v1/inventories/{summonerId}/champions/{championId}/skins`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |
| `championId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-champions/v1/inventories/{summonerId}/champions/{championId}/skins/{championSkinId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |
| `championId` | path | integer (int32) | yes |  |
| `championSkinId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-champions/v1/inventories/{summonerId}/champions/{championId}/skins/{skinId}/chromas`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |
| `championId` | path | integer (int32) | yes |  |
| `skinId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-champions/v1/inventories/{summonerId}/skins-minimal`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-champions/v1/owned-champions-minimal`

**Responses**

- **200 OK** — Successful response

---
