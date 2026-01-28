# Release Checklist

Use this checklist before shipping a production build.

## P0 Blockers
- [ ] Replace demo camera URLs (`test-streams.mux.dev`, `picsum`) with real snapshot + stream endpoints.
- [ ] Decide on `demoMode` (remove or keep with clear UX) and verify auth gate.
- [ ] Remove/replace "stub" copy in Settings integrations + app version label.
- [ ] Lock down realtime transport (MQTT/Supabase/WS) for production and disable mock fallback.

## Auth & Security
- [ ] Configure OAuth providers (Google, Apple, etc.) in Supabase.
- [ ] Verify mobile redirect URIs (Expo + native).
- [ ] Confirm RLS policies for invites, room_members, and device audit logs.
- [ ] Add rate limits/abuse protection for public endpoints.
- [ ] Ensure no secrets committed; rotate keys if needed.

## Data & Realtime
- [ ] Confirm MQTT broker URL/TLS credentials and WS endpoints.
- [ ] Verify device state updates with real hardware.
- [ ] Confirm offline behavior (last seen + cached thumbnail).

## Observability
- [ ] Add crash reporting (Sentry/Crashlytics).
- [ ] Add basic analytics or feature flags if needed.
- [ ] Verify logs do not include secrets/PII.

## QA
- [ ] Run unit tests: `npm test`.
- [ ] Run smoke tests for key flows (Auth, Rooms, DeviceDetail, Automations, Cameras).
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
