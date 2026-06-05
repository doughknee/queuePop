# lol-queue-eligibility

*5 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| POST | `/lol-queue-eligibility/v1/eligibility` |  |
| GET | `/lol-queue-eligibility/v1/initial-configuration-complete` |  |
| POST | `/lol-queue-eligibility/v2/eligibility` |  |
| GET | `/lol-queue-eligibility/v3/custom` |  |
| GET | `/lol-queue-eligibility/v3/eligibility` |  |

---

### `POST /lol-queue-eligibility/v1/eligibility`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-queue-eligibility/v1/initial-configuration-complete`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-queue-eligibility/v2/eligibility`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-queue-eligibility/v3/custom`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `teamSize` | query | integer (int32) | yes |  |
| `pickMode` | query | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-queue-eligibility/v3/eligibility`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerIds` | query | integer[] | yes |  |
| `queueIds` | query | integer[] | yes |  |

**Responses**

- **200 OK** — Successful response

---
