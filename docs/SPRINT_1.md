# Sprint 1 — Product Constitution and Architecture Extraction

Status: **in progress**

## Implemented in the first cut

- Product constitution and 1.0 scope are recorded.
- Current custom device screens and visual behavior are preserved.
- Demo, development, alpha, and production runtime policies are explicit.
- Alpha/production disable mock telemetry, mobile MQTT, and implicit optimistic
  confirmation.
- Public Expo MQTT credentials were removed from app configuration and docs.
- Inbound MQTT, WebSocket, and Supabase state events now pass runtime schemas.
- State events cannot rewrite device identity, kind, name, or room assignment.
- The public `Partial<Device>` command operation was removed. Existing screens
  use the narrower mutable-property compatibility command while dedicated typed
  commands continue to cover common controls.
- Device-state merge behavior was extracted from the legacy Zustand store and
  focused store contracts define the next extraction seams.
- Identity, configuration, driver capabilities, and live state now have separate
  normalized domain contracts and a compatibility adapter.
- The capability engine intersects Vanta design capabilities with optional
  driver-reported capability IDs.
- Matter documentation now correctly treats Home Assistant as a controller and
  HomeKit Bridge as the Apple Home export path.

## Remaining before the Sprint 1 gate

- Capture and approve mobile/tablet screenshot baselines and design tokens.
- Extract registry, household, automation, and preference implementations from
  the compatibility store (contracts exist; implementations remain together).
- Continue splitting `DeviceDetailScreen` orchestration into device modules.
- Replace the mutable-property compatibility command with dedicated typed
  actions for every supported capability before it becomes a production API.
- Add bridge registry schemas for identity, configuration, capabilities, and
  observations rather than accepting flat snapshots.

## Gate

The gate passes only when screenshot comparisons show no unintended redesign
and integration changes can be implemented through normalized contracts without
editing every device screen. This document does not claim that gate yet.
