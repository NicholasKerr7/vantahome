# Release Versioning

VantaHome keeps release identifiers in sync across JavaScript, Expo, and the
checked-in iOS project:

- `package.json` `version` and `app.json` `expo.version` are the user-facing
  semantic version.
- `app.json` `expo.ios.buildNumber` and the native iOS build number identify an
  individual App Store/TestFlight build.
- `app.json` `expo.android.versionCode` identifies an individual Play build.

Before a public release, update the semantic version everywhere it is checked.
For each replacement store build, increment the relevant platform build number.
Run `npm run release:version-check`; CI also runs this through `npm run verify`.

If EAS remote version management is enabled later, initialize it from these
committed values before enabling production auto-increment.
