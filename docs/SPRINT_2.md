# Sprint 2 — Security and Trust Boundary Closure

Status: **hosted core and voice API checks passed; browser, native, and external review pending**

The external review scope and non-binding vendor inquiry are prepared in
[Independent Security Review Brief](./SECURITY_REVIEW_BRIEF.md) and
[Independent Security Review Outreach](./SECURITY_REVIEW_OUTREACH.md). The
[Security Review Environment Runbook](./SECURITY_REVIEW_ENVIRONMENT.md)
defines the disposable-project isolation, synthetic authorization matrix,
reviewer handoff, and teardown procedure without provisioning resources early.

## Implemented

- Native Supabase sessions use Keychain/Keystore through Expo SecureStore.
  Generation-based UTF-8 chunks stay below native value limits, preserve
  legacy sessions until their next write, and commit atomically through a
  small manifest.
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
- Voice authorization separates document loads from the smaller password-attempt
  rate budget. Alexa accepts native directive credentials, omits sensitive
  request fields from responses, and validates brightness and temperature units.
- Alexa state reports require real per-property sample/confirmation timestamps;
  missing observations never become fabricated device values. Queue acceptance
  does not claim physical completion: Google reports `PENDING`, while Alexa
  reports an error until its supported completion flow is implemented.
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
- Historical baseline: migrations through 011 and every client-required Edge
  Function were deployed to the active Supabase project. A private rate-limit
  hashing secret was set, and the public readiness inventory passed while
  recognizing protected tables. This does not describe its current availability
  or deploy the later remediation baseline to that project.
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
  VantaHome tokens. Historical unauthenticated probes reached those handlers
  and were rejected with their expected `400`/`401` responses.
- Mobile authentication now uses one guarded native callback shared by social
  sign-in and password recovery. Recovery links establish a session only from
  the exact VantaHome callback and present a dedicated password replacement
  screen before household loading resumes. The sign-in UI reads GoTrue's public
  provider settings so disabled providers are not offered as broken actions.

## Current hosted verification

On 2026-09-14, reviewed source `d2cd8e9` was deployed to a separate, explicitly
authorized disposable Free environment, without Docker or changes to the
active app project or mobile configuration.

- Migrations 001–013 and all 11 matching Edge Functions were deployed. Gateway
  JWT settings matched `supabase/config.toml`; signed-in requests worked through
  the authenticated gateway without weakening verification.
- All 297 hosted SQL regression assertions passed over verified TLS. Fixtures
  rolled back, and application row counts matched before and after the suites.
- The core hosted harness passed 60 assertions, including fixture setup, across
  76 validation requests. Coverage included command authorization, replay
  rejection, household/room isolation, invitation responses, explicit denials,
  and immutable observations. Synthetic accounts and household data were removed
  and cleanup verified.
- Two bounded Auth/Realtime reruns passed identity/session refresh, account
  switching, authorized update delivery/refetch, and membership revocation
  checks. A removed guest's existing subscription received no further update
  while the owner's positive control did. An initial timeout did not reproduce;
  its cause remains unconfirmed. These are API/SDK checks, not native UI,
  reconnect, endurance, or physical-device verification.

### Voice follow-up

Reviewed source `42ab751` was subsequently deployed to the same isolated Free
environment. All four voice functions were redeployed because they share the
updated authentication modules; application configuration remained unchanged.

- Public voice handlers returned the expected `503` with trusted-proxy handling
  disabled. Subsequent bounded ingress diagnostics supported a separate,
  temporary staging-only proxy experiment; accepted public requests consumed
  the same hashed limiter bucket, while rejected spoofing challenges consumed
  none. The stricter topology assessment remained incomplete, and trust was
  restored to zero after testing. This is not a production proxy configuration.
- The first positive voice session stopped at the OAuth document's strict CSP
  boundary, before token exchange or fulfillment. Its fixtures were removed.
  API-only verification and browser account linking are separate gates; an HTTP
  `200` with form markup does not prove a usable, protected login page.
- A separate HTTP-only session passed 43 named API/security behavior checks over
  68 validation requests. Fourteen fixture-insertion labels and one successful
  document HTTP-response label are excluded from that behavior count. Coverage
  included code/client/redirect binding, expiration, single use, token rotation
  and replay rejection, household and permission isolation, scoped disconnect,
  native Alexa credentials and state reports, and honest queue-only responses.
- Synthetic observations remained unchanged by queued commands. Cleanup used
  32 requests and removed all synthetic accounts and household fixtures. Exact
  runtime revision transitions and JWT settings were checked; temporary trust
  returned to zero, and a final public request confirmed fail-closed `503`.
- Browser linking remains **blocked**: the hosted documents returned plain text
  with a replaced policy. The original strict document check was not relaxed;
  its failure is preserved separately from the passing HTTP-only results. No
  real provider account, native device, or physical command was tested.
- Local verification for that baseline passed: 456 tests across 53 suites, app and
  Edge TypeScript checks, release checks, web export, and the secret scan.

Detailed evidence and environment identifiers remain outside the public
repository. No real provider accounts, email delivery, or household hardware
were involved. These results do not authorize external reviewer access.

## Local-only browser-linking progress

An isolated static account-linking page and opt-in `voice-authorize?format=json`
mode are now implemented locally. They have **not been published or deployed**;
the hosted record for source `42ab751` above remains historical evidence for
that source and its tested paths, not verification of this new code.

- The standalone page uses the existing release icon and validates provider
  metadata before presenting credentials. It sends a password directly to the
  configured Supabase function, never through an added forwarding proxy.
- JSON mode is disabled unless `VOICE_LINKING_ORIGIN` names the exact approved
  HTTPS page origin. It rejects unapproved origins, constrains preflight, strips
  inherited wildcard CORS from failures, and retains the existing fail-closed
  client-IP checks and shared GET/POST rate budgets.
- Registered callbacks and opaque OAuth state remain exact. Both modes reject
  duplicate known query fields, and the browser verifies the complete returned
  callback before navigation. Existing HTML/form compatibility is preserved.
- A visibly labeled, Docker-free preview uses only local synthetic credentials
  and a loopback mock API. Its success, failure, and cancellation paths are not
  real Supabase authentication, provider linking, or physical-device evidence.
- A separate explicit build creates an ignored static artifact and required
  HTTP-header manifest. It is not included in the Expo build or automatically
  published through the root hosting configuration. No live environment or
  phone configuration is changed by these local commands.
- Local verification passed 689 tests across 57 suites, application and Edge
  TypeScript, dependency policy, release/asset/auth-redirect checks, and the
  production web export. Tracked-file and Git-history secret scans passed. The
  standalone bundle was built with a reserved example origin and the exact
  release icon; it was not published.
- Local browser checks passed synthetic success/cancellation handoffs, rejected
  credentials with password clearing/remasking, rate limits, service-unavailable
  retries, unexpected callback rejection, duplicate-parameter rejection, and
  literal display of HTML-shaped provider names. Phone portrait (including a
  320-pixel viewport) and tablet landscape screenshots were inspected without
  horizontal overflow. These browser checks use the simulated service only and
  do not change the hosted gate status.

See [Browser Account Linking](./VOICE_ACCOUNT_LINKING.md) for preview/build
commands, credential precautions, the API contract, and hosting approval gates.
The hosted browser, ingress trust, native, physical completion, and external
review gates remain open.

## Home-first preparation

The near-term objective is dependable personal-home use while preserving the
architecture for a later commercial product. [Home-First Pilot](./HOME_PILOT.md)
records the one-light readiness path, equipment unknowns, and separation of
disposable test data, personal household data, and future customer environments.
This does not waive review, enable hardware control, or complete Sprint 2.

The isolated linking page now has a local-only Cloudflare preparation command.
It packages the existing assets with native static security headers and keeps
configuration/readiness metadata outside the served directory. Generated
public/preview URLs, routing, and Worker logs are disabled by default; they do
not prove an existing account has no other routes or logs. Packaging tests and
CI use synthetic identifiers, never deployment credentials. No dependencies,
Docker images, domains, hosting plans, live settings, or phone configuration
changes are required for this preparation. Hosted header/logging verification,
account access, and target approval remain outstanding.

Local verification for this preparation: **741 tests across 58 suites**, app
and Edge Function TypeScript, the dependency/release checks, the production web
export, and both isolated linking package commands passed. The 52 new packaging
tests cover explicit targets, header rules, exact public assets, and rejection
of unexpected files, linked output files, and linked source paths. These are
local checks, not Cloudflare-runtime, hosted-browser, or physical-device proof.

## Local reliability follow-up — 2026-09-26

The expired `image-size` exception is closed: Expo's scoped Metro dependency
family now uses the compatible upstream 0.83.8 patch, which removes that
vulnerable parser. The dependency gate no longer accepts advisory exceptions;
see [Dependency Security](./DEPENDENCY_SECURITY.md) for compatibility evidence,
asset regression coverage, and override removal criteria. Expo and React Native
versions, release icons, and native configuration are unchanged.

Service-level command progress now distinguishes submission, queued retries,
refusal, expiry, exhaustion, and ambiguous timeout without claiming physical
completion. Local metadata history is bounded and cleared on session reset.
Transport waits and retry attempts are bounded; identity and current permission
are rechecked around asynchronous work. Regression tests exercise stalled and
late responses, concurrent commands, revoked visibility, duplicate IDs,
subscriber failures/mutation, and reset isolation. See the [implemented command
contract](./ARCHITECTURE.md#implemented-local-delivery-tracking).

Local verification passed **891 tests across 62 suites**, application and Edge
TypeScript, release/asset/auth-redirect checks, Expo dependency compatibility,
the production web export, and tracked-file/Git-history secret scans. Full and
production-only npm audits both reported zero vulnerabilities. All new command
tests use synthetic intent and mocked transports, not household hardware.

These are local, hardware-free changes. No new progress UI, backend deployment,
provider linking, device command, Docker container, phone configuration change,
or independent review is included. The external, hosted-browser, native, and
physical-completion gates remain open.

## Command activity interface follow-up — 2026-09-26

Admitted commands now have a dismissible delivery notice and a read-only
**Settings → Command activity** dialog. Submission is explicitly unconfirmed,
and demo-capable runtimes carry a demo label. Dismissal is not cancellation;
there is no retry/replay button. Late results, multiple dismissed retries,
current device visibility, account/home/member changes, recovery gates, and
history reset/eviction are covered by regression tests. The subscription does
not rehydrate unscoped service history or persist command details.

The dialog sizes to short content and scrolls longer histories within the
viewport. Local browser checks exercised control submission, notice opening,
dismissal, Settings reopening, keyboard focus/Escape, reduced-motion mode, and
bounded scrolling at phone and tablet sizes. The production-style demo preview
used blank backend configuration; these checks did not send household commands.
No Docker container, dependency install, or additional simulator was needed.
Energy and coffee utility headings also now stack above their status pills on
phones; tablet and camera layouts remain unchanged.

The browser work exposed a development-watcher mismatch after the Metro
security update. A version/source-hash-guarded compatibility adapter now
preserves Expo's watcher contract without restoring vulnerable packages. See
[Dependency Security](./DEPENDENCY_SECURITY.md#expo-development-watcher-compatibility).
Production export alone is not enough to validate development file watching.

Verification passed **995 tests across 66 suites**, application/Edge TypeScript,
release and asset checks, the production web export, Expo's compatibility check,
and both full and production-only zero-vulnerability audits. Browser checks used
390×844 and 320×568 phones plus 834×1194 and 1194×834 tablets. A restarted,
watch-enabled preview survived source changes and served a rebuilt bundle. The
demo flow had no browser errors; existing Expo AV/notification warnings remain.
These checks do not verify native VoiceOver, simulator rendering, or hardware.

This remains delivery feedback, not authoritative physical-device completion.
Native testing and the independent security-review gate remain open.

## Offline one-light bridge preparation — 2026-09-26

An isolated [one-light bridge reference model](./BRIDGE_LIGHT_CONTRACT.md) now
defines explicit on/off intent, stable registry binding, bounded replay records,
current-permission checks, and truthful service/observation outcomes. Synthetic
tests cover malformed discovery, renamed entities, conflicting retries, failed
journal commits, stale or assumed state, response ordering, and modeled
disconnect/restart without replay. Supporting Home Assistant state is named
`state_observed`, never physical confirmation.

Verification passed **1,309 tests across 69 suites**, including 314 new bridge
tests, application/Edge TypeScript, dependency/release/asset/auth-redirect checks,
and the production web export. The dependency audit reported no production
vulnerabilities. These checks used invented data and no household connections.

The model is not imported by the app and performs no network or storage IO.
Its test journal is in-memory, not a crash-safe implementation. A transactional
durable worker, authenticated adapter, secure pairing/storage, and actual
restart testing remain required before any device connection. No dependency,
Docker container, hardware purchase, existing feature, or Alexa setup changed.
Native verification, physical-device evidence, and independent review remain open.

## Remaining before the Sprint 2 gate

- Store future hub credentials, Home Assistant tokens, recovery material, and
  device keys in platform/hub secure storage when those flows are implemented.
- Perform an external security review before alpha.
- Establish the production ingress trust boundary before enabling permanent
  proxy trust; the bounded staging experiment is not production evidence.
- Approve and verify a browser-capable account-linking host, then test real
  provider linking. The shared Edge domain's HTML behavior does not satisfy
  that gate. Implement authoritative bridge observations and physical command
  completion before real Alexa execution.
- Rebuild and verify native sign-in/recovery, account isolation, background
  behavior, biometric prompts, and authorized realtime updates on physical devices.

The remote runner fails closed unless its target is explicitly confirmed as
disposable and differs from the active app project. It executes the real pgTAP
suite through a lightweight PostgreSQL client and does not require Docker.

## Gate

Automated checks provide evidence for the cases tested; they are not a general
security guarantee. Current staging evidence covers the recorded source and
tested paths only; it does not update the active project's deployed policies.
Browser/provider linking, physical completion, native verification, and the
independent security review remain required before alpha or physical integration.
