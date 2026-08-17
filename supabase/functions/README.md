# Supabase Edge Functions (Phase 2)

These functions sit alongside the PostgREST API. Room visibility and
action-level permissions are enforced by RLS and database authorization helpers.
Migration 008 adds per-member overrides. An explicit grant or denial takes
priority over the role default, except that owner access cannot be overridden.

## Functions

- `home-bootstrap` (POST)
  - Body: `{ "name": "My Home" }`
  - Atomically creates a home and inserts the owner into `home_members`.

- `device-command` (POST)
  - Accepts a typed, short-lived command envelope.
  - RLS derives the required permission from the device kind, action, and
    payload; callers cannot select their own permission.
- `device-state` and `device-state-batch`
  - Legacy client-write endpoints now return `403`.
  - Physical observations must be written by the trusted Vanta Bridge path.
- `home-invite` (POST)
- `home-invite-respond` (POST)
  - Calls the transactional `respond_home_invite` database function.
- `device-audit` (POST)
  - Resolves the exact device/home through caller-scoped RLS before using the
    service role to append an audit record.

## Voice (Phase 3)

- `voice-authorize` (GET/POST)
  - OAuth2 authorize endpoint with a minimal login form.
- `voice-token` (POST)
  - OAuth2 token endpoint (authorization_code + refresh_token); authorization
    codes are consumed in a row-locked transaction.
- `alexa-smart-home` (POST)
  - Alexa Smart Home fulfillment handler.
- `google-smart-home` (POST)
  - Google Smart Home fulfillment handler.

Voice discovery applies household scope, assigned-room scope, and effective
per-member action permissions, then exposes only lights, climate, TVs, fans,
and speakers. Fulfillment calls a service-role-only authorization transaction
to enqueue commands; it never writes observed device state directly.

## Deploy

```bash
supabase functions deploy home-bootstrap
supabase functions deploy device-command
supabase functions deploy device-state
supabase functions deploy device-state-batch
supabase functions deploy home-invite
```

## Auth

Pass the user JWT in `Authorization: Bearer <token>`.
RLS policies enforce access on homes, memberships, rooms, devices, state,
commands, and audit data. Room access never grants sensitive commands by itself.
