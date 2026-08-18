# Release Checklist

Use this checklist before shipping a production build.

## P0 Blockers
- [ ] Replace demo camera URLs (`test-streams.mux.dev`, `picsum`) with real snapshot + stream endpoints.
- [x] Keep explicit demo mode with labeled seeded data; require Supabase auth in every other mode.
- [x] Replace Settings integration/version stubs with supported-scope and runtime-derived labels.
- [x] Lock down realtime transport (MQTT/Supabase/WS) for alpha/production and disable mock fallback.

## Auth & Security
- [ ] Apply migrations through 010 and deploy every required Edge Function to the active project.
- [ ] Configure OAuth providers (Google, Apple, etc.) in Supabase.
- [ ] Verify mobile redirect URIs (Expo + native).
- [ ] Confirm RLS policies for invites, room_members, and device audit logs.
- [x] Add rate limits/abuse protection for public endpoints.
- [ ] Ensure no secrets committed; rotate keys if needed.
- [ ] Resolve or formally accept the Expo/React Native transitive dependency
  advisories tracked in [Dependency Security Notes](./DEPENDENCY_SECURITY.md).

## Data & Realtime
- [ ] Confirm MQTT broker URL/TLS credentials and WS endpoints.
- [ ] Verify device state updates with real hardware.
- [ ] Confirm offline behavior (last seen + cached thumbnail).

## Observability
- [x] Add optional Sentry crash reporting configured by environment.
- [ ] Add basic analytics or feature flags if needed.
- [ ] Verify logs do not include secrets/PII.

## QA
- [x] Run TypeScript, Edge Function, and Jest verification in GitHub Actions.
- [x] Run unit tests: `npm test`.
- [x] Add smoke tests for key flows (Auth, Rooms, DeviceDetail, Automations, Cameras).
- [ ] Validate tablet/phone layouts in portrait/landscape.

## Build & Release
- [ ] Configure app version + build numbers.
- [ ] Build release artifacts for iOS/Android.
- [ ] Validate app icons, splash, and store metadata.
- [ ] Generate privacy policy + terms, update URLs in stores.

## Post‑release
- [ ] Monitor crash rate and performance.
- [ ] Track invite acceptance and room access issues.
- [ ] Validate camera stream stability under real load.
