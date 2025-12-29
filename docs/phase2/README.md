# Phase 2: Cloud API + Device Registry

This phase introduces a cloud registry for users, homes, rooms, and devices. Auth is handled by Supabase Auth (JWT), while the registry lives in Postgres with RLS policies.

## Auth model

- Use Supabase Auth for email/password, Google, Apple, etc.
- Client sends `Authorization: Bearer <access_token>` to the cloud API.
- API verifies JWT (Supabase public JWKS) and uses `auth.uid()` in Postgres.

## Database schema

- See `supabase/migrations/001_init.sql`.
- Tables: `homes`, `home_members`, `rooms`, `devices`, `device_state`.

## Suggested REST endpoints

### Homes

- `GET /v1/homes`
- `POST /v1/homes` `{ name }`
- `GET /v1/homes/:homeId`
- `PATCH /v1/homes/:homeId` `{ name }`

### Members

- `GET /v1/homes/:homeId/members`
- `POST /v1/homes/:homeId/members` `{ userId, role }`
- `PATCH /v1/homes/:homeId/members/:userId` `{ role }`
- `DELETE /v1/homes/:homeId/members/:userId`

### Rooms

- `GET /v1/homes/:homeId/rooms`
- `POST /v1/homes/:homeId/rooms` `{ name }`
- `PATCH /v1/rooms/:roomId` `{ name }`
- `DELETE /v1/rooms/:roomId`

### Devices

- `GET /v1/homes/:homeId/devices`
- `POST /v1/homes/:homeId/devices`
  - body: `{ name, kind, roomId?, metadata? }`
- `PATCH /v1/devices/:deviceId`
  - body: `{ name?, roomId?, metadata? }`
- `DELETE /v1/devices/:deviceId`

### Device state (last known)

- `GET /v1/devices/:deviceId/state`
- `PUT /v1/devices/:deviceId/state` `{ state }`
  - example: `{ "state": { "isOn": true, "brightness": 80 } }`

## Edge Functions (Supabase-only option)

We use Edge Functions for bootstrapping and state ingest:

- `POST /functions/v1/home-bootstrap`
- `POST /functions/v1/device-state`
- `POST /functions/v1/device-state-batch`

See `supabase/functions/README.md`.

## App wiring (current)

- After a successful auth flow, the app calls `home-bootstrap` to ensure a home exists.
- Settings → “Resync to cloud” batches the current local device state into `device_state`.

## State sync flow (cloud)

1. Local MQTT bridge (Phase 1) can mirror state into cloud via a lightweight ingest endpoint.
2. Cloud writes into `device_state` and optionally publishes realtime updates (Supabase broadcast, WS, or SSE).
3. App subscribes to cloud updates when remote.

## Device mapping fields (recommended)

Store in `devices.metadata`:

- `external_id`: HA entity ID (ex: `light.living_room`)
- `driver`: `home-assistant`, `mqtt`, etc.
- `capabilities`: list of traits (`brightness`, `temp`, `volume`)
- `model`, `vendor`

## OAuth2 for voice integrations

Phase 3 will introduce Alexa/Google account linking. We can:

- Use Supabase Auth as the identity store.
- Add a small OAuth2 server (Auth0/Cognito/custom) that issues tokens for voice platforms.
