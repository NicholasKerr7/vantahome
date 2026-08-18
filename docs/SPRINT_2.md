# Sprint 2 — Security and Trust Boundary Closure

Status: **automated security gate passed; external review pending**

The external review scope and non-binding vendor inquiry are prepared in
[Independent Security Review Brief](./SECURITY_REVIEW_BRIEF.md) and
[Independent Security Review Outreach](./SECURITY_REVIEW_OUTREACH.md).

## Implemented

- Native Supabase sessions use Keychain/Keystore through Expo SecureStore.
- Action permissions distinguish ordinary controls from cameras, locks,
  garages/gates, stoves, safety devices, automations, and invitations.
- Local command authorization checks both room scope and action permission.
- Sensitive commands require biometric confirmation in alpha/production.
- Every outbound command receives a short-lived command ID, nonce, expiry, and
  idempotency key; expired retries are discarded.
- A durable `device_commands` schema derives required permission server-side,
  rejects replay keys, limits command lifetime, and adds an initial rate gate.
- Authenticated clients can no longer insert, update, or delete flexible
  `device_state` JSON. Legacy state-write functions return `403`.
- Invite acceptance/decline is a row-locked database transaction.
- Hardened Edge Functions use bounded runtime JSON validation.
- Device audit logging resolves the exact caller-visible device/home before
  performing its narrowly scoped service-role insert.
- A formal threat model and initial SQL permission tests were added.
- Migration 007 now upgrades the legacy migration-002 command queue safely;
  preserved legacy rows are expired rather than treated as trusted commands.
- Voice and bootstrap functions now use bounded shared request validation.
- Voice discovery respects room assignments and excludes locks, doors, gates,
  cameras, cooking devices, safety devices, and other high-risk categories.
- Voice fulfillment queues server-authorized commands and cannot write observed
  device state through the service role.
- OAuth authorization-code exchange is row-locked and atomic, and rendered
  linking fields are HTML-escaped. Voice tokens are provider-bound; refresh
  tokens have an absolute expiry and rotate on use.
- Command rate limits are enforced at actor, household, and device boundaries by
  a table trigger, including concurrent API and voice requests.
- Home bootstrap is an authenticated, serialized database transaction.
- Docker-free regression tests cover validation and migration guardrails.
- Camera registry/state reads require the explicit `camera.live` permission;
  camera screens reauthenticate on focus in alpha/production.
- Inviting/removing household members and changing assigned rooms requires local
  protected reauthentication in alpha/production. Owner invitations are not an
  available client action.
- Migration 008 adds explicit per-member permission grants and denials while
  keeping the canonical owner's access immutable. Role defaults remain the
  fallback when no override exists.
- Household managers can edit Role/Allow/Deny decisions in the profile UI;
  changes require protected reauthentication and roll back locally when the
  server rejects them.
- Effective overrides now govern local commands, device and camera visibility,
  database command/RLS checks, voice discovery and fulfillment, and household
  invitations. Privileged voice reads no longer bypass a member denial.
- Docker-free override tests cover grants, denials, owner invariants, cleanup,
  command rejection, visibility, migration policies, and privileged call paths.
- Migration 009 adds private, atomic Edge rate buckets keyed only by HMAC-hashed
  actor/client identities, with bounded opportunistic retention.
- Forwarded client addresses are ignored unless an explicit trusted-proxy hop
  count is configured. Public OAuth/voice endpoints fail closed without a
  verified client address; authenticated endpoints retain actor limits.
- Commands, audit writes, household mutations, OAuth, and Alexa/Google
  fulfillment now emit privacy-safe structured operational events with request
  IDs, outcomes, latency, region, and rate-limit state.
- Docker-free tests cover spoofed proxy chains, IP validation, deterministic
  hashing, private-schema/RPC privileges, atomic buckets, and fail-closed paths.
- Migration 010 makes household policy helpers non-recursive security-definer
  checks, pins their search path, disables nested RLS evaluation, and limits
  execution to authenticated callers.
- A rollback-only pgTAP integration suite now covers every app device category,
  every household role, assigned and foreign rooms/homes, camera visibility,
  immutable observed state, command envelopes, spoofed actors, and explicit
  per-member grants and denials.
- Migrations through 011 and every client-required Edge Function are deployed
  to the active Supabase project. A private rate-limit hashing secret is set,
  and the public readiness inventory passes while recognizing protected tables.
- Migrations 001 through 010 were applied from scratch to a data-less disposable
  Supabase project. The real PostgreSQL suites passed all 157 authorization
  matrix assertions and all 12 permission-derivation assertions, then rolled
  back their fixtures. The disposable project was deleted after the run.
- Migration 011 removes the final production database lint findings without
  widening function privileges. It and every earlier migration were applied
  from scratch on a second disposable project; database lint was clean and the
  same 169 pgTAP assertions passed before that project was deleted.
- Edge Function JWT enforcement is now explicit in `supabase/config.toml`.
  App APIs require a Supabase user JWT, while the OAuth and Alexa/Google
  endpoints authenticate their own client credentials or provider-bound
  VantaHome tokens. Live unauthenticated probes reach those handlers and are
  rejected with their expected `400`/`401` responses.
- Mobile authentication now uses one guarded native callback shared by social
  sign-in and password recovery. Recovery links establish a session only from
  the exact VantaHome callback and present a dedicated password replacement
  screen before household loading resumes. The sign-in UI reads GoTrue's public
  provider settings so disabled providers are not offered as broken actions.

## Remaining before the Sprint 2 gate

- Store future hub credentials, Home Assistant tokens, recovery material, and
  device keys in platform/hub secure storage when those flows are implemented.
- Perform an external security review before alpha.

The remote runner fails closed unless its target is explicitly confirmed as
disposable and differs from the active app project. It executes the real pgTAP
suite through a lightweight PostgreSQL client and does not require Docker.

## Gate

The automated gate passes: the disposable-project matrix proves that tested
roles cannot read, modify, or command an unauthorized household, room, device,
or capability. External security review remains required before alpha.
