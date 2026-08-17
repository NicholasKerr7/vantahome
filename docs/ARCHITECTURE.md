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
