# VantaHome branch implementation audit

Reviewed October 11, 2026 against app source `54d5e8a2bae3e4fe5ec9062e7116e32a394c52ce`.

The current app contains four of the five other GitHub branches in its ancestry.
The remaining branch, `ios-build-cleanup`, contains 17 unique commits with useful
notification, device-health and automation work. Those features require selective
adaptation to the current permissions, device identities and design. Merging that
branch wholesale would also restore obsolete native configuration and device-state
behavior.

The first priorities are a truthful persistent notification inbox and a passing
hosted verification run. The main hardware gap is connecting the existing durable
bridge foundation to a securely paired hub and the app. Another renderer migration
does not address those requirements.

## Branch coverage

All six branch heads advertised by `origin` were fetched and compared using
ancestry, merge bases, commit differences, file differences and patch equivalence.
The checkout is not shallow. Counts below are pinned to the app source above;
the documentation commit containing this audit is not included.

| Remote branch | Head | Commits only in current app | Commits only in branch | Result |
| --- | --- | ---: | ---: | --- |
| `3d-home-integration` | `54d5e8a` | 0 | 0 | Current app |
| `main` | `2288008` | 133 | 0 | Ancestor |
| `sprint-one` | `005d5e9` | 132 | 0 | Ancestor |
| `sprint-two` | `e64db3e` | 69 | 0 | Ancestor |
| `test-binary-icon-update` | `2d527a3` | 136 | 0 | Ancestor |
| `ios-build-cleanup` | `30c484e` | 139 | 17 | Divergent from `9dd7903` |

The divergent branch changes 74 paths, with 10,355 insertions and 991 deletions.
None of its 17 commits is patch-equivalent to current app history. Ancestry alone
does not establish that a feature remains active; the relevant current routes,
services, data models and test assertions were also inspected.

The original `/Users/nick007/vantahome` checkout has four local branches. All are
ancestors of the active app; its local `3d-home-integration` at `0f6dbc5` is 65
commits behind. Both checkouts were clean at the start of this audit. No newer
local-only branch implementation was found. There were no open GitHub pull requests.

GitHub's actual default branch is **main**, verified with `ls-remote --symref`.
The active checkout's cached `origin/HEAD -> sprint-two` is stale. The current app
has not yet been promoted to the default branch; release convergence is a future
reviewed operation, not part of this audit.

## Useful work in the divergent branch

These are all 17 unique commits, not a sample. Branch code references below mean
the tree at `30c484e`; none was imported during this audit.

| Commit | Work | Disposition |
| --- | --- | --- |
| `1c9f7bc` | iOS build configuration | Superseded by current preview identity/signing workflow. Do not restore old bundle IDs, Pod warning suppression or skipped dependency preparation. |
| `2b4c312` | Laundry option labels | Old layout fix; preserve intent only if a current control still needs it. |
| `192e922` | Global scroll defaults | Current components handle scrolling explicitly. Avoid restoring global `defaultProps` mutation. |
| `9afdb1e` | Utility costs and button labels | Cost inputs are a later feature; old label helper is superseded. |
| `7f545c4` | Location-based utility rates | Optional. US-only presets do not fit this Jamaica property. |
| `46d0a35` | Persisted notification inbox | Recover the concept first, with household scope and permission-filtered events. |
| `d4e2e74` | Home-left-unsecured alerts | Useful after authoritative presence and device freshness exist. |
| `c4ee226` | Geofencing and notification preferences | Categories/quiet hours are useful with push. Geofencing is optional and needs consent and session-safe identity handling. |
| `1e9b1dc` | macOS Jest startup | Superseded tooling; do not overwrite current test configuration. |
| `cf1f17a` | Home/Away/Night security modes | Optional policy layer. Rebuild with authorized commands and observed results; old code directly changes entry/camera state. |
| `ad07a2f` | Device Health center | Useful before everyday hardware use. Derive health from actual connectivity, freshness and maintenance, not power state alone. |
| `6930e25` | Analytics charts | Useful after genuine telemetry exists. Exclude generated history used when observations are missing. |
| `a34ff97` | Expanded flow builder | Add selected capabilities to the existing Routines product; do not restore a separate Flow UI/runtime. |
| `0187382` | Remote push delivery | Valuable missing integration. Rebuild recipient authorization, installation ownership, session handling and delivery processing against current contracts. |
| `aac4ee8` | Feature tests | Useful scenarios; adapt assertions to current APIs and truthful state semantics. |
| `57f0867` | Household policies | Superseded by stronger current room/action/server policies. Do not restore old Guest device-kind allowlists. |
| `30c484e` | Pod path quoting | Historical troubleshooting reference; current native builds use a different verified workflow. |

### Notification recovery

Current [NotificationsScreen](../src/screens/NotificationsScreen.tsx) defines
sample AC, scene, routine and locked-door events at lines 64–94, appends them
unconditionally at line 199, and stores dismissed IDs only in component state at
lines 100–102. The screen is reachable through the current home workspace and
authenticated navigation. Replace those entries with scoped records and persist
read/dismissed state before describing the inbox as actual home activity.

Current [notification delivery](../src/services/notifications.ts) at lines 47–65
only schedules local OS notifications. The divergent branch adds Expo token
registration, inbox handling, preferences, dispatch batches and receipt handling
in `remotePush.ts`, `push-register`, `push-dispatch` and its push migration.

A selective port must use current request validation, recipient access checks,
installation ownership, account/home isolation, revocation handling and a reliable
receipt worker. Its migration numbered `007` must not be copied over the current
security migration history. Physical iOS/Android push delivery remains a separate
verification requirement. This audit does not deploy or enable push.

### Routine capabilities

Current [routine types](../src/store/useHomeStore.ts) at lines 392–415 and
[editor options](../src/screens/routines/routineEditorModel.ts) at lines 37–56
support time, device on/off, scene and individual presence triggers with basic
conditions/actions. The older expanded flow adds open/closed, household-presence,
open-for-duration and before-sunrise/after-sunset conditions, plus if/else actions.

Neither implementation supplies complete sunrise/sunset event triggers with
offsets or numeric temperature/lux/humidity threshold triggers. The current scene's
solar clock drives visuals and outdoor lights; it is not a general routine engine.
Port useful conditions into canonical Routines using the configured property
location/timezone and existing cancellation/access checks. Replace old generic
property patches with validated capability actions. Do not restore approximate
solar defaults or a second executor.

### Health and telemetry

The branch's `deviceHealth.ts` offers a useful consolidated view, but conflates
camera power-off with offline status. Its `analyticsHistory.ts` generates
synthetic history when data coverage is insufficient. Both need authoritative
observation and freshness contracts before use with hardware.

This matters in current physical-device screens too:
[DeviceDetailScreen](../src/screens/DeviceDetailScreen.tsx) defaults missing air
confidence to 92% at line 1625, constructs a flat historical series when history
is absent at lines 1649–1657, and derives a timestamp from it at lines 1668–1669.
Use explicit unknown/stale/no-history states instead. The current simulated 3D
route bypasses that legacy physical-device screen.

## Required integration work

| Area | Already implemented | Remaining implementation or evidence |
| --- | --- | --- |
| Hub foundation | SQLite journal, worker, authenticated Home Assistant adapter, replay/expiry/unknown-outcome logic | Secure phone pairing, host credentials and authorization, installable supervised service, health/recovery and reviewed journal retention |
| 3D physical controls | Scoped simulation, shared model controls, separate authorized physical control path | Stable real-device bindings; observed device state into the shared presentation; typed intents and truthful delivery receipts from the model |
| Command delivery | Mobile authorization and bounded server queue acceptance | A supported dispatcher/transport to hardware; no consumer of the cloud command queue was found in current source |
| Scenes and routines | Editable scenes and one canonical foreground executor; local account storage | Household definition sync/versioning, one durable hub execution owner, app-closed operation, missed-run/DST/restart policies |
| Notifications | Local OS notifications and UI | Truthful persistent inbox, hardened remote push and tested background delivery |
| Device health | Individual status/battery/filter fields | Consolidated health based on real connection/freshness data and maintenance needs |
| Cameras | Scoped/reauthenticated UI and playback of a supplied URL | Authenticated feed provisioning, expiry/revocation and verified camera-provider transport |
| Assistants | OAuth/linking and provider handlers | Real observed completion and provider end-to-end verification; current Google queues as PENDING and Alexa cannot report completion |
| Platform release | iPhone Preview builds, local checks and responsive browser evidence | Passing hosted verification, Android native/device evidence, sustained performance/energy checks, eventual iPad review, production signing/store/native build pipeline |

Implementation evidence:

- [Bridge contract](BRIDGE_LIGHT_CONTRACT.md) and
  [LightWorker](../bridge/runtime/lightWorker.ts), lines 18–31: supplied principals
  are not phone authentication; the runtime does not provide a pairing listener,
  credential provisioning or a cloud queue consumer.
- [Device command endpoint](../supabase/functions/device-command/index.ts),
  lines 113–145: persists a command and returns 202. Acceptance is not completion.
- [Device routing](../src/screens/DeviceDetailRoute.tsx), lines 19–32, and
  [simulation bindings](../src/features/three-d-home/simulationDeviceBindings.ts):
  real devices do not become physical twins merely by using a model ID.
- [Routine execution](../src/services/flowRuntime.ts), lines 16–17 and 91–113;
  [app lifecycle](../App.tsx), lines 58–60 and 89–101: foreground execution only.
  Scenes/rules/flows persist locally in [the store](../src/store/useHomeStore.ts),
  lines 2387–2455.
- [Camera viewer](../src/screens/CameraViewerScreen.tsx), lines 60–61 and 109–114,
  consumes `device.streamUrl`; that is not feed provisioning.
- [Google execution](../supabase/functions/google-smart-home/index.ts),
  lines 242–248, and [Alexa execution](../supabase/functions/alexa-smart-home/index.ts),
  lines 337–344, retain explicit incomplete-command outcomes.

The durable journal is **already implemented**. Older sprint/private-pilot text
describing only an in-memory model must not cause that work to be rebuilt.
Its current bounded capacity is 32 retained light commands without eviction;
that is a foundation for a narrow supervised test, not an everyday retention plan.

Preserve secure native sessions, room/action permissions, Guest expiry and
revocation, simulation isolation, editable scenes, canonical Routines, weather
configuration and the modern 3D UI. Existing model-simulation SQL guards must
remain in place during any physical-device integration. Filament, geofencing,
utility tariffs and new security-mode UI are optional development choices, not
prerequisites for finishing the core control path.

## Hosted verification finding

The latest app-source run,
[Verify for 54d5e8a](https://github.com/NicholasKerr7/vantahome/actions/runs/37897160410),
failed on October 9 at **Scan tracked files and history for secrets**. Subsequent
tests and web build steps were skipped. Local targeted test passes do not establish
a passing hosted build.

The flagged lines are synthetic sensitive-key test assignments in
`scripts/build-ios-preview.test.mjs` at lines 65 and 154 and their history entries.
Their test context was inspected and the same failure reproduced locally on
October 11 with `npm run security:secrets`. They are intentionally invalid fixture
values, not discovered credentials. Correct the narrow fixture/history handling
with regression coverage while retaining genuine secret detection, then require a
complete hosted run for the resulting source. Do not disable the scan to clear CI.

The current [workflow](../.github/workflows/verify.yml) verifies code and web exports;
it does not compile native iOS/Android releases.

## Delivery order

1. Fix the mock notification inbox and hosted verification failure. Keep existing
   auth/Guest behavior and the 3D UI intact.
2. Add scoped event persistence and household scene/routine definition sync;
   build the hub provisioning/pairing service around the existing runtime.
3. When a hub is available, bind one explicitly authorized real light and verify
   commands, observations, disconnect/restart and unknown outcomes end to end.
   Preserve the [private pilot scope](PRIVATE_PILOT_DECISION.md).
4. Establish durable hub routine execution and selectively add useful advanced
   conditions. Add remote alerts and consolidated device health using real events.
5. Complete supported device/camera/assistant integrations and cross-platform
   release checks. Independent review remains required for public/customer use.

The narrow owner-only light pilot does not require cloud push, cameras, voice,
geofencing or unattended routines. The intended everyday household product does
require reliable background behavior and the relevant integration evidence.

## Confidence and evidence boundaries

This covers all six current origin heads, all 17 divergent commits, local heads
in the two known checkouts, current source entrypoints and relevant test assertions.
It does not cover deleted branches, forks, unadvertised refs, other unknown
checkouts, or validate deployed services and hardware. No runtime feature was
merged or enabled. No app rebuild, new full test run or hardware test was performed
for this source audit; the secret scan was run and its failure recorded.

Detailed ref/file inventory is cached outside the repository at
`/Users/nick007/Library/Caches/VantaHome/work/branch-audit-2026-10-11.json`.
The local redacted scan result is `branch-audit-2026-10-11-secret-scan.log` in the
same directory. Refresh live branch and deployment state before implementation.
