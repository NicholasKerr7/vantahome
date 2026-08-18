# Release Checklist

Use this checklist before shipping a production build.

## P0 Blockers
- [ ] Replace demo camera URLs (`test-streams.mux.dev`, `picsum`) with real snapshot + stream endpoints.
- [x] Keep explicit demo mode with labeled seeded data; require Supabase auth in every other mode.
- [x] Replace Settings integration/version stubs with supported-scope and runtime-derived labels.
- [x] Lock down realtime transport (MQTT/Supabase/WS) for alpha/production and disable mock fallback.

## Auth & Security
- [x] Apply migrations through 011 and deploy every required Edge Function to
  the active project.
- [ ] Enable the remaining intended OAuth provider in Supabase (Google is
  enabled; Apple still requires Apple Developer credentials).
- [x] Verify mobile redirect URIs in Supabase, Expo config, and the checked-in
  iOS project; guard them with [Authentication Redirects](./AUTH_REDIRECTS.md).
- [x] Confirm RLS policies for invites, room_members, and device audit logs with
  the disposable-project pgTAP authorization matrix.
- [x] Add rate limits/abuse protection for public endpoints.
- [x] Scan tracked files and Git history for high-confidence secrets in CI;
  rotate credentials if a future scan detects exposure.
- [x] Resolve or formally accept the Expo/React Native transitive dependency
  advisories tracked in [Dependency Security Notes](./DEPENDENCY_SECURITY.md).

## Data & Realtime
- [ ] Confirm MQTT broker URL/TLS credentials and WS endpoints.
- [ ] Verify device state updates with real hardware.
- [x] Persist last-seen camera state and use OS-managed memory/disk caching for
  the latest thumbnail, with regression coverage for offline transitions.

## Observability
- [x] Add optional Sentry crash reporting configured by environment.
- [ ] Add basic analytics or feature flags if needed.
- [x] Keep runtime logs payload-free and scrub identity, request, household,
  breadcrumb, and message data from Sentry events before transmission.

## QA
- [x] Run TypeScript, Edge Function, and Jest verification in GitHub Actions.
- [x] Run unit tests: `npm test`.
- [x] Add smoke tests for key flows (Auth, Rooms, DeviceDetail, Automations, Cameras).
- [x] Validate tablet/phone layouts in portrait/landscape using the lightweight
  React Native Web release-QA matrix in [RESPONSIVE_QA.md](./RESPONSIVE_QA.md).

## Build & Release
- [x] Configure and automatically verify app version plus iOS/Android build
  numbers using [Release Versioning](./RELEASE_VERSIONING.md).
- [ ] Build release artifacts for iOS/Android.
- [x] Replace Expo placeholders and automatically validate app icons, splash,
  favicon, display name, and native iOS copies using
  [Release Assets](./RELEASE_ASSETS.md).
- [ ] Finalize store listing metadata, screenshots, app identifiers, and URLs.
- [ ] Generate privacy policy + terms, update URLs in stores.

## Post‑release
- [ ] Monitor crash rate and performance.
- [ ] Track invite acceptance and room access issues.
- [ ] Validate camera stream stability under real load.
