# lol-store

*16 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-store/v1/catalog` |  |
| GET | `/lol-store/v1/getStoreUrl` |  |
| GET | `/lol-store/v1/giftablefriends` |  |
| GET | `/lol-store/v1/lastPage` |  |
| POST | `/lol-store/v1/lastPage` |  |
| GET | `/lol-store/v1/login` |  |
| POST | `/lol-store/v1/notifications/acknowledge` |  |
| GET | `/lol-store/v1/order-notifications` |  |
| DELETE | `/lol-store/v1/order-notifications/{id}` |  |
| GET | `/lol-store/v1/order-notifications/{id}` |  |
| GET | `/lol-store/v1/paymentDetails` |  |
| GET | `/lol-store/v1/skins/{skinId}` |  |
| POST | `/lol-store/v1/skins/{skinId}/purchase` |  |
| GET | `/lol-store/v1/status` |  |
| GET | `/lol-store/v1/wallet` |  |
| GET | `/lol-store/v1/{pageType}` |  |

---

### `GET /lol-store/v1/catalog`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `inventoryType` | query | string[] |  |  |
| `itemId` | query | integer[] |  |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-store/v1/getStoreUrl`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-store/v1/giftablefriends`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-store/v1/lastPage`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-store/v1/lastPage`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-store/v1/login`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-store/v1/notifications/acknowledge`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-store/v1/order-notifications`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-store/v1/order-notifications/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-store/v1/order-notifications/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-store/v1/paymentDetails`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `action` | query | string | yes |  |
| `giftRecipientAccountId` | query | integer (int64) |  |  |
| `giftMessage` | query | string |  |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-store/v1/skins/{skinId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `skinId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-store/v1/skins/{skinId}/purchase`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `skinId` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-store/v1/status`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-store/v1/wallet`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-store/v1/{pageType}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `pageType` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---
