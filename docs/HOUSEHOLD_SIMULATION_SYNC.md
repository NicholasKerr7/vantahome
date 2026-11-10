# Shared household simulation

November 9, 2026. Source implementation and Preview 108 are verified. Migration
**029 is deployed only to staging** `dcevusczjtmdpzrxpdou`; source parity, RPC/table
grants, private receipts/clocks and realtime publication pass. The published RPC also rejects anonymous requests with 401 / 42501. Existing
household, member, device and physical-state fingerprints were unchanged. Zero homes were
enabled by deployment. Production is unchanged; installation remains deferred.

## Product behavior

The Owner opens Account → Household (Profile → People) → Shared home → Review
sharing. The review identifies the canonical household, exact device count and
this phone's saved baseline. Enable sharing is a separate deliberate action.
Another phone cannot seed over an enabled household. A changed baseline requires
a fresh review. Each phone keeps one bounded original local backup before adopting
the shared state.

After enablement, foreground phones read shared simulated device states. Owner
visibility covers the whole household; Member, Guest and Tenant reads and writes
still follow current room/device/camera permissions. Exterior or furnished-layout
sharing grants no additional device information. Ordinary syncing stays quiet on
Home. Offline/conflict notices pause controls and offer Reconnect without replaying
failed commands or restarting the property renderer.

Only simulated device states are shared. Scene/routine/profile definitions,
favorites, rendering preferences and restoration receipts remain local. Running
a local scene can change permitted shared device states; saving a scene does not
run it. Real hardware, hub automation and background execution are not enabled.
Shared confirmation is not physical telemetry or a Device Health observation.

## Authority and recovery

- `householdSyncScope` captures the verified account/home, session epoch, current
  grants and explicit simulation bindings. One foreground coordinator owns the
  transport. Account, home, grant and visibility changes retire old callbacks.
- Initial verification gates cached commands. Enabled caches persist a shared
  authority latch: losing the connection or restarting cannot silently restore
  independent local writes. A verified never-shared home retains local behavior.
- Each request captures the current account token and has a bounded lifetime.
  Realtime INSERT/UPDATE events are hints for a fresh authorized read, plus a
  30-second foreground reconciliation. No raw event state is ingested. Explicit
  Reconnect replaces failed subscriptions and ignores late old-channel callbacks.
- The server checks a current stored first-party session and confirmed account,
  membership expiry, current registry identity and simulation-only binding on
  every request. Camera reads require camera access. Writes use each device kind's
  existing control permission, including sensitive opening and safety permissions.
- Per-device revisions provide atomic compare-and-swap. A mixed forbidden scene
  fails as a whole; unrelated newer device state is retained. Request digests stop
  replay after subsequent edits/removal. No global revision reveals private-room
  activity. Default replica identity exposes only an opaque deleted row identifier.
- A single server-verified gate lease belongs to the account/session/client that
  initiated motion. Only that holder advances valid one-second steps. A late or
  revoked lease pauses on reconciliation; no elapsed background time is replayed.
  A slightly early tick keeps the prior accepted state without an offline warning.
- Scene restoration eligibility is invalidated by revisions even if another phone
  changed a device and then restored its old value before this phone read it.
  Local saving waits for both the accepted shared mutation and disk write.

Implementation lives in `src/features/household-sync`, the existing simulation
persistence/session/control client, and migration 029. The capability-schema test
requires future console settings to be reflected in an additive server migration.
Never edit already deployed migration history to introduce future capabilities.

## Verification and remaining acceptance

Local evidence is in `/Users/nick007/Library/Caches/VantaHome/work`:

- `household-sync-integration-tests.log`: 1,030 tests in 93 suites covering host
  controls, scene execution/end,
  persistence, household UI, transport and two independent simulated clients.
- `household-sync-types.log`: application TypeScript.
- Initial full disposable PostgreSQL run: 29 migrations, 984 pgTAP assertions
  across 19 suites. The focused rerun in `household-sync-race-summary.log` includes
  101 shared-sync assertions and five real two-connection lock interleavings:
  both same-device orders, unrelated-device success, revocation before a pending
  Guest command, and competing enables preserving the first baseline.
- `household-sync-ui-browser.json`: 96 state/viewport combinations across eight
  profiles, including mobile, both tablet orientations, tiny screen and larger
  text, with keyboard review-before-enable, touch and reduced-motion checks.
- The unchanged packaged 3D asset must remain 32,332,144 bytes with SHA256
  `414e7e42b55884e6a143655b203b17f237a29063a9bb3794e1948c7a5c792c71`.

Preview 108 is built and verified: signature, staging identity, new native
feature markers, preserved artwork, unchanged scene and restored production
metadata. See `preview108-verification.json` and
`household-sync-preview108-verification.log`. It is not installed; last installed
is 104. The signing profile expires November 11 at 04:54:44 UTC, so reverify or
rebuild before later installation.

Next steps:

1. Staging's initial management SQL failure is **resolved**. `select 1` initially
   failed with HTTP 500 / SQLSTATE 28P01, while the database health check was
   unhealthy. One staging-only project restart restored ACTIVE_HEALTHY database
   health and successful queries without changing passwords or restoring data.
   The user reported no known prior password/restore change. Evidence:
   `household-sync-staging-recovery.log`.
2. Deployment and independent verification are complete. Evidence:
   `household-sync-staging-deployment.log`, `household-sync-staging-verification.log`
   and `household-sync-staging.json`. The prepared deployment helper is pinned to
   staging and refuses an unexpected migration baseline. This completed step does
   not replace signed-in two-device acceptance.
3. Install when the user requests it, after reverifying the signing profile.
   Enable from the actual Owner's reviewed phone. Test Guest → Owner changes on
   two signed-in devices, room-only visibility, a rejected door command, same-device
   conflict, network loss/reconnect and reopening. Local simulated-client tests
   do not replace this hosted acceptance.
4. Test one gate controller and a second observer: opening/closing, auto-close,
   holds, background pause and resumed connection. Retain the existing safety
   scenario/physical acceptance distinctions. iPad physical tests remain deferred.
