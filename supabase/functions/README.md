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
  - OAuth2 authorize endpoint with a legacy login form and an opt-in JSON mode
    for the isolated browser-linking page.
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

Google `EXECUTE` replies use `PENDING` after a successful enqueue and omit
post-execution state. Queue acceptance is not physical completion; `QUERY` still
returns observed state. This follows the provider's
[execution response contract](https://developers.home.google.com/cloud-to-cloud/intents/execute).

Account linking also needs a browser-capable HTTPS host: Supabase's shared
function domain rewrites HTML responses to plain text. An HTTP `200` containing
form markup does not establish a usable sign-in page. See the platform's
[HTML response limitation](https://supabase.com/docs/guides/functions/limits).
Do not enable a paid custom domain or publish a new login host without approval.
Confirmed execution and real account linking remain separate integration gates
from synthetic API authorization tests.

### Standalone browser linking

The local implementation adds `?format=json` to `voice-authorize` for an
isolated static page. It has not been deployed or published; the earlier hosted
voice API evidence does not verify this new mode. See
[Browser Account Linking](../../docs/VOICE_ACCOUNT_LINKING.md) for the synthetic
preview, explicit standalone build, API contract, and host approval checklist.

JSON mode requires an Edge-runtime `VOICE_LINKING_ORIGIN` equal to the exact
approved canonical HTTPS page origin, with no trailing slash, path, credentials,
query, or fragment. It is disabled when this setting is missing or invalid
(`503`); missing, `null`, and unapproved request origins are rejected (`403`).
Do not put this setting into the phone's `.env`, infer it from a request, use a
wildcard, or enable a local/HTTP production exception.

JSON GET returns validated public client metadata and the exact OAuth bindings.
JSON POST accepts only the supported bounded fields, rechecks the registered
canonical HTTPS callback, authenticates, and returns a server-built redirect
URL. Preflight permits only GET/POST and `Content-Type`; all JSON responses,
including rate-limit failures, remove wildcard CORS, use no-store and
`Vary: Origin`, and echo only the approved origin without credentialed CORS.

Without the JSON selector, the existing HTML GET/form POST mode remains
available. Both modes preserve opaque state, reject duplicate known OAuth query
fields, and share the same GET/POST IP-rate budgets. The JSON page does not
bypass missing trusted client-IP protection or authorize a deployment, domain
purchase, provider-console change, or real-device test.

### Alexa requests and observations

Alexa discovery authenticates `directive.payload.scope`; endpoint directives
authenticate `directive.endpoint.scope`. Each scope must contain a `BearerToken`
issued to an Alexa client. Header-only callers remain supported; malformed,
misplaced, or conflicting credentials are rejected. Synchronous responses include
only the endpoint ID, never the incoming bearer token or cookie.

Brightness is an integer from 0 to 100. Thermostat requests require an explicit
Celsius, Fahrenheit, or Kelvin scale; conversion precedes validation against
the command queue's 10–35°C range. Invalid values are rejected, not clamped.

`ReportState` returns `Alexa.StateReport` only when every advertised property has
a valid value and trustworthy timing information. The trusted integration must
write the following metadata with its observations in `device_state.state`:

```json
{
  "isOn": false,
  "brightness": 12,
  "observations": {
    "isOn": {
      "timeOfSample": "2026-09-14T12:00:00.000Z",
      "lastConfirmedAt": "2026-09-14T12:01:50.000Z"
    },
    "brightness": {
      "timeOfSample": "2026-09-14T11:59:00.000Z",
      "lastConfirmedAt": "2026-09-14T12:01:00.000Z"
    }
  }
}
```

`timeOfSample` is when that property changed on the device; `lastConfirmedAt` is
when the integration last confirmed its value. The integration must write each
value and its matching metadata atomically; changing a value must never retain
timing metadata from the previous value. Times must be valid UTC timestamps
with `timeOfSample <= lastConfirmedAt <= now`. Each property's uncertainty grows
with time since confirmation. Database `updated_at` is a receipt timestamp and
cannot replace device sample information. Missing, incomplete, or invalid
observations produce an error, including legacy rows without this metadata;
Google and mobile state fields keep their existing format. The authoritative
bridge writer and physical observation checks remain integration work.

Alexa control still queues authorized intent, then returns `Alexa.ErrorResponse`
with `INTERNAL_ERROR` because physical completion cannot yet be confirmed. It
does not return a successful `Response` or unsupported `DeferredResponse`.
Enqueue failures use a fixed message without downstream error details. A future
completion worker must honor command expiry, handle provider retries, and resolve
reported failures before physical Alexa execution can be enabled.

References: [Alexa account-linking tokens](https://developer.amazon.com/docs/alexaplus/account-linking/add-account-linking-logic-smart-home.html),
[state reports](https://developer.amazon.com/docs/alexaplus/device-apis/alexa-statereport.html),
[responses](https://developer.amazon.com/docs/alexaplus/device-apis/alexa-response.html),
and [property timing](https://developer.amazon.com/docs/alexaplus/device-apis/message-guide.html).

## Deploy

For internal verification, use an explicitly authorized disposable project whose
reference differs from the active app project. Do not rely on a previously linked
CLI target. Prepare a private, untracked, access-restricted Edge secrets file as
described below; never overwrite the application's `.env`.

With a CLI version supporting explicit project selection for database pushes:

```bash
: "${VANTAHOME_REVIEW_PROJECT_REF:?Set the confirmed disposable project reference}"
: "${VANTAHOME_REVIEW_EDGE_ENV:?Set the private Edge secrets file path}"

supabase db push --project-ref "$VANTAHOME_REVIEW_PROJECT_REF" --skip-vault --dry-run
supabase db push --project-ref "$VANTAHOME_REVIEW_PROJECT_REF" --skip-vault
supabase secrets set --project-ref "$VANTAHOME_REVIEW_PROJECT_REF" \
  --env-file "$VANTAHOME_REVIEW_EDGE_ENV"
supabase functions deploy --project-ref "$VANTAHOME_REVIEW_PROJECT_REF" --use-api
```

Review the dry-run migration list before applying it. `--use-api` bundles the
functions remotely without Docker. Do not add `--prune` or bypass the target
review with automatic confirmation. `--skip-vault` avoids importing local Vault
configuration into the disposable environment. Keep database credentials private
and TLS certificate verification enabled.

`supabase/config.toml` is the source of truth for gateway JWT verification.
Authenticated app APIs keep `verify_jwt = true`. The OAuth and Alexa/Google
endpoints use `verify_jwt = false` because they validate OAuth client
credentials or provider-bound VantaHome access tokens inside their handlers.
Do not replace these per-function settings with a global deploy flag.

## Auth

Pass the user JWT in `Authorization: Bearer <token>`.
RLS policies enforce access on homes, memberships, rooms, devices, state,
commands, and audit data. Room access never grants sensitive commands by itself.

## Edge abuse controls

Migration 009 creates atomic fixed-window rate buckets in the private schema.
The Edge runtime HMAC-hashes client IP and actor identities before calling the
service-role-only bucket function; raw addresses are neither stored nor logged.

Before deploying the updated functions, place both settings in the private
secrets file used above: a fresh environment-specific `RATE_LIMIT_HASH_SECRET`
(at least 32 random bytes, hex-encoded), and `TRUSTED_PROXY_HOPS=0` initially.
Do not reuse a secret from another environment or commit this file.

`TRUSTED_PROXY_HOPS` must match the number of sanitizing proxies on the hosted
request path. Leave it unset/zero when that chain has not been verified; in
that mode forwarded headers are ignored. Authenticated endpoints still use an
actor bucket, while public voice OAuth and fulfillment endpoints fail closed
until a trusted client address can be resolved. Use a nonzero value only after
verifying that callers cannot influence the selected address on the exact hosted
path; reverify after infrastructure changes. A rejected or incomplete diagnostic
does not justify enabling trust. Never copy a guessed value of `1` from an example.

Current endpoint buckets:

- Device commands: 120/minute per actor and, when resolved, per IP.
- Device audit: 240/minute per actor/IP.
- Home bootstrap: 5/hour per actor/IP.
- Home invitations: 20/hour per actor/IP; responses: 30/hour.
- Voice authorization: independent budgets of 10 POSTs and 120 GETs per 15
  minutes per IP (`voice-authorize.post` and `voice-authorize.get`). Loading the
  login page does not consume password attempts. Operational logs still use
  `voice-authorize` as the endpoint name.
- Voice tokens: 60/minute per IP.
- Alexa/Google fulfillment: 600/minute per linked actor/IP.

Every finalized protected request emits one JSON `edge_operation` event with a
request ID, endpoint, outcome, status, duration, region, and rate-limit state.
These fields are intended for Supabase Logs Explorer dashboards and alerts.
No token, email, raw IP, payload, or rate-limit hash is included.

Deploy in this order: apply migrations through 013, set the secrets, then deploy
the functions. Migration 012 must precede the matching invitation and Google
handlers; migration 013 publishes device observations for Realtime. Missing
abuse-control storage or configuration intentionally produces `503` for protected
operations.

## Remote database verification without Docker

Use only a disposable project. The tests create Auth and household fixtures
inside a transaction and roll them back, but they intentionally exercise real
RLS policies and security-definer functions.

```bash
export SUPABASE_DB_URL='postgresql://...'
export VANTAHOME_DISPOSABLE_DB_CONFIRMED=true
npm run test:db:remote
```

Apply migrations through 013 before running the suite. The runner fails closed
unless the disposable confirmation is explicit and the database project ref is
different from `EXPO_PUBLIC_SUPABASE_URL`. It connects with the lightweight
Node PostgreSQL client and does not start Docker.

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
deployment completeness check, not proof of authorized operations, Realtime
delivery, or working voice account linking.
