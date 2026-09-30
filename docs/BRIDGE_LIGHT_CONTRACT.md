# One-light bridge contract

Status: **durable runtime foundation, verified with synthetic integration data;
not connected to the application or physical devices**. The pure planning modules
in `bridge/*.ts` remain free of I/O. `bridge/runtime/` adds an actual SQLite journal,
worker and explicit Home Assistant WebSocket adapter. Importing these modules
does not open a socket; constructing the journal explicitly opens local storage.
Mobile pairing, credential provisioning and a deployable hub service remain
unfinished. Existing screens, runtime modes and controls are unchanged.

## Runtime foundation — 2026-09-29

- `SqliteLightJournal` uses a private directory, validated immutable records,
  unique replay keys, schema/scope checks, FULL-synchronous WAL transactions and
  an OS-released SQLite ownership lock. A second process cannot recover another
  live worker's commands. Unknown schemas, corrupt rows, unsafe file permissions
  and failed commits stop the instance rather than reset the journal.
- `LightWorker` commits admission and dispatch before calling the adapter. It
  persists results and observations, periodically checks expiry/revocation, and
  returns actor-scoped receipts. Restart cancels reservations and marks any
  potentially dispatched work `outcome_unknown`; it never automatically resends.
- `HomeAssistantLightAdapter` implements the authenticated HA WebSocket protocol
  with verified TLS, bounded frames/requests/deadlines, one request-ID sequence,
  stable registry binding, acknowledged subscriptions and fresh snapshots.
  Rename/removal invalidates the session; reconnect must be explicit. It keeps
  raw error bodies and integration tokens out of the journal and receipts.
- Actual process-kill tests exercise committed and uncommitted SQLite recovery.
  Composition tests use the real journal, worker and adapter with a scripted
  in-process socket; they inspect committed dispatch through a second SQLite
  connection before allowing the synthetic socket write. No tests use HA, Hue,
  Supabase, Docker or household credentials.

Run on Node **22.22.3**, the verified development runtime:

```bash
npm run test:bridge
```

This compiles the isolated Node runtime and runs its Node test suites. It is also
part of `npm run verify`. The app/Jest build excludes this runtime and its emitted
`bridge-dist/` directory; mobile code never imports Node SQLite or HA credentials.
The shared explicit-power envelope lives in `src/domain/commandEnvelope.ts`.
Node 22's built-in SQLite API is still experimental; pin the tested runtime and
reverify it before selecting the deployed hub image. The
[Node SQLite documentation](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)
and [HA WebSocket protocol](https://developers.home-assistant.io/docs/api/websocket/)
describe those external boundaries.

This is a bounded one-light foundation: **32 retained commands, no automatic
eviction**, explicit on/off only, and no fleet or everyday-use claim. A reviewed
retention/archive policy is required before expanding it. Do not delete the
journal to recover from a failure or capacity limit. Database files are private
to the host account, not encrypted credential storage; they contain no tokens.
The adapter requires a configured `wss://…/api/websocket` endpoint with a valid
certificate and an explicit token-provider callback. It does not configure HA
TLS, read environment credentials, launch a listener, consume cloud commands,
pair a phone or enable the app's physical control path.

## Trust boundary

The host boundary must still authenticate the phone, pair the home/bridge, load the
trusted registry, and supply current action-level authorization. A supplied
`LightPrincipal`, callback, binding, or session ID is **not authentication**.
None of these may be copied from an untrusted command body. The callback in
tests is a synthetic policy seam, not a security implementation.

Home Assistant credentials belong in bridge secure storage, not the app. Only
an authenticated adapter session may supply discovery, service results, and
observations. The implemented adapter bounds incoming frame sizes, validates the
WebSocket message/subscription envelope, and assigns receipt times and increasing
revisions itself. The normalization functions alone do not authenticate raw objects.

## Explicit power contract

The first slice uses the existing command envelope: `deviceId`, `commandId`,
`nonce`, `idempotencyKey`, `createdAt`, `expiresAt`, `op: "toggle"`, and an
explicit boolean `on`. It rejects implicit toggles, extra authority fields,
arbitrary property writes, unsupported operations, and malformed identifiers.
The generated HA operation is `light.turn_on` or `light.turn_off`, never toggle.
Brightness/color are outside this model, not removed from the application.

Timestamps are explicit safe-integer milliseconds. Admission permits at most
30 seconds of command age, five seconds of future creation skew, and a 60-second
maximum lifetime. An expired command cannot dispatch. Missing timestamps never
receive a current-time fallback. Policy exceptions fail closed.

An exact authorized retry returns the existing record. Conflicting command IDs,
nonces, or idempotency keys are rejected, including changed actors or targets.
The model serializes active commands per bound light. Its 32-entry journal
capacity refuses new entries instead of evicting replay evidence. This deliberately
small, non-evicting model is not a production retention policy.

## Identity and capabilities

The trusted binding includes home, bridge, integration instance, Vanta device,
and HA entity-registry entry IDs. Discovery resolves the selected registry ID
to its current `entity_id`; names/addresses cannot silently adopt a different
device. Missing/disabled entries, malformed discovery, duplicate IDs, and
address collisions fail closed. The registry's separately retained IDs allow
an entity address to change without replacing its identity.
[HA entity registry implementation](https://github.com/home-assistant/core/blob/dev/homeassistant/helpers/entity_registry.py).

The pilot profile exposes power only for a valid HA light. A color-capable light
does not need to list `onoff` among its color modes; that value is exclusive, not
a required companion to richer modes. No brightness, color, or temperature
support is invented from a product name.
[HA light entity contract](https://developers.home-assistant.io/docs/core/entity/light/).

## Delivery and observation

```text
reserved → dispatching → service_completed → state_observed
```

| Outcome | Meaning in this reference model |
| --- | --- |
| `reserved` | An admission plan exists; no call has been sent. |
| `dispatching` | The plan crosses the send boundary; its effects may be unknown. |
| `service_completed` | HA reported service completion, not device confirmation. |
| `state_observed` | Fresh, matching, non-assumed HA state with supporting context was observed. |
| `expired`, `refused`, `unavailable` | This model stopped before dispatch. |
| `outcome_unknown` | Delivery may have occurred; automatic replay is unsafe. |

Service replies must match both authenticated session and request ID. A real
adapter must never reuse an ID within that session, including for subscriptions,
timed-out requests, and other service calls. The model additionally refuses IDs
already recorded in its retained same-session journal. It accepts successful
on/off results with omitted or null `response`; the current HA handler only
adds response data when requested.
[WebSocket protocol](https://developers.home-assistant.io/docs/api/websocket/),
[service handler](https://github.com/home-assistant/core/blob/dev/homeassistant/components/websocket_api/commands.py).

Observations preserve available, unknown, and unavailable separately. Unknown
state is never converted to off. They require explicit valid `last_updated`,
receipt time, positive revision, session, and full target binding. The decoder
allows five seconds of source timestamp skew; the lifecycle does not use a
future-dated frame as evidence. A control needs a known, available baseline
received within 30 seconds. After dispatch, newer revision and source-time
watermarks prevent stale matching frames from replacing contrary evidence.
Eligible higher-revision frames with unusable source chronology clear supporting
evidence; malformed frames or invalid receipt times are ignored.

State can arrive before or after the service result. Both are needed for
`state_observed`; wrong/absent context, stale frames, assumed state, unrelated
state changes, and wrong targets cannot advance that outcome. An already-at-target
light with no new report remains unverified rather than borrowing the baseline.
Deadline, policy loss, or disconnect after dispatch yields unknown effect. A
result arriving after a terminal outcome cannot revive it.

**`state_observed` is not physical confirmation or proof of causation.** HA
context can be reused or expire, and an integration may optimistically update
state. The normalizer preserves `assumed_state`; true means inferred rather than
read state. False/absent does not prove every integration reports hardware
faithfully. The real Hue path still needs independent observation and supervised
hardware evidence.
[Assumed-state definition](https://developers.home-assistant.io/docs/core/entity/#generic-properties),
[HA context implementation](https://github.com/home-assistant/core/blob/dev/homeassistant/helpers/entity.py).

## Implemented journal/worker ordering

1. Serialize admission and atomically reserve identity/replay records in durable
   bridge storage. A failed reservation must not send anything.
2. Re-resolve the light, check current authorization/capability/session, and
   commit dispatch intent before the network write. A failed commit must not send.
3. Persist results and observation evidence without command credentials or raw
   errors. Apply status transitions and replay retention atomically.
4. On restart, retain replay records but invalidate the old session and live
   snapshot. Work that may have been dispatched becomes outcome-unknown and is
   never automatically sent again. Reconnect starts a fresh authenticated
   session and fresh discovery/state subscription.

The original reference tests retain their in-memory journal. The separate
runtime suites now exercise real SQLite transactions and actual subprocess
termination/reopen, including the ambiguous post-dispatch-commit window. These
tests demonstrate process-crash recovery on the tested filesystem; they do not
prove power-loss behavior on future hub hardware or physical device completion.
Pure planning functions alone cannot enforce transaction discipline.
Do not connect the worker to a device until secure pairing/credential storage,
host provisioning and the applicable readiness prerequisites are implemented
and verified. The [private-pilot decision](./PRIVATE_PILOT_DECISION.md) defers
independent review only for its supervised one-bulb scope; technical readiness
and separate session approval are still required.

## Verification and next gates

Run `npm test -- --runInBand bridge` for deterministic invented-data tests.
Cases cover renamed/colliding discovery, strict parsing, action denial/revocation,
replay conflicts, capacity, commit failures, both response orderings, invalid
timestamps, stale/wrong-session evidence, assumed/unknown state, and modeled
disconnect/restart without replay. No test contacts HA, Alexa, Hue, or Supabase.

The next implementation boundary is authenticated local phone-to-hub pairing,
host-side credential provisioning and current action-level policy, followed by
the explicit 3D-node/device binding and mobile receipt path. Package the worker
as a supervised hub service with health, restart and storage recovery handling;
define journal retention before expanding beyond the bounded pilot.
An actual host/hardware choice and controlled-device approval remain required. Independent
review is deferred only under the private-pilot exception and remains mandatory
before public/customer use. Native follow-up must verify portrait-only phones,
both tablet orientations, sign-in/session isolation, background/reconnect
behavior, accessible delivery notices, and truthful unknown-state rendering.
Simulated results do not close any of those gates; see
[Home-First Pilot](./HOME_PILOT.md).
