# Deep reliability rescan

Reviewed **October 13, 2026**, against application commit **d6e3cd4** (Preview 58).
This is a source and isolated-runtime audit. It records **11 additional finding
groups**; it does not implement their fixes or certify every possible state.
No hosted database, production service, device command, or installed app changed.

## Fix first

### 1. P1 — Restricted administrator can bypass delegated access through membership writes

The final database schema still permits direct authenticated membership INSERT,
role UPDATE, and DELETE paths that do not enforce the invitation flow's permission
checks or preserve Owner-imposed action restrictions. An Admin denied invitation,
camera, and light authority can use those paths to give another account access
that the Admin cannot delegate through the checked permission endpoint.

Confirmed in isolated PostgreSQL 17 after applying **all 21 migrations**, including
the later column grants. This is a direct authenticated API/table-policy issue;
the app does not expose arbitrary membership insertion or role promotion. No
Guest escalation, cross-home access, Owner escalation, or deployed-state exploit
is claimed. Do not attempt this against a live household to verify it.

Sources: [membership policies](../supabase/migrations/012_security_review_remediation.sql#L98),
[later column grants](../supabase/migrations/019_member_interior_layout.sql#L12),
[deadline update restriction](../supabase/migrations/020_guest_access_extension.sql#L3).

Correction: restrict generic membership writes and use checked operations for
invitation admission, role changes, removal, and renewal. Enforce the resulting
authority and preserve restrictions across replacement, not just within the
individual permission editor. Include direct authenticated-table regression tests.

### 2. P2 — An old membership response can undo a newer home or policy choice

The periodic [App refresh](../App.tsx#L104) checks user/session/lifecycle state,
but not a shared home-selection or permission revision. A request for home A can
finish after invitation admission to B and switch the app back to A. An earlier
policy response can also overwrite a newly confirmed denial in local state.

Both races reproduce with the real App lifecycle and membership snapshot installer.
Server authorization remains authoritative; this finding concerns wrong-home and
stale local policy presentation, with possible local-data reset on the reverse switch.

Correction: coordinate membership reads and mutations with a shared revision;
discard responses superseded by a newer home selection or confirmed policy change.

### 3. P2 — A rejected permission reset is displayed as successful

[Permission reset](../src/services/memberPermissions.ts#L34) checks DELETE errors
but does not verify that anything changed. After an Admin loses the relevant
authority, stale UI can request a reset; row-level security filters the DELETE
to zero rows without an error. The hook then removes the override locally while
the server retains it. Both the final SQL schema and real hook/service reproduce
this mismatch.

Correction: use an authorization-checking operation and verify its authoritative
result before publishing the new local permission. Distinguish an already-absent
override from a denied deletion.

## State, lifecycle, and recovery

### 4. P2 — A 3D edit can overwrite a newer device change

[SimulationSession](../src/features/three-d-home/simulationSession.ts#L149)
mistakes the current host state for the renderer's editing baseline. With delayed
WebView/iframe replies: change brightness to 44, turn the light off through another
control path, then change only its color in the still-stale renderer. The saved
result incorrectly turns it on again. Real bridge, session, and persistence reproduce
the problem; this concerns simulated state.

Correction: carry the actual sender revision/baseline or send only changed fields,
and preserve independent newer changes while reconciling queued edits.

### 5. P2 — A backgrounded gate simulation can continue without explicit Resume

The [safety clock](../src/features/three-d-home/useForegroundSafetyClock.ts#L25)
queues its pause asynchronously while [App](../App.tsx#L141) invalidates membership
and disconnects the same session. A direct active-to-background transition can
discard that pause. Reproduction: closing gate at 75%; background; verify access
on return; one second later it moves to 50% without Resume.

This uses the real lifecycle, ModelHomeSync, control client, session, and persistence.
It models the direct transition common on Android. Physical iPhone reproduction
is unverified; an intermediate iOS inactive event may allow the pause to complete.
There is no physical gate connection.

Correction: preserve the pause for the captured simulation scope before teardown,
or require an explicit resume when reconnecting interrupted movement, retaining
all authorization checks.

### 6. P2 — Nested corrupt routines can bypass the recovery screen

[Account cache validation](../src/store/useHomeStore.ts#L1771) checks collection
entries as objects but does not validate all nested fields. A valid envelope with
a routine whose `triggers` is null hydrates successfully; the
[visible routine selector](../src/store/routines.ts#L27) then throws. The intended
preserved-data recovery state is bypassed.

Correction: validate or safely migrate complete persisted routine/scene structures
before hydration and test malformed nested fields, not only the outer envelope.

### 7. P2 — Timezone cache refresh can miss a foreground scheduled minute

[The runtime](../src/services/flowRuntime.ts#L118) refreshes every 60 seconds using
a cache that is [fresh for 60 seconds after response completion](../src/services/sharedHomeWeatherSettings.ts#L41).
At the first refresh, a nonzero-latency initial response is still fresh, so the
request is skipped. The clock later becomes unavailable until the next refresh.

Reproduction: start at 00:00:55 UTC; first response takes one second; the 00:01:55
refresh reuses the cache; it expires at 00:01:56; the next request begins at
00:02:55 and completes at 00:03:05. A 00:02 routine never runs despite continuous
foreground execution. Another native route can expose this after the Home
renderer's 45-second retention ends and its independent refresh is removed.

Correction: align refresh with cache expiry, force the periodic verification, or
retain a last-verified timezone within the same authorized scope while refreshing.
Define missed-minute handling explicitly; do not introduce duplicate catch-up runs.

### 8. P2 — Camera status confuses power with connectivity; stopped cameras retain players

[Camera monitor](../src/screens/CamerasScreen.tsx#L89) derives Online from `isOn`.
A camera last seen 30 days ago with a saved on state still appears Online with Go
live enabled. After starting a feed, changing the device to off also leaves its
player mounted because [the render condition](../src/screens/CamerasScreen.tsx#L246)
checks the selected stream and URL but not current power. Two component diagnostics
reproduce these states. The [viewer](../src/screens/CameraViewerScreen.tsx#L60)
also conflates on and online.

Correction: distinguish power, report age, connection status, and actual playback;
release invalid players and present loading/error/stale states. Hardware feed
provisioning remains a separate integration requirement.

### 9. P2 — Some browser confirmations and failures remain invisible

[Integration unlink](../src/screens/IntegrationsScreen.tsx#L69) still relies on
native `Alert.alert` to run its confirmation callback. The installed
react-native-web implementation is an empty function, so the browser action cannot
complete. Remaining household, scene, and settings error paths also use this
native-only feedback pattern. The new shared sign-out/profile feedback fixes do
not cover these other paths.

Correction: use rendered, scoped confirmation/error surfaces consistently. Verify
the actual browser action, rather than manually invoking an Alert callback in tests.

### 10. P2 — Offline-demo favorites can overwrite unread saved favorites

[Favorites hydration](../src/features/three-d-home/deviceBrowserPreferences.ts#L60)
turns a failed read into an empty list and retains the settled load promise, so
calling load again never retries. Toggle is allowed in that error state. Saved
favorite A, one temporary read failure, then favorite B produces disk contents B
only. This applies to the explicit offline model, not authenticated household
favorite storage.

Correction: preserve unread bytes, allow a real reload, and merge edits only after
a valid baseline. Keep the error copy consistent with whether changes reach disk.

### 11. P3 — A failed activity dismissal cannot retry its unchanged write

[Activity journal flush](../src/features/activity/activityInboxJournal.ts#L175)
drops its pending bytes before a failed write. Repeating the same dismissal after
storage recovers does not retry it. The dismissed event reappears after restart;
a different later mutation can eventually save the current state. A storage warning
is visible, so this is a retry/recovery failure rather than silent success.

Correction: retain a dirty snapshot and provide a usable retry path even if the
requested state is unchanged.

## Useful work to recover selectively

The refreshed six remote heads and four original-checkout local heads contain no
newer app implementation. `ios-build-cleanup` remains the only divergent remote,
with the same 17 unique commits. Useful concepts still include:

- **Device Health:** one place for stale readings, battery, connection, and
  maintenance, using real observation age and current room permissions.
- **Notification controls:** category preferences and quiet hours, with explicit
  behavior for important alerts, when remote delivery is implemented.
- **Richer Routines:** open-for-duration and conditional branches, integrated into
  the existing editor and eventual hub executor. Avoid restoring a second Flow UI.

These are opportunities, not undiscovered working integrations. The old health
code conflates off and offline, and old analytics fabricates missing history;
neither should be merged wholesale. The durable SQLite light journal is already
in current source and should be reused when pairing the future hub.

## Evidence, limits, and next order

- Current source's [hosted Verify run](https://github.com/NicholasKerr7/vantahome/actions/runs/38358743083)
  completed successfully. Passing existing tests did not detect these new cases.
- Access audit: 11 existing lifecycle checks plus 2 race diagnostics, 2 hook/service
  diagnostics, and 13 SQL
  assertions against a private PostgreSQL 17 database with all migrations applied.
- Scene audit: 55 existing focused checks pass; two additional correctness tests
  fail at the expected stale-edit and background-gate assertions.
- Runtime audit: four diagnostics reproduce the cache, clock, favorites, and
  activity failures. Camera audit: four existing checks plus two new diagnostics.
  Some diagnostics deliberately assert the buggy behavior; their passes mean
  reproduced, not corrected. Installed web Alert source was executed separately.
- Exact reproducers/logs remain outside the repo in
  `/Users/nick007/Library/Caches/VantaHome/work/`: `deep-access-audit-*`,
  `deep-audit-delayed-bridge.*`, `deep-audit-gate-background.*`,
  `deep-audit-scene-focused.log`, `deep-runtime-audit-confirmed.*`,
  `deep-rescan-camera-diagnostic.*`, and `deep-rescan-web-alert-diagnostic.log`.
- Temporary repository diagnostics were removed; the isolated database was stopped
  and deleted. No fresh physical-device, live RLS, notification-delivery, thermal,
  battery, or full-scene FPS signoff is implied.

Prioritize **1**, then **2–7**, then **8–11**. Keep hub execution, household/profile
sync, remote alerts, real camera/assistant transport, complete account lifecycle,
and Android/iPad/release evidence in the separate product roadmap. The next stage
is corrective work and regression coverage for these findings, not another visual
redesign or renderer migration.
