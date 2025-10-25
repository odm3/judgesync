# JudgeSync Sharing Server Specification

This document distills the requirements from the **Judge Sync Design Document V2** into a concrete specification for the real‑time sharing service that synchronises judging data between devices.

## 1. Overview

The sharing service provides:

- **Session orchestration**: creation, joining, and lifecycle management of event judging sessions.
- **Role-aware data synchronisation**: Judge Advisor, Judge, Field Staff, Head Referee, Event Partner, and Guest permissions.
- **Realtime updates** for field notes, match schedules, skills, awards, and role changes.
- **Offline-resilient clients** that queue updates and reconcile once connected.

The service will be built as a Hono/Node application (consistent with the existing backend) exposing both REST endpoints and a WebSocket channel.

## 2. Entities

| Entity        | Description                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Session       | A unique 8-character alphanumeric code tied to an event SKU.                                        |
| Participant   | A device/user connected to a session. Persisted with device UUID and role.                          |
| Field Note    | Structured report from field staff with sentiment flag, priority, and resolution state.             |
| Match Update  | Broadcast updates for match schedules/results (future work).                                        |
| Sync Package  | Generic payload containing batched changes (e.g., rubric scores) queued while offline.              |

## 3. REST API

All responses are JSON. Errors return `{ "error": { "code": string, "message": string } }`.

### 3.1 Session Management

#### `POST /api/sessions`
Create a new session. Only a Judge Advisor should call this when starting a judging workflow.

Request:
```json
{
  "eventSku": "RE-V5RC-25-0790",
  "deviceId": "uuid-v4",
  "advisorName": "Oscar M"
}
```

Response:
```json
{
  "sessionId": "c7f1a0a4-...",
  "sessionCode": "25-0790A", // 8-char code generated server-side
  "roles": { "participantId": "uuid-v4", "role": "judge_advisor" }
}
```

#### `POST /api/sessions/:code/otp`
Generate a six-digit one-time passcode (OTP) tied to the requesting device. The OTP expires in 15 minutes.

Request:
```json
{
  "deviceId": "uuid-v4",
  "displayName": "Field Team 1",
  "requestedRole": "judge"
}
```

Response:
```json
{
  "otp": "834201",
  "expiresAt": 1730000000000
}
```

#### `POST /api/sessions/:code/approve`
Judge Advisor endpoint used to validate the OTP and attach the device to the session.

```json
{
  "otp": "834201",
  "advisorDeviceId": "uuid-v4"
}
```

Response:
```json
{
  "participant": { "id": "f3bd...", "deviceId": "uuid-joiner", "displayName": "Field Team 1", "role": "judge" },
  "session": { "sessionId": "c7f1a0a4-...", "sessionCode": "25-0790A", "participants": [...] }
}
```

#### `POST /api/sessions/:sessionId/participants/:participantId/role`
Judge Advisor-only endpoint to promote/demote participants.

#### `DELETE /api/sessions/:sessionId/participants/:participantId`
Remove a participant (device lost, revoked access).

#### `POST /api/sessions/:sessionId/heartbeat`
Idempotent ping used by devices to keep their connection active and surface presence in the Judge Advisor UI.

### 3.2 Field Notes

#### `POST /api/sessions/:sessionId/field-notes`
Create a new field note.

```json
{
  "participantId": "f3bd...",
  "division": "VRC HS",
  "fieldLocation": "Field 2",
  "matchIdentifier": "Q45",
  "teamsInvolved": "1234A",
  "issueSummary": "...",
  "priority": "urgent",
  "sentiment": "negative"
}
```

Broadcast to all devices in realtime.

#### `PATCH /api/sessions/:sessionId/field-notes/:noteId`
Mark resolved (`resolved: true/false`). JA only.

### 3.3 Sync Packages (placeholder for judging data)

Per design doc, rubric scores and inspection outcomes will be synchronised using batched packages:

- `POST /api/sessions/:sessionId/sync-packages` – upload queued changes.
- `GET /api/sessions/:sessionId/sync-packages?since=<timestamp>` – fetch new changes since last sync.

Payload structure will be standardised in a subsequent iteration (e.g., `{ "type": "rubric", "payload": {...} }`).

## 4. WebSocket Channel

`GET /ws?sessionCode=XXXX&deviceId=uuid&role=judge`

Events (JSON messages):

| Event                  | Payload                                               |
| ---------------------- | ----------------------------------------------------- |
| `session:state`        | Full snapshot (on join / periodic refresh)            |
| `participant:joined`   | `{ participantId, role, displayName }`                |
| `participant:left`     | `{ participantId }`                                   |
| `participant:role`     | `{ participantId, role }`                             |
| `field_note:created`   | `{ ...FieldNote }`                                    |
| `field_note:updated`   | `{ noteId, resolved }`                                |
| `sync:package`         | `{ packageId, type, payload }`                        |
| `session:closed`       | No payload. Client should return to SKU entry screen. |

Clients must ACK each message; unacknowledged payloads are resent when the device reconnects.

## 5. Persistence

- **Database**: PostgreSQL (or SQLite in development) with tables for sessions, participants, field notes, packages.
- Sessions include `sessionCode`, `eventSku`, timestamps, and a Judge Advisor participant pointer.
- Field notes store sentiment, priority, reporter metadata, and resolution info.

## 6. Security & Auth

- Device `deviceId` is generated client-side (UUID) and persists in IndexedDB.
- Session join requires a matching 8-character code. No passwords.
- Judge Advisor promotion requires the caller token to match the stored advisor participant ID.
- All API calls include `X-Session-Code` and `X-Device-Id` headers to support simple HMAC in a future iteration.

## 7. Offline Behaviour

- Clients queue field notes and sync packages while offline.
- On reconnection, queued items are POSTed to the REST endpoints; the WebSocket backlog is replayed from the last acknowledged message.
- Conflict resolution strategy: last write wins with a merge log surfaced in the Judge Advisor UI.

## 8. Error Handling

- `409 Conflict` for duplicate joins or role violations.
- `410 Gone` when a session has been closed.
- `429 Too Many Requests` if a device floods `heartbeat` or `field-notes`.

## 9. Next Steps (per design document)

- Implement secure session archival and export.
- Extend sync packages to cover rubric scoring, inspection, alliance selection.
- Add audit logging for all JA role changes.
- Integrate push notifications for urgent notes (on supported platforms).

This specification should guide the implementation of the sharing backend so the frontend can rely exclusively on the session context while maintaining a simple, role-aware real-time experience.
