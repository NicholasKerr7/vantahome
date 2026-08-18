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

## Edge abuse controls

Migration 009 creates atomic fixed-window rate buckets in the private schema.
The Edge runtime HMAC-hashes client IP and actor identities before calling the
service-role-only bucket function; raw addresses are neither stored nor logged.

Set both secrets before deploying the updated functions:

```bash
supabase secrets set RATE_LIMIT_HASH_SECRET="$(openssl rand -hex 32)"
supabase secrets set TRUSTED_PROXY_HOPS=1
```

`TRUSTED_PROXY_HOPS` must match the number of sanitizing proxies on the hosted
request path. Leave it unset/zero when that chain has not been verified; in
that mode forwarded headers are ignored. Authenticated endpoints still use an
actor bucket, while public voice OAuth and fulfillment endpoints fail closed
until a trusted client address can be resolved.

Current endpoint buckets:

- Device commands: 120/minute per actor and, when resolved, per IP.
- Device audit: 240/minute per actor/IP.
- Home bootstrap: 5/hour per actor/IP.
- Home invitations: 20/hour per actor/IP; responses: 30/hour.
- Voice authorization: 10 POSTs or 120 GETs per 15 minutes per IP.
- Voice tokens: 60/minute per IP.
- Alexa/Google fulfillment: 600/minute per linked actor/IP.

Every finalized protected request emits one JSON `edge_operation` event with a
request ID, endpoint, outcome, status, duration, region, and rate-limit state.
These fields are intended for Supabase Logs Explorer dashboards and alerts.
No token, email, raw IP, payload, or rate-limit hash is included.

Deploy in this order: apply migrations through 010, set the secrets, then deploy
the functions. Deploying the functions first intentionally produces `503` for
protected operations because rate-limit storage/configuration is unavailable.

## Remote database verification without Docker

Use only a disposable project. The tests create Auth and household fixtures
inside a transaction and roll them back, but they intentionally exercise real
RLS policies and security-definer functions.

```bash
export SUPABASE_DB_URL='postgresql://...'
export VANTAHOME_DISPOSABLE_DB_CONFIRMED=true
npm run test:db:remote
```

Apply migrations through 010 before running the suite. The runner fails closed
unless the disposable confirmation is explicit and the database project ref is
different from `EXPO_PUBLIC_SUPABASE_URL`.

Before or after a deployment, inventory the client-visible tables and Edge
Functions with the publishable app credentials. This command is read-only,
prints no keys, and exits unsuccessfully while required artifacts are missing:

```bash
npm run supabase:check
```

Protected tables may report `401` or `403` to this anonymous inventory; those
statuses prove that the route exists without weakening row access. A missing
route reports `404`. This inventory does not replace the pgTAP authorization
matrix or prove that private migration 009 objects exist. It is a safe
deployment completeness check.
