# VantaHome Product Constitution

This document governs VantaHome Real 1.0 work. Changes that conflict with it
require an explicit architecture decision.

## Product promises

1. **Protect the interface.** Preserve the premium mobile/tablet identity,
   dedicated device-detail experiences, rooms, cameras, notifications, audit
   history, automations, and household concepts. Infrastructure is rebuilt
   behind the interface; VantaHome is not reduced to a generic Home Assistant
   dashboard.
2. **Home Assistant is infrastructure.** It supplies integrations and acts as a
   Matter controller. VantaHome remains the product and brand.
3. **Local control is primary.** Local control and hub automations must survive
   internet loss. Cloud services provide identity, remote relay, push, encrypted
   backup, subscriptions, fleet management, and optional AI.
4. **The hub is authoritative.** Mobile clients edit and display; Vanta Bridge
   owns integration credentials, durable commands, normalized state, events,
   diagnostics, and automation execution.
5. **Never claim unobserved success.** An accepted transport message is not a
   physical confirmation. Sensitive devices must not display success until the
   integration reports the resulting physical state.
6. **Capabilities are intersected.** A Vanta design profile determines how a
   category looks. Driver-reported capabilities determine what the installed
   device can do. Only the intersection is shown.
7. **Security is action-level.** Room visibility alone never grants every
   operation. Commands become typed actions with authorization, expiry, nonce,
   idempotency, audit, and appropriate biometric confirmation.
8. **AI follows dependable infrastructure.** AI may explain structured events
   and later assist with actions; it does not precede command, safety, security,
   and automation reliability.

## 1.0 boundaries

VantaHome 1.0 targets Home Assistant OS on an approved x86 mini-PC with a Vanta
Bridge add-on. Initial writable domains are light, switch, climate, sensor,
binary sensor, and cover. Locks, garages, stoves, and alarms stay read-only or
excluded until sensitive-command gates pass.

Direct Matter commissioning, a Vanta Matter bridge, proprietary hub hardware,
a custom OS image, broad voice certification, autonomous AI actions, face
recognition, advanced energy optimization, and a marketplace are post-1.0.

## Release rule

No sprint advances merely because code exists. Its documented gate must pass in
tests and, where applicable, on physical hardware. The defining vertical slice
is one automatically discovered light whose real capabilities and physical
state remain truthful through app restart, hub restart, and internet loss.
