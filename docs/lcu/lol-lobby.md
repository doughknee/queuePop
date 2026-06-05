# lol-lobby

*67 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-lobby/v1/autofill-displayed` |  |
| PUT | `/lol-lobby/v1/autofill-displayed` |  |
| DELETE | `/lol-lobby/v1/clash` |  |
| POST | `/lol-lobby/v1/clash` |  |
| GET | `/lol-lobby/v1/custom-games` |  |
| POST | `/lol-lobby/v1/custom-games/refresh` |  |
| GET | `/lol-lobby/v1/custom-games/{id}` |  |
| POST | `/lol-lobby/v1/custom-games/{id}/join` |  |
| GET | `/lol-lobby/v1/lobby/availability` |  |
| GET | `/lol-lobby/v1/lobby/countdown` |  |
| POST | `/lol-lobby/v1/lobby/custom/bots` |  |
| DELETE | `/lol-lobby/v1/lobby/custom/bots/{summonerInternalName}` |  |
| POST | `/lol-lobby/v1/lobby/custom/bots/{summonerInternalName}` |  |
| POST | `/lol-lobby/v1/lobby/custom/cancel-champ-select` |  |
| POST | `/lol-lobby/v1/lobby/custom/start-champ-select` |  |
| POST | `/lol-lobby/v1/lobby/custom/switch-teams` |  |
| GET | `/lol-lobby/v1/lobby/invitations` |  |
| POST | `/lol-lobby/v1/lobby/invitations` |  |
| GET | `/lol-lobby/v1/lobby/invitations/{id}` |  |
| PUT | `/lol-lobby/v1/lobby/members/localMember/position-preferences` |  |
| PUT | `/lol-lobby/v1/parties/active` |  |
| GET | `/lol-lobby/v1/parties/health` |  |
| PUT | `/lol-lobby/v1/parties/metadata` |  |
| GET | `/lol-lobby/v1/parties/player` |  |
| PUT | `/lol-lobby/v1/parties/queue` |  |
| PUT | `/lol-lobby/v1/parties/ready` |  |
| PUT | `/lol-lobby/v1/parties/{partyId}/members/{puuid}/role` |  |
| GET | `/lol-lobby/v1/party-rewards` |  |
| POST | `/lol-lobby/v1/tournaments/{id}/join` |  |
| GET | `/lol-lobby/v2/comms/members` |  |
| GET | `/lol-lobby/v2/comms/token` |  |
| GET | `/lol-lobby/v2/eligibility/game-select-eligibility-hash` |  |
| GET | `/lol-lobby/v2/eligibility/initial-configuration-complete` |  |
| POST | `/lol-lobby/v2/eligibility/party` |  |
| POST | `/lol-lobby/v2/eligibility/self` |  |
| POST | `/lol-lobby/v2/eog-invitations` |  |
| DELETE | `/lol-lobby/v2/lobby` |  |
| GET | `/lol-lobby/v2/lobby` |  |
| POST | `/lol-lobby/v2/lobby` |  |
| GET | `/lol-lobby/v2/lobby/custom/available-bots` |  |
| GET | `/lol-lobby/v2/lobby/custom/bots-enabled` |  |
| GET | `/lol-lobby/v2/lobby/invitations` |  |
| POST | `/lol-lobby/v2/lobby/invitations` |  |
| DELETE | `/lol-lobby/v2/lobby/matchmaking/search` |  |
| POST | `/lol-lobby/v2/lobby/matchmaking/search` |  |
| GET | `/lol-lobby/v2/lobby/matchmaking/search-state` |  |
| GET | `/lol-lobby/v2/lobby/members` |  |
| PUT | `/lol-lobby/v2/lobby/members/localMember/position-preferences` |  |
| POST | `/lol-lobby/v2/lobby/members/{summonerId}/grant-invite` |  |
| POST | `/lol-lobby/v2/lobby/members/{summonerId}/kick` |  |
| POST | `/lol-lobby/v2/lobby/members/{summonerId}/promote` |  |
| POST | `/lol-lobby/v2/lobby/members/{summonerId}/revoke-invite` |  |
| PUT | `/lol-lobby/v2/lobby/partyType` |  |
| POST | `/lol-lobby/v2/matchmaking/quick-search` |  |
| GET | `/lol-lobby/v2/notifications` |  |
| POST | `/lol-lobby/v2/notifications` |  |
| DELETE | `/lol-lobby/v2/notifications/{notificationId}` |  |
| POST | `/lol-lobby/v2/parties/overrides/Enabled` |  |
| POST | `/lol-lobby/v2/parties/overrides/EnabledForTeamBuilderQueues` |  |
| GET | `/lol-lobby/v2/party-active` |  |
| GET | `/lol-lobby/v2/party/eog-status` |  |
| POST | `/lol-lobby/v2/party/{partyId}/join` |  |
| POST | `/lol-lobby/v2/play-again` |  |
| POST | `/lol-lobby/v2/play-again-decline` |  |
| GET | `/lol-lobby/v2/received-invitations` |  |
| POST | `/lol-lobby/v2/received-invitations/{invitationId}/accept` |  |
| POST | `/lol-lobby/v2/received-invitations/{invitationId}/decline` |  |

---

### `GET /lol-lobby/v1/autofill-displayed`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-lobby/v1/autofill-displayed`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-lobby/v1/clash`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v1/clash`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v1/custom-games`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v1/custom-games/refresh`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v1/custom-games/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int32) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v1/custom-games/{id}/join`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v1/lobby/availability`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v1/lobby/countdown`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v1/lobby/custom/bots`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-lobby/v1/lobby/custom/bots/{summonerInternalName}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerInternalName` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v1/lobby/custom/bots/{summonerInternalName}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerInternalName` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v1/lobby/custom/cancel-champ-select`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v1/lobby/custom/start-champ-select`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v1/lobby/custom/switch-teams`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `team` | query | string |  |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v1/lobby/invitations`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v1/lobby/invitations`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v1/lobby/invitations/{id}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-lobby/v1/lobby/members/localMember/position-preferences`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-lobby/v1/parties/active`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-lobby/v1/parties/health`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-lobby/v1/parties/metadata`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-lobby/v1/parties/player`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-lobby/v1/parties/queue`

**Responses**

- **204 No Content** — No content

---

### `PUT /lol-lobby/v1/parties/ready`

**Responses**

- **204 No Content** — No content

---

### `PUT /lol-lobby/v1/parties/{partyId}/members/{puuid}/role`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `partyId` | path | string | yes |  |
| `puuid` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /lol-lobby/v1/party-rewards`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v1/tournaments/{id}/join`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/comms/members`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/comms/token`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/eligibility/game-select-eligibility-hash`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/eligibility/initial-configuration-complete`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/eligibility/party`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/eligibility/self`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/eog-invitations`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-lobby/v2/lobby`

**Responses**

- **204 No Content** — No content

---

### `GET /lol-lobby/v2/lobby`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/lobby`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/lobby/custom/available-bots`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/lobby/custom/bots-enabled`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/lobby/invitations`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/lobby/invitations`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-lobby/v2/lobby/matchmaking/search`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/lobby/matchmaking/search`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/lobby/matchmaking/search-state`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/lobby/members`

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-lobby/v2/lobby/members/localMember/position-preferences`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/lobby/members/{summonerId}/grant-invite`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/lobby/members/{summonerId}/kick`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/lobby/members/{summonerId}/promote`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/lobby/members/{summonerId}/revoke-invite`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `PUT /lol-lobby/v2/lobby/partyType`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/matchmaking/quick-search`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/notifications`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/notifications`

**Responses**

- **204 No Content** — No content

---

### `DELETE /lol-lobby/v2/notifications/{notificationId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `notificationId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/parties/overrides/Enabled`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `enabled` | query | boolean | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-lobby/v2/parties/overrides/EnabledForTeamBuilderQueues`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `enabledForTeambuilderQueues` | query | boolean | yes |  |

**Responses**

- **204 No Content** — No content

---

### `GET /lol-lobby/v2/party-active`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/party/eog-status`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/party/{partyId}/join`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `partyId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/play-again`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/play-again-decline`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-lobby/v2/received-invitations`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-lobby/v2/received-invitations/{invitationId}/accept`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `invitationId` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---

### `POST /lol-lobby/v2/received-invitations/{invitationId}/decline`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `invitationId` | path | string | yes |  |

**Responses**

- **204 No Content** — No content

---
