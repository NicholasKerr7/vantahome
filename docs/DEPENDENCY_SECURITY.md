# Dependency Security Notes

Last reviewed: 2026-08-17

## Current baseline

- `npm audit --omit=dev` reports no critical vulnerabilities.
- The remaining findings originate in three transitive Expo/React Native build
  dependencies: `image-size`, `postcss`, and `uuid`.
- npm currently reports no compatible fix for those dependency paths. Do not use
  `npm audit fix --force`; it proposes SDK-breaking package changes.

## Applied mitigations

- Removed the deprecated `sentry-expo` wrapper and use the Expo-compatible
  `@sentry/react-native` package and source-map uploader.
- Pinned Expo modules to the versions recommended for SDK 54.
- Kept `@react-native-voice/voice` 3.2.4 so its iOS exception handling remains
  intact, while overriding its obsolete build-time `@expo/config-plugins` 2.x
  dependency with the SDK 54 version. The voice plugin APIs used by the package
  are present in SDK 54, and `expo config` validates the resulting configuration.

Re-run `npm audit --omit=dev`, `npx expo install --check`, and `npm run verify`
when Expo publishes patched SDK dependencies. The release checklist remains open
until the remaining advisories are patched upstream or formally accepted for the
release threat model.
