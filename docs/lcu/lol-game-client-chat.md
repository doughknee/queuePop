# lol-game-client-chat

*6 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-game-client-chat/v1/buddies` |  |
| DELETE | `/lol-game-client-chat/v1/ignored-summoners` |  |
| GET | `/lol-game-client-chat/v1/ignored-summoners` |  |
| POST | `/lol-game-client-chat/v1/ignored-summoners` |  |
| POST | `/lol-game-client-chat/v1/instant-messages` |  |
| POST | `/lol-game-client-chat/v1/party-messages` |  |

---

### `GET /lol-game-client-chat/v1/buddies`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-game-client-chat/v1/ignored-summoners`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerName` | query | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /lol-game-client-chat/v1/ignored-summoners`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-game-client-chat/v1/ignored-summoners`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerName` | query | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-game-client-chat/v1/instant-messages`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerName` | query | string | yes |  |
| `message` | query | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-game-client-chat/v1/party-messages`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `message` | query | string | yes |  |

**Responses**

- **204 No Content** — No content

---
