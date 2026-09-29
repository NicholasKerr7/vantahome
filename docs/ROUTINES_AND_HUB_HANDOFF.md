# Routines and the future home hub

## What this release implements

- One Routines collection and editor for time schedules and event-driven flows.
  The editor uses When → Only if → Do, with optional advanced triggers/actions.
- Legacy `rules` and `flows` remain readable. Canonical IDs namespace their
  identity. Editing a rule atomically promotes it to a flow and retains its
  public ID; one normalized executor prevents duplicate execution.
- Scenes can span the whole home. Room filters only change browsing, not the
  set of selected devices. Last used records an invocation, not verified live
  state or a persistent home mode.
- The 3D full-control Routines entry opens the shared device-filtered collection
  for explicitly mapped offline demo devices. Unmapped model devices show a
  linking requirement. Generic preview schedule preferences remain in storage
  but are no longer offered as an executable schedule. Appliance timer settings
  remain device-specific simulation preferences.
- Integrations → Vanta Bridge → Prepare home hub explains the planned setup.
  It does not collect credentials, pair a hub, or activate another executor.

## Current execution boundary

The runtime in `src/services/flowRuntime.ts` executes while the app is active.
It stops on background, sign-out, or a household/session change. Delayed actions
and notifications are fenced to the initiating scope. Disabling or deleting a
routine cancels its remaining steps. Already submitted device commands cannot
be recalled by disabling a routine.

Time triggers use the phone's local clock with a 15-second tick. Missed times are
not replayed. Duplicate-minute markers are in memory for that runtime lifetime;
they are not durable exactly-once guarantees across relaunches. Multiple open
clients do not have an execution-owner election. This is a foreground preview,
not the always-on architecture described in `ARCHITECTURE.md`.

The Home Assistant light contract and lifecycle modules under `bridge/` are
offline adapters. There is no deployed pairing service or routine worker yet.
The shared `ROUTINE_EXECUTION` copy must remain truthful until that changes.

## Implement when a hub is available

1. Discover and securely pair a household-owned Vanta Bridge connected to Home
   Assistant. Scope the pairing to the authenticated home and actor; keep Home
   Assistant credentials on the hub, never in the model/scene bundle.
2. Import only authorized entities and their reported capabilities. Explicitly
   map each 3D device to a stable catalog identity. Model names and demo IDs are
   never evidence of a physical binding.
3. Validate each routine against those capabilities and the household timezone.
   Version the payload, acknowledge installation, and show unsupported steps.
   Saved demo preferences must never become enabled physical routines silently.
4. Establish one durable execution owner. Transfer only after the hub confirms
   the same revision, then disable the phone executor for that scope. Define
   reconnect, cancellation, DST, missed-trigger and duplicate-run policies.
5. Report hub health and last-run results separately from device confirmation.
   Test app closure, loss of internet, hub restart, device disconnection, access
   revocation and simultaneous clients before claiming always-on operation.

No preview screen should say a hub is connected or a physical action succeeded
solely because a routine was saved, enabled, or submitted.
