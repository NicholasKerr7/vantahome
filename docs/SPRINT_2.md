# Sprint 2 — Security and Trust Boundary Closure

Status: **in progress**

## Implemented in the first cut

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

## Remaining before the Sprint 2 gate

- Add per-member permission overrides and management UI.
- Apply shared payload validation to every voice and bootstrap Edge Function.
- Complete the service-role inventory, especially voice fulfillment paths.
- Add database integration tests for every role, room, device category, and
  unauthorized state/command mutation—not only pure permission-function tests.
- Add per-home, per-device, and IP-aware rate limiting with operational metrics.
- Require protected reauthentication for camera viewing and household-admin
  mutations, not only sensitive device commands.
- Store future hub credentials, Home Assistant tokens, recovery material, and
  device keys in platform/hub secure storage when those flows are implemented.
- Validate this migration against a disposable Supabase project and perform an
  external security review before alpha.

## Gate

The gate passes only when automated tests prove that no role can read, modify,
or command an unauthorized household, room, device, or capability. This first
cut materially narrows the trust boundary but does not claim that gate yet.
