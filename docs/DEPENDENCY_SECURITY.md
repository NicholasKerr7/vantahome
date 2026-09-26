# Dependency Security Notes

Last reviewed: 2026-09-26

## Current baseline

- `npm audit --omit=dev` reports zero vulnerabilities at every severity. No
  production dependency advisory exceptions remain.
- Patched overrides move PostCSS to 8.5.26 and the `xcode` build helper's UUID
  dependency to 11.1.1. Both versions clear their current advisories while the
  Expo SDK 54 dependency check, configuration, tests, and web export pass.
- Refreshed the compatible lockfile versions of `@xmldom/xmldom`,
  `baseline-browser-mapping`, `browserslist`, and `js-yaml` to their patched
  releases without changing the Expo or React Native major versions.
- Metro's upstream 0.83.8 patch removes the vulnerable transitive `image-size`
  package and its unused `queue` dependency. The Expo SDK and React Native
  versions are unchanged; see the scoped compatibility override below.
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
- `npm run security:dependencies` fails on any production vulnerability and is
  part of `npm run verify` and CI. It also fails when the audit cannot finish or
  returns an invalid report; a missing audit is not a security pass. Propagated
  npm entries are not printed as duplicate concrete advisories.
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

## Metro image parser remediation

- Advisories:
  [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
  and
  [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
- Both advisories now identify `image-size` 2.0.3 as patched (updated September
  24). However, a bare override from 1.x to 2.x is not compatible with Metro
  0.83.3's synchronous filename API.
- Use the maintained [Metro 0.83.8 security
  patch](https://github.com/react/metro/releases/tag/v0.83.8) instead. Its
  [upstream parser change](https://github.com/react/metro/pull/1860) removes the
  vulnerable package, uses bounded parsers for Metro-supported formats, and
  reuses the asset bytes already read for hashing. No local parser fork is
  needed; Expo's development watcher contract needs the separate adapter below.
- Expo SDK 54's `@expo/metro` 54.2.0 wrapper still pins Metro 0.83.3. Scope the
  override to that wrapper and move all 14 of its Metro-family dependencies
  together to 0.83.8; `ob1` follows through Metro's own dependency graph. The
  installed and locked tree contains no old Metro-family or `image-size` copy.
  This stays on Metro's 0.83 patch line and preserves its Node >=20.19.4 floor.
- The lockfile changes only the Metro family and its required transitive
  dependencies. No Expo SDK or React Native major upgrade, `--force` repair,
  new direct dependency, or changes to the URI decoder patch are involved.
- Regression coverage exercises actual release icons through Metro's buffer
  and asynchronous file APIs, scaled/platform-specific assets, SVG dimensions,
  and empty/truncated/invalid images. Tiny malformed ICNS, JXL, HEIF, JPEG, and
  WebP samples run in a child process with a two-second deadline so an accidental
  parser regression cannot hang the test suite.
- The former September 18 risk-acceptance deadline is closed by remediation,
  not extended. The dependency gate no longer exempts either advisory.
- Remove or reassess the scoped overrides when Expo SDK 54 adopts a patched
  Metro family or before the next SDK upgrade. Review the whole resolved family,
  rerun `expo install --check`, asset/navigation regressions, full verification,
  and the production web export. A clean dependency audit does not replace the
  independent review or physical/native validation gates.

## Expo development watcher compatibility

- A live development-server check found an incompatibility that a one-shot
  export cannot reveal: Metro 0.83.8 emits grouped `changes` with a `rootDir`,
  while Expo SDK 54's CLI 54.0.27 still expects `eventsQueue`. Without an adapter,
  an observed file edit crashes Expo with `eventsQueue is not iterable`.
- `scripts/patch-expo-metro-watchers.js` adapts all four affected observers in
  the two reviewed CLI files. It converts added/modified/removed files and
  directories to the existing absolute-path event contract, preserves symlink
  metadata, and leaves filtering, callback signatures, throttling, and listener
  cleanup unchanged. File size is unavailable in the new event and remains
  explicitly `null`; these observers do not depend on it.
- The patch resolves the CLI actually used by Expo, requires CLI 54.0.27 and
  `metro-file-map` 0.83.8, and verifies exact original and patched source hashes.
  It checks both files before writing, is idempotent, and refuses unknown input
  or output. It does not change Metro's parser or restore vulnerable packages.
- `postinstall` applies this adapter separately from the unchanged query-string
  patch. `security:dependencies` checks both patches even when install lifecycle
  scripts were skipped. Run `npm run postinstall` before verification in that
  case, and restart any already-running development server to load the patch.
- Tests exercise the real patched observer functions with synthetic watcher
  events: TypeScript detection, specific/all-file changes, route generation,
  root-relative paths, add/change/delete, directory/symlink metadata, ignored
  dependency/declaration files, throttling, legacy events, and unsubscription.
  Unknown event shapes fail explicitly rather than discarding changes.
- Reassess and remove this adapter with the Metro overrides when Expo adopts
  the new watcher contract. Keep a file-edit/live-reload smoke check alongside
  asset regressions and production export validation for future bundler changes.

Re-run `npm audit --omit=dev`, `npx expo install --check`, the web export, and
`npm run verify` whenever Expo publishes patched SDK dependencies.
