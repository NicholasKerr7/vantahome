# Dependency Security Notes

Last reviewed: 2026-09-14

## Current baseline

- `npm audit --omit=dev` reports no critical or moderate concrete advisories.
- Patched overrides move PostCSS to 8.5.26 and the `xcode` build helper's UUID
  dependency to 11.1.1. Both versions clear their current advisories while the
  Expo SDK 54 dependency check, configuration, tests, and web export pass.
- Refreshed the compatible lockfile versions of `@xmldom/xmldom`,
  `baseline-browser-mapping`, `browserslist`, and `js-yaml` to their patched
  releases without changing the Expo or React Native major versions.
- The only concrete findings left are two high-severity denial-of-service
  advisories in Metro's transitive `image-size` 1.2.1 dependency. npm propagates
  those findings through many Expo/React Native packages, so its headline total
  is much larger than the two underlying advisories.
- Do not use `npm audit fix --force`; it proposes SDK-breaking package changes.

## Applied mitigations

- Removed the deprecated `sentry-expo` wrapper and use the Expo-compatible
  `@sentry/react-native` package and source-map uploader.
- Pinned Expo modules to the versions recommended for SDK 54.
- Kept `@react-native-voice/voice` 3.2.4 so its iOS exception handling remains
  intact, while overriding its obsolete build-time `@expo/config-plugins` 2.x
  dependency with the SDK 54 version. The voice plugin APIs used by the package
  are present in SDK 54, and `expo config` validates the resulting configuration.
- Added the optional `@lottiefiles/dotlottie-react` 0.13.5 peer required by
  `lottie-react-native` on web. The production Expo web export now completes.
- `npm run security:dependencies` fails on any new concrete production advisory
  and is part of `npm run verify` and CI. It allows only the two accepted
  `image-size` advisory URLs below; propagated npm entries are not allowlisted.
- CI also builds the production web export so optional web-runtime dependency
  drift cannot pass on type checks and native-focused tests alone.

## URI decoder compatibility patch

- Override `decode-uri-component` to 0.5.0, the patched release for
  [GHSA-vcc3-ghjq-m6fr](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr).
  The upstream implementation replaces recursive malformed-input decoding with
  a single-pass UTF-8 scanner; the decoder itself is not modified locally.
- React Navigation still consumes the CommonJS API of `query-string` 7.1.3.
  Pin that version and adapt its decoder import to the new ESM default export
  with `scripts/patch-query-string.js`. This is one import-line change; query
  parsing, navigation, and the patched decoder's algorithm stay intact.
- `npm install` and `npm ci` apply the patch through `postinstall`. The script
  requires the exact reviewed versions and source hashes, is idempotent, and
  refuses unknown upstream contents. The dependency security gate checks that
  the patch is present even if install lifecycle scripts were skipped. In that
  case run `npm run postinstall` before verification.
- Jest explicitly transforms only this additional ESM dependency, matching
  Metro's normal module handling. Regression tests exercise real query-string
  and React Navigation imports, round-trip query parameters, malformed UTF-8,
  and a small malformed-input sample in a time-limited child process.
- Reassess and remove the compatibility patch when React Navigation adopts a
  compatible query-string release with a patched decoder. Do not automatically
  repin its hashes after an upstream change; inspect the changed dependency and
  rerun the navigation tests and production web export first.

## Temporary image-size risk acceptance

- Advisories:
  [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
  and
  [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
- Upstream status: every published `image-size` version through 2.0.2 is affected
  and no patched version is available as of this review.
- VantaHome exposure: Metro invokes this dependency during development/builds
  against repository-controlled assets. It is not bundled as the app's camera
  or upload image parser, and production users cannot supply Metro build inputs.
- Decision: accept the build-environment availability risk temporarily; keep CI
  and developer builds restricted to reviewed repository assets.
- Review deadline: 2026-09-18, on any Expo/Metro update, or before alpha release,
  whichever comes first. Replace the acceptance as soon as a compatible patched
  `image-size` or Metro release exists.

Re-run `npm audit --omit=dev`, `npx expo install --check`, the web export, and
`npm run verify` whenever Expo publishes patched SDK dependencies.
