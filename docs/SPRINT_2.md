# Sprint 2 — Security and Trust Boundary Closure

Status: **in progress**

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

## Remaining before the Sprint 2 gate

- Add database integration tests for every role, room, device category, and
  unauthorized state/command mutation—not only pure permission-function tests.
- Add trusted-proxy IP-aware rate limiting and operational metrics.
- Store future hub credentials, Home Assistant tokens, recovery material, and
  device keys in platform/hub secure storage when those flows are implemented.
- Validate this migration against a disposable Supabase project and perform an
  external security review before alpha.

The disposable-project and database-integration items intentionally remain
deferred while Docker is unavailable. Static migration guardrails are useful,
but they are not presented as equivalent to executing PostgreSQL/RLS tests.

## Gate

The gate passes only when automated tests prove that no role can read, modify,
or command an unauthorized household, room, device, or capability. This first
cut materially narrows the trust boundary but does not claim that gate yet.
