# VantaHome Real 1.0 Architecture

```text
VantaHome mobile/tablet
  UI, onboarding, automation editing, household management, notifications
          |
          | authenticated local WSS / HTTPS
          v
Vanta Bridge
  command authority, durable queue, normalized registry, automations,
  events, local state, diagnostics, pairing, health and upgrades
          |
          | Home Assistant WebSocket API + service calls
          v
Home Assistant OS
  Matter controller, Zigbee, Z-Wave, Wi-Fi, MQTT, cameras
          |
          v
Physical home
```

Vanta Cloud is off the local control path. It owns accounts, household
membership, push delivery, secure remote relay, encrypted backup, subscriptions,
hub management, and optional AI.

## State boundaries

- **Identity:** stable Vanta ID plus integration and entity identifiers.
- **Configuration:** name, room assignment, design profile, and preferences.
- **Capabilities:** normalized driver-reported controls intersected with the
  Vanta design profile.
- **Live state:** validated, timestamped observations from the integration.

The current persisted Zustand store is being extracted behind focused contracts
in `src/store/contracts.ts`. Device state merge behavior already lives in
`src/store/deviceState.ts`; registry, household, automation, and preferences are
the remaining extractions. This compatibility-first sequence prevents UI churn.

## Runtime modes

`EXPO_PUBLIC_VANTA_MODE` is one of `demo`, `development`, `alpha`, or
`production`. Demo/development may use mock telemetry and direct MQTT for local
experiments. Alpha/production fail closed: no mock transport and no mobile MQTT.
Unpaired direct WebSockets are also development-only: TLS is not a pairing or
authorization mechanism. Release telemetry uses RLS-protected `device_state`
Postgres Changes and re-reads current, caller-visible state. Broadcast messages
are confined to the explicit demo/development path. Commands use the
authenticated `device-command` API; acceptance never implies physical confirmation.

Local caches are partitioned by authenticated account. Current household/room
permissions must be verified before cached data or automation runtimes become
available. Account changes stop subscriptions, queued commands and delayed
automation actions. Temporary membership revalidation preserves navigation;
fresh observations take precedence over older registry snapshots. Camera stream
and thumbnail URLs are excluded from persistent caches.

Inbound MQTT, WebSocket, and Supabase device events pass runtime schemas before
they enter application state. Immutable identity/configuration fields cannot be
changed by a state event. Public commands use explicit operations; the former
network-facing `Partial<Device>` patch operation has been removed.

## Command lifecycle target

```text
created -> authorized -> dispatched -> bridge accepted
        -> integration sent -> physical state observed -> confirmed
```

Terminal failures include rejected, expired, timed out, unavailable,
unsupported, permission denied, and partially completed. The current client is
still an interim transport and does not yet implement the full lifecycle.

### Implemented local delivery tracking

`deviceClient.subscribeCommandProgress`, `getCommandProgress`, and
`getCommandHistory` expose service-level progress for admitted commands:
`pending`, `sending`, `queued`, `retrying`, then `submitted`, `failed`,
`rejected`, `expired`, `timed_out`, or `cancelled`. Existing callers retain the
`{ commandId, queued }` send result; terminal initial-send failures reject.
Local authorization, confirmation cancellation, and invalid-envelope failures
before admission still reject without creating a history entry.

- `submitted` means the configured transport accepted delivery, not that the
  light changed. Uncorrelated device observations cannot confirm a command.
  A local timeout, conflict, or cancellation also cannot prove non-execution or
  retract an already delivered request. Timeout is not automatically retried.
- Temporary failures reuse the same secured intent for at most three retries
  after the initial attempt. Known permanent HTTP refusals and malformed
  acknowledgements stop retries. TTL, identity, and permission are checked
  around asynchronous delivery; queued expiry does not wait for backoff or
  another command's stalled retry.
- History is in-memory metadata only, capped at 200 entries, with no command
  payloads, nonces, idempotency keys, credentials, or raw transport errors.
  Old terminal entries may be evicted; active entries are never evicted to make
  room. This is not a persistent audit or an idempotency/replay authority.
- Session reset cancels local waits, clears history and retries, and invalidates
  late responses. Consumers must discard cached progress on `reset`. Intent and
  subscriber snapshots are isolated so a UI callback cannot mutate queued work.

### In-app command activity

A dismissible delivery notice opens the same read-only **Command activity**
dialog available in Settings. Fixed status/reason copy distinguishes retries,
submission, refusal, and uncertainty; it never labels submission as physical
success. Demo-capable runtimes label feedback as demo context, which is not
proof that no external transport ran. Dismissing a notice does not cancel a
command, and opening activity cannot retry or replay one. Active-command
dismissals survive intervening commands; a terminal outcome can show a new
notice, including a late failure from an older command.

The single subscription admits only new commands observed while the current
account/session/home/member scope is enabled. It deliberately does not rehydrate
pre-existing service history, whose metadata cannot establish ownership across
scopes with reused device IDs. Rows, notices, and counts use current device
visibility and names. Scope changes, access gates, and service resets hide old
activity; authentication and password-recovery screens cannot open it. Neither
payloads nor raw error text is rendered or persisted. The list inherits the
200-command history bound and preserves touch scrolling without bounce or
scroll chaining; the dialog adds no motion.

This is local delivery tracking, not a durable bridge queue or physical
confirmation implementation. Pre-admission failures remain caller errors, not
activity entries. Authoritative bridge completion and native/physical testing
remain required before real-home execution is claimed.

## Offline bridge protocol preparation

The isolated `bridge/` modules now define and simulate explicit one-light power
admission, registry identity, HA data normalization, and conservative lifecycle
transitions. They are not connected to the app or a network and do not implement
authentication, pairing, durable storage, or physical confirmation. Read the
[one-light contract](./BRIDGE_LIGHT_CONTRACT.md) before extending these pure
planning functions into a worker. In particular, `state_observed` is weaker
than physical confirmation, and a fake journal test is not crash-safety evidence.
