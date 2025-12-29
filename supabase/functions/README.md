# Supabase Edge Functions (Phase 2)

These functions sit alongside the PostgREST API and handle bootstrapping + state ingest.

## Functions

- `home-bootstrap` (POST)
  - Body: `{ "name": "My Home" }`
  - Creates a home and inserts the owner into `home_members`.

- `device-state` (POST/PUT)
  - Body: `{ "deviceId": "<uuid>", "state": { ... } }`
  - Merges the patch with existing `device_state` and upserts.

- `device-state-batch` (POST)
  - Body: `{ "events": [{ "deviceId": "<uuid>", "state": { ... } }] }`
  - Batch upsert for multiple devices.

## Voice (Phase 3)

- `voice-authorize` (GET/POST)
  - OAuth2 authorize endpoint with a minimal login form.
- `voice-token` (POST)
  - OAuth2 token endpoint (authorization_code + refresh_token).
- `alexa-smart-home` (POST)
  - Alexa Smart Home fulfillment handler.
- `google-smart-home` (POST)
  - Google Smart Home fulfillment handler.

## Deploy

```bash
supabase functions deploy home-bootstrap
supabase functions deploy device-state
supabase functions deploy device-state-batch
```

## Auth

Pass the user JWT in `Authorization: Bearer <token>`.
RLS policies enforce access on `homes`, `home_members`, `rooms`, `devices`, and `device_state`.
