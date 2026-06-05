# lol-clash

*75 endpoint(s) · LCU client 8.24*

[← Back to index](README.md)

| Method | Path | Summary |
| --- | --- | --- |
| GET | `/lol-clash/v1/bracket/{bracketId}` |  |
| GET | `/lol-clash/v1/checkin-allowed` |  |
| GET | `/lol-clash/v1/enabled` |  |
| GET | `/lol-clash/v1/eogPlayerUpdate` |  |
| POST | `/lol-clash/v1/eogPlayerUpdate/acknowledge` |  |
| GET | `/lol-clash/v1/event/{uuid}` |  |
| POST | `/lol-clash/v1/events` |  |
| GET | `/lol-clash/v1/gameEnd` |  |
| POST | `/lol-clash/v1/gameEnd/acknowledge` |  |
| GET | `/lol-clash/v1/historyandwinners` |  |
| GET | `/lol-clash/v1/iconconfig` |  |
| GET | `/lol-clash/v1/invited-roster-ids` |  |
| GET | `/lol-clash/v1/notifications` |  |
| POST | `/lol-clash/v1/notifications/acknowledge` |  |
| GET | `/lol-clash/v1/ping` |  |
| GET | `/lol-clash/v1/player` |  |
| GET | `/lol-clash/v1/player/chat-rosters` |  |
| GET | `/lol-clash/v1/player/history` |  |
| GET | `/lol-clash/v1/playmode-restricted` |  |
| GET | `/lol-clash/v1/ready` |  |
| POST | `/lol-clash/v1/refresh` |  |
| GET | `/lol-clash/v1/rewards` |  |
| GET | `/lol-clash/v1/roster/{rosterId}` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/accept` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/cancel-withdraw` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/change-all-details` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/change-icon` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/change-name` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/change-short-name` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/decline` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/disband` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/invite` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/kick` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/leave` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/lockin` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/set-position` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/set-ticket` |  |
| GET | `/lol-clash/v1/roster/{rosterId}/stats` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/substitute/accept` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/substitute/decline` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/substitute/invite` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/substitute/reclaim` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/substitute/{summonerId}/revoke` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/ticket-offer/{summonerId}/accept` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/ticket-offer/{summonerId}/decline` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/ticket-offer/{summonerId}/offer` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/ticket-offer/{summonerId}/revoke` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/transfer-captain` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/unlockin` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/unwithdraw` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/update-logos` |  |
| POST | `/lol-clash/v1/roster/{rosterId}/withdraw` |  |
| GET | `/lol-clash/v1/scouting/champions` |  |
| GET | `/lol-clash/v1/scouting/matchhistory` |  |
| POST | `/lol-clash/v1/simple-state-flags/{id}/acknowledge` |  |
| GET | `/lol-clash/v1/thirdparty/team-data` |  |
| GET | `/lol-clash/v1/time` |  |
| GET | `/lol-clash/v1/tournament-state-info` |  |
| GET | `/lol-clash/v1/tournament-summary` |  |
| GET | `/lol-clash/v1/tournament/cancelled` |  |
| GET | `/lol-clash/v1/tournament/{tournamentId}` |  |
| POST | `/lol-clash/v1/tournament/{tournamentId}/create-roster` |  |
| GET | `/lol-clash/v1/tournament/{tournamentId}/player` |  |
| GET | `/lol-clash/v1/tournament/{tournamentId}/player-honor-restricted` |  |
| GET | `/lol-clash/v1/tournament/{tournamentId}/stateInfo` |  |
| GET | `/lol-clash/v1/tournament/{tournamentId}/winners` |  |
| GET | `/lol-clash/v1/tournamentIds` |  |
| POST | `/lol-clash/v1/update-logos` |  |
| GET | `/lol-clash/v1/visible` |  |
| DELETE | `/lol-clash/v1/voice` |  |
| POST | `/lol-clash/v1/voice` |  |
| DELETE | `/lol-clash/v1/voice-delay/{delaySeconds}` |  |
| POST | `/lol-clash/v1/voice-delay/{delaySeconds}` |  |
| GET | `/lol-clash/v1/voice-enabled` |  |
| GET | `/lol-clash/v2/playmode-restricted` |  |

---

### `GET /lol-clash/v1/bracket/{bracketId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `bracketId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/checkin-allowed`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/enabled`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/eogPlayerUpdate`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/eogPlayerUpdate/acknowledge`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/event/{uuid}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `uuid` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/events`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/gameEnd`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/gameEnd/acknowledge`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/historyandwinners`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/iconconfig`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/invited-roster-ids`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/notifications`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/notifications/acknowledge`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/ping`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/player`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/player/chat-rosters`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/player/history`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/playmode-restricted`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/ready`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/refresh`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/rewards`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/roster/{rosterId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/accept`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/cancel-withdraw`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/change-all-details`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/change-icon`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/change-name`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/change-short-name`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/decline`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/disband`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/invite`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/kick`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/leave`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/lockin`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/set-position`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/set-ticket`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/roster/{rosterId}/stats`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/substitute/accept`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/substitute/decline`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/substitute/invite`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/substitute/reclaim`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/substitute/{summonerId}/revoke`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/ticket-offer/{summonerId}/accept`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/ticket-offer/{summonerId}/decline`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/ticket-offer/{summonerId}/offer`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/ticket-offer/{summonerId}/revoke`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |
| `summonerId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/transfer-captain`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/unlockin`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/unwithdraw`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/update-logos`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/roster/{rosterId}/withdraw`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `rosterId` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/scouting/champions`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerIds` | query | integer[] | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/scouting/matchhistory`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `summonerIds` | query | integer[] | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/simple-state-flags/{id}/acknowledge`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/thirdparty/team-data`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/time`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/tournament-state-info`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/tournament-summary`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/tournament/cancelled`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/tournament/{tournamentId}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `tournamentId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/tournament/{tournamentId}/create-roster`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `tournamentId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/tournament/{tournamentId}/player`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `tournamentId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/tournament/{tournamentId}/player-honor-restricted`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `tournamentId` | path | integer (int64) |  |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/tournament/{tournamentId}/stateInfo`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `tournamentId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/tournament/{tournamentId}/winners`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `tournamentId` | path | integer (int64) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/tournamentIds`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/update-logos`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/visible`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-clash/v1/voice`

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/voice`

**Responses**

- **200 OK** — Successful response

---

### `DELETE /lol-clash/v1/voice-delay/{delaySeconds}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `delaySeconds` | path | number (double) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `POST /lol-clash/v1/voice-delay/{delaySeconds}`

**Parameters**

| Name | In | Type | Required | Description |
| --- | --- | --- | --- | --- |
| `delaySeconds` | path | number (double) | yes |  |

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v1/voice-enabled`

**Responses**

- **200 OK** — Successful response

---

### `GET /lol-clash/v2/playmode-restricted`

**Responses**

- **200 OK** — Successful response

---
