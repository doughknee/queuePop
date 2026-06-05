# lol-inventory

*15 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-inventory/v1/champSelectInventory` |  |
| GET | `/lol-inventory/v1/initial-configuration-complete` |  |
| GET | `/lol-inventory/v1/inventory` |  |
| GET | `/lol-inventory/v1/inventory/emotes` |  |
| POST | `/lol-inventory/v1/notification/acknowledge` |  |
| GET | `/lol-inventory/v1/notifications/{inventoryType}` |  |
| GET | `/lol-inventory/v1/players/{puuid}/inventory` |  |
| GET | `/lol-inventory/v1/signedInventory` |  |
| GET | `/lol-inventory/v1/signedInventory/tournamentlogos` |  |
| GET | `/lol-inventory/v1/signedInventoryCache` |  |
| GET | `/lol-inventory/v1/signedWallet` |  |
| GET | `/lol-inventory/v1/signedWallet/{currencyType}` |  |
| GET | `/lol-inventory/v1/wallet` |  |
| GET | `/lol-inventory/v1/wallet/{currencyType}` |  |
| GET | `/lol-inventory/v2/inventory/{inventoryType}` |  |

---

### `GET /lol-inventory/v1/champSelectInventory`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/initial-configuration-complete`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/inventory`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `inventoryTypes` | query | string[] | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/inventory/emotes`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-inventory/v1/notification/acknowledge`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-inventory/v1/notifications/{inventoryType}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `inventoryType` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/players/{puuid}/inventory`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `puuid` | path | string | yes |  |
| `inventoryTypes` | query | string[] | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/signedInventory`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `inventoryTypes` | query | string[] | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/signedInventory/tournamentlogos`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/signedInventoryCache`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/signedWallet`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `currencyTypes` | query | string[] | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/signedWallet/{currencyType}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `currencyType` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/wallet`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `currencyTypes` | query | string[] | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v1/wallet/{currencyType}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `currencyType` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-inventory/v2/inventory/{inventoryType}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `inventoryType` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---
