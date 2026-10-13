# VantaHome implementation backlog

Maintained October 13, 2026. This is the current delivery queue, not a claim that
every undiscovered defect has been found. Start with [working context](WORKING_CONTEXT.md)
for current build/deployment evidence. Preserve the purple 3D-first design and
simulation-only staging scope. Recheck volatile external state before changing it.

## Latest delivery

| Work | State | Acceptance boundary |
| --- | --- | --- |
| Sent invitations | Complete in Preview 60 source/staging | Authorized household list, explicit pending/expired state, scoped cancellation, accept/reissue races, no implied account deletion or membership removal. See current handoff for native installation status. |
| Account sessions | Complete in Preview 60 source/staging | Private current-account inventory, deliberate other-session sign-out, exact token binding, truthful acknowledgement and token-expiry limits, native/web recovery. Physical interaction review remains separate. |
| Latest reliability audit | Complete in Preview 59 / `5ff96ad` | All 11 confirmed groups addressed; evidence in [deep rescan](DEEP_RELIABILITY_RESCAN.md). This does not replace an independent release review. |

## Next implementation priorities

1. **Account lifecycle:** safe email changes, account deletion with ownership/data
   dependencies, ownership transfer, and optional whole-app biometric lock.
   Establish recent server-verified authentication for high-impact operations;
   sensitive-action local biometrics already exist and must not be confused with
   whole-app locking or server authorization.
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
- **Security access without a home:** make session controls reachable during
  expired/removed membership without exposing home data. Current account menu and
  Profile routes sit behind the home gate; local sign-out remains available there.

## Discovery discipline

For each milestone, trace UI → service → authorization/storage → response → UI.
Check account changes, permission loss, stale callbacks, offline recovery,
concurrent edits, background/resume, malformed data and responsive accessibility
where relevant. Add a regression for each demonstrated correctness/security bug.
Move completed work out of the active queue with evidence, and retain a concise
next action for open work. Broader audit passes should have a defined scope;
passing tests never establishes that no further vulnerability exists.
