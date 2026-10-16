# VantaHome implementation backlog

Maintained October 16, 2026. This is the current delivery queue, not a claim that
every undiscovered defect has been found. Start with [working context](WORKING_CONTEXT.md)
for current build/deployment evidence. Preserve the purple 3D-first design and
simulation-only staging scope. Recheck volatile external state before changing it.

## Latest delivery

| Work | State | Acceptance boundary |
| --- | --- | --- |
| Vanta home assistant | Preview 71 live answer and scene flow accepted | Two real staging answers independently verified (HTTP 200, 6.4/12.1 s); user confirmed a one-light 30% scene through Review, Create and explicit Run. Guest/negative live cases and broader quality/cost remain follow-up. No key expansion or new native build was needed. See handoff. |
| Actual card scrolling | Installed in Preview 69 | Supersedes rejected Preview 68 footer rails: cards themselves scroll horizontally with momentum; arrows move the same surface. No vertical page scrolling or gesture-triggered actions. See handoff for installation and physical acceptance. |
| Cleaner hotspot controls | Complete in Preview 67 | Decorative identity photos removed from quick/full hotspot headers; card artwork elsewhere remains. |
| Saved-device editing | Complete in Preview 66 source/staging | Rename, compatible room move and 3D reposition preserve device identity/settings. Revision conflicts and durable retries prevent stale overwrite or resurrection. See handoff for native/physical status. |
| Durable Add device and 3D placement | Complete in Preview 65 source/staging | Eight supported templates, furnished placement editor, authoritative registration/removal, restart-safe retry receipts, scoped runtime catalog. See handoff for native install and physical verification. |
| Smooth gate closing | Complete in Preview 64 source | Steady travel between one-second simulation samples; pause/interlock guards and covered-view synchronization. Native install status is in the handoff. |
| Official geography and directional weather | Complete in Preview 63 source | NLA frontage calibration, Owner-confirmed property weather pin, shared true-bearing wind/rain/plants, stable orbit compass. See handoff for map limits and install status. |
| Property compass, road markings and triangle cleanup | Complete in Preview 62 source | Original plan calibration superseded by Preview 63; unchanged property/camera placement; bounded compass, one road-paint mesh, 96 defective triangles removed. See handoff for installation and survey limits. |
| Account recovery and independent security access | Complete in Preview 61 source | Security remains reachable without a home; reviewed verified-email recovery; persistent credential completion; captured-token password mutation; home authority/runtime gate. See handoff for native installation and remaining physical/email checks. |
| Sent invitations | Complete in Preview 60 source/staging | Authorized household list, explicit pending/expired state, scoped cancellation, accept/reissue races, no implied account deletion or membership removal. See current handoff for native installation status. |
| Account sessions | Complete in Preview 60 source/staging | Private current-account inventory, deliberate other-session sign-out, exact token binding, truthful acknowledgement and token-expiry limits, native/web recovery. Physical interaction review remains separate. |
| Latest reliability audit | Complete in Preview 59 / `5ff96ad` | All 11 confirmed groups addressed; evidence in [deep rescan](DEEP_RELIABILITY_RESCAN.md). This does not replace an independent release review. |

## Most recent adjacent findings

The physical Send test exposed insufficient operational diagnostics: all provider
HTTP failures became the same unavailable outcome. Fixed, bounded categories now
distinguish quota, permission, model, request, service and transport failures without
retaining provider messages, questions or keys. Public errors remain compatible
with Preview 71. The user resolved the empty API balance privately; two live
`answered` operations now corroborate their success report. Availability still
only checks configuration presence. The user subsequently confirmed the one-light
scene through Review/Create/Run. Live scoped cases and broader scene quality remain
separate from this initial answer and scene acceptance.

The first physical AI connection check exposed a gap hidden by the ready-simulation
test fixture: signed-in accounts enable a transport setting with an empty endpoint,
which the assistant incorrectly treated as a configured live hub. The corrected
guard, endpoint-sensitive cancellation and actual local snapshot retry now have
real hook/client/session/persistence coverage. Generic HTTP 503 failures no longer
claim a missing key. Persistence write errors that retain unsaved in-memory edits
remain separate from read recovery; do not reset that data to make AI available.

The assistant review fixed imported scene settings expanding into unrelated editor
defaults, old tokens erasing newer reviews, pre-aborted promise rejections,
foreground availability recovery and compact keyboard/tap layout. Scope/Guest
expiry and delayed responses are covered. Local context uses current simulation
readings, not stale device registry power flags. This does not constitute an
independent security review or live-provider acceptance. See [assistant design](HOME_CONCIERGE.md).

The Preview 65 Add-device work replaces the previous local-only add path. Tests
cover uncertain saves, double submission, restart, stale account callbacks,
direct-table authority, revoked membership, removal and room binding. Standalone
TV geometry and its SQL footprint now agree. Preview 66 delivers
server-backed rename/reposition/move with optimistic revisions and exact retry
receipts. Additional fixture templates and exact furniture collision checks remain
follow-up opportunities. Household registry
placement persistence is delivered; shared simulation control-state sync remains
deferred. See the handoff for verified evidence, not a claim of exhaustive review.

Preview 66's bounded edit review also fixed missing-catalog crashes in open guest
controls, a browser-only import in the native bridge, stale edit callbacks crossing
household scope, pre-write cancellation locking the draft, removed-device recovery,
and duplicate inspector/removal keys. Tests preserve same-ID lamp, fan, AC, speaker,
TV and air-sensor settings across metadata edits and cold restart. Old-room guest
commands, including queued commands, fail after a move. Physical rename/move/reopen
acceptance is the remaining feature check; no shared control-state sync is implied.

The Preview 61 review closed recovery continuity after restart, mutable-session
password targeting, stale sign-out callbacks, overlapping credential tasks and
rapid background/resume session loading. Home admission now waits for all current
credential tasks and fresh membership; a cached or stale response cannot reopen it.
See the handoff for evidence and boundaries. No new schema or production changes.

The Preview 62 geometry pass preserved vertex/material/transform data and fixed
an export-order dependency: gas fixture preservation hashes must be established
after baseline triangle cleanup. Browser checks also caught and removed an initial
compass DOM-root teardown race. The final 21-capture sweep had no browser errors.

**Resolved in Preview 63 source:** compass and all wind/rain/plant renderers now
share an official-map true-north basis and meteorological "from" semantics.
Additional confirmed findings were fixed: main rain lacked time-dependent sideways
travel, and mixing finite-world and directional compass projections caused label
jumps at close zoom. Reduced motion, wind-path roof clearance, resource ownership,
native worklet isolation and per-household weather configuration were reviewed.
Official map alignment is not a certified survey; regional weather still cannot
represent every on-site gust. The Owner confirmed saving the official parcel pin.
See the handoff for build/install evidence and remaining physical review.

The Preview 64 manual-close report identified a confirmed presentation-cadence
mismatch: exponential easing made the gate surge at each one-second safety sample.
Constant-speed confirmed-sample animation resolves it. Adjacent rapid reversal,
pause/fault, partial target, obstruction reopening, reduced motion, scope revocation
and full-controls reveal were covered. Simulator/permission behavior is unchanged;
optional renderer labs were not changed because the report concerns the main scene.

## Next implementation priorities

Initial live assistant acceptance is complete: the user funded the API organization
privately, real authenticated answers pass, and one small scene passed Review scene,
Create and explicit Run scene on the iPhone. Follow up with scoped/negative live cases.
Record actual quality, latency and cost without treating two requests as a benchmark.
Do not treat the availability response as a provider health test. Never read or store the key in
chat, repository, screenshots or evidence. See the handoff for prepared tabs/state.

1. **Account lifecycle:** safe email changes, account deletion with ownership/data
   dependencies, ownership transfer, and optional whole-app biometric lock.
   Establish recent server-verified authentication for high-impact operations;
   sensitive-action local biometrics already exist and must not be confused with
   whole-app locking or server authorization.
   Dependencies confirmed in the current source: email changes require a dedicated
   account-bound PKCE intent and hosted dual-mailbox confirmation checks; refresh
   JWT email claims and invitation lists only after confirmation. Deleting an Auth
   owner currently cascades through `homes.owner_id` (`001_init.sql`), so ownership
   transfer and data-dependency review must precede any account-deletion endpoint.
   Whole-app locking needs one native gate for UI, runtimes and commands plus
   enrollment/storage recovery and real biometric tests; a visual overlay alone
   is insufficient. Do not reuse simulation-skipped action confirmation as a lock.
2. **Session revocation enforcement:** assess session-aware checks throughout the
   database/API authorization paths before promising immediate revocation.
   Supabase sign-out prevents future refresh; existing JWT access can last until
   expiry. Inventory can show only stored sign-ins, not online physical devices.
   Current own-session access must remain usable without granting household access.
3. **Performance:** finish controlled full-scene frame-rate and static-versus-tour
   energy measurements, then optimize measured bottlenecks. The earlier 100%-brightness
   whole-device estimate is not an app-only battery result. See
   [physical baseline](PHYSICAL_PERFORMANCE_BASELINE.md).
4. **Native release evidence:** smoke-test changed Preview paths, establish Android
   native/device coverage, and production signing/store build workflows. Complete
   an independent security review before public/customer release.

## Explicitly deferred

- **Further AI scope:** live provider activation is now the current authorized task
  above. Routine generation and autonomous operation remain deferred; current scope
  is comfort-scene drafting with explicit review. Routine proposals can follow after
  the live first slice is accepted.
- Hub pairing, real-device bindings/observations and durable app-closed routines:
  no hub yet; NUC 15 is the intended direction. Reuse the existing SQLite worker
  foundation rather than recreating it. Respect the supervised one-light pilot.
- Household scene/routine/profile sync. Current personal data and definitions
  remain local; generic peer identity is not completed profile sync.
- Physical iPad testing, at the user's request. Responsive browser evidence is
  still required for tablet portrait and landscape.

## Integration work after the foundations

- Remote push with tested closed-app delivery, preferences and quiet hours.
- Authenticated camera feed provisioning, expiry/revocation and real playback.
- Assistant commands confirmed by actual observed device state.
- Shared backup/restore and event retention design alongside household sync.

## Useful opportunities, not confirmed defects

- **Device Health:** one view for stale telemetry, low batteries, connectivity
  and maintenance. Never infer offline from a powered-off device or invent history.
- **Richer Routines:** open-for-duration and conditional branches in the canonical
  editor/executor, with restart/DST policy decided before durable hub execution.

## Discovery discipline

For each milestone, trace UI → service → authorization/storage → response → UI.
Check account changes, permission loss, stale callbacks, offline recovery,
concurrent edits, background/resume, malformed data and responsive accessibility
where relevant. Add a regression for each demonstrated correctness/security bug.
Move completed work out of the active queue with evidence, and retain a concise
next action for open work. Broader audit passes should have a defined scope;
passing tests never establishes that no further vulnerability exists.
