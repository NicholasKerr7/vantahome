# Authentication Redirects

Last verified: 2026-08-18

## Native callbacks

- Supabase user authentication and password recovery:
  `vantahome://auth-callback`
- VantaHome Alexa/Google account linking: `vantahome://voice-link`

`app.json` registers the `vantahome` scheme. The checked-in iOS project also
contains that scheme, and future generated Android projects inherit it from the
Expo configuration. Expo Go is not a supported OAuth test target because its
redirect is host-dependent; use a development or standalone build.

The active Supabase project redirect allowlist was inspected on 2026-08-18 and
contains `vantahome://auth-callback`. `npm run release:auth-redirect-check`
prevents the application, Expo config, and checked-in iOS scheme from drifting.

The voice callback is validated separately against each row in
`voice_oauth_clients.redirect_uris`. Voice linking remains disabled in Settings
until the corresponding public client ID is configured in the app environment.

## Recovery flow

Password reset emails explicitly use the auth callback instead of Supabase's
default Site URL. The app accepts only its own callback scheme/path, establishes
the recovery session from an authorization code or token pair, and presents a
dedicated password replacement screen before loading household data.

## Provider status

The sign-in screen reads the public GoTrue settings endpoint and displays only
providers that the active project advertises as enabled. At the last verification
Email and Google were enabled, while Apple was disabled. Enabling Apple still
requires Apple Developer credentials and corresponding Supabase configuration.
