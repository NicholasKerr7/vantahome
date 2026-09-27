# 3D Home integration

3D Home is an optional, explicitly labeled simulation inside the existing
VantaHome app. The original dashboard, authentication, household permissions,
runtime mode policy, and device command services remain in place. Its 90 scene
devices are simulated; toggles, presets, the gate, irrigation, and automatic
exterior lighting do not control physical equipment.

## Build and run

Run these commands from the repository root:

```bash
npm ci
npm run web
```

The root lockfile covers the app and `@vantahome/home-scene` workspace. Install
runs the existing dependency patches and compiles the scene through `postinstall`.
The `start`, `web`, `build`, `ios`, and `android` scripts rebuild scene assets
before Expo starts; EAS builds also prepare them after dependency installation.
After editing scene code or models, rebuild explicitly with:

```bash
npm run build:home-scene
```

For a local demonstration without loading a developer's `.env` configuration:

```bash
EXPO_NO_DOTENV=1 EXPO_PUBLIC_VANTA_MODE=demo npm run web
```

This is a local demo command, not a release configuration. The integration does
not weaken the existing runtime or authentication policy.

For a local iOS simulation, use a disposable checkout and build the `vantahome`
scheme in Release with `EXPO_NO_DOTENV=1`, `EXPO_PUBLIC_VANTA_MODE=demo`, and
`SENTRY_DISABLE_AUTO_UPLOAD=true`. Pass the local `DEVELOPMENT_TEAM` through
build settings. With Xcode 27, also pass `IPHONEOS_DEPLOYMENT_TARGET=15.1` so
dependency targets use the app's supported minimum.

For Personal Team signing, use an untracked empty entitlements plist through
`CODE_SIGN_ENTITLEMENTS` for this simulation build; retain the production
push-notification entitlement. To preserve an installed VantaHome app, package
the preview with bundle ID `com.anonymous.vantahome.preview`, display name
`VantaHome Preview`, and URL schemes `vantahome-preview` and
`com.anonymous.vantahome.preview`. Restore these local identity changes after
packaging. Keep personal signing values and preview configuration out of the
committed production configuration.

The feature is enabled by default on this integration branch. Set
`EXPO_PUBLIC_ENABLE_3D_HOME=false` and restart/rebuild Expo to remove both its
dashboard entry and navigation route. This public build setting contains no
credentials. The original dashboard remains available when the feature is
enabled, while the 3D screen provides a dashboard return action, loading status,
and retry behavior.

## Editing the model

The scene's React/Three.js source lives in `packages/home-scene/src`. Its five
runtime GLBs are `exterior.glb`, `ground.glb`, `upper.glb`, `landscape.glb`, and
`gate.glb` in `packages/home-scene/public/models`.

The editable Blender master remains the separately delivered
`seaview-luxury-smart-home.blend`. It is not included in this repository or loaded
at runtime. Continue editing that master, export the affected GLBs, and rebuild
the scene. Export uncompressed GLBs with embedded textures; the build rejects assets that require extra decoders. Keep the established units, orientation, object names, and origins.
When moving interactive objects, update their hotspot positions and relevant
geometry in `house-manifest.json`, `device-geometry.json`, and site metadata as
needed. Preserve scene device IDs across visual changes; these are simulation
IDs and must never be inferred to be physical device IDs.

See the [scene workspace README](../packages/home-scene/README.md) for the editing
loop and generated output paths.

## Isolation and lifecycle

The browser host embeds `/home-scene/embedded.html` in an iframe with
`sandbox="allow-scripts"` only. Its opaque origin cannot read the host app's DOM,
storage, or authentication state. Readiness and simulation messages are accepted
only from the specific iframe. A validated simulation protocol exchanges known
scene device IDs, allowed control values, lighting preferences, and motion
preferences. It has no real device command channel, account payload, media URL,
or arbitrary storage access.

Native loads a bundled local HTML asset through Expo Asset and copies it to a
versioned cache path. JavaScript, CSS, and the five GLBs are embedded in that file;
the scene needs neither a localhost server nor a remote scene host. The WebView
does not share cookies or persistent DOM storage and restricts navigation and
file access. A narrow native broker fetches only the fixed public weather
endpoint; it does not accept arbitrary URLs, coordinates, credentials, or device
commands. The broker bounds request frequency, duration, and response size.

The host persists all 90 simulated device states, supported device settings,
day/night mode, and the reduced-motion preference in a separate versioned local
cache. Leaving the screen or backgrounding the app releases its graphics;
reopening restores these settings. Camera position, room selection, and open
control panels start from the default view. Brief native inactive states, such
as a system overlay, do not unload the scene. The standalone editing preview
retains its separate browser simulation preferences.

In demo mode, an unauthenticated local Owner with no account, active home, or
enabled realtime/MQTT transport shares **22 explicitly paired demo devices**
with the original dashboard. Controls changed in either view update the other.
The pairing registry is `src/features/three-d-home/demoDeviceMapping.ts`; it
requires the expected device kind and never guesses a match from a name or room.
The original drawing-room TV maps explicitly to the model's family-room TV;
the demo's washer and utility devices map to their furnished laundry and utility
placements. Devices without a curated pair remain independent. Camera arming
does not change camera power, opening controls retain consistent position/status,
and monitor readings remain samples rather than simulated power controls.

Every other context uses an isolated saved preview, scoped to the signed-in
account when present, or to the local preview otherwise. It neither reads nor
updates the household's device observations. Account, home, member, role, or
transport scope changes disconnect an open simulation bridge immediately;
reopening establishes the new scope. Account identifiers remain in host storage
keys and never enter the scene. Failed local saves show a notice, while current
in-memory edits remain usable. Ordered writes and acknowledged scene updates
preserve the latest edits during rapid sliders and quick close/reopen flows.

Weather uses the existing model's fixed Hopewell, Jamaica location and
`America/Jamaica` clock; it does not track the current user's location. Open-Meteo
conditions drive rain and wind visuals, while the local solar clock drives
day/night appearance. Automatic solar streetlights are visual simulation only.
When weather is unavailable, the scene reports that state and retains its local
daylight clock. These effects are not background hardware automations.

## Packaging and performance

`scripts/build-home-scene.mjs` generates both a normal web build and the
self-contained embedded document. It validates the closed asset inventory, GLB
structure, absence of external model resources, and size budgets. The generated
manifest records deterministic SHA-256 hashes and byte sizes. Generated outputs
are ignored by Git and rebuilt from committed source and the root lockfile.

The embedded document is approximately **27.4 MiB before transport compression**.
All five models are encoded in it to support native offline loading and the
browser's opaque-origin sandbox. This costs initial transfer, parsing, and peak
memory even when only one floor is visible. The standalone web build loads
separate model files for editing and inspection.

Measured rendering windows select reversible high, balanced, or economy quality.
High preserves the authored appearance at up to 1.65 DPR and 2048-pixel shadow
maps; lower tiers cap DPR at 1.25 or 1 and use 1024-pixel shadows. Sustained low
frame rate lowers a tier, while four healthy windows restore one. Repeated
healthy windows no longer trigger a permanent low-resolution fallback. Hidden
tabs and unsupported phone orientation still pause rendering; reduced motion
retains its existing behavior.

Physical iPad, iPhone, and Android profiling is required before promoting 3D Home
to the default experience or a release. Record cold/warm load time, peak memory,
frame rate while orbiting the full landscape, and sustained heat/battery use
with rain, irrigation, and device animations running. Then exercise
background/resume, GPU recovery, fast edits followed by reopening, and storage
failure notices. JavaScript exports, unit tests, and desktop browser rendering
do not establish physical-device GPU performance. Verify tablet landscape,
tablet portrait, mobile portrait, the desktop tablet preview, reduced motion,
and the absence of page-level vertical scrolling.

## Validation and future device connections

Run the repository checks and scene-specific tests with:

```bash
npm run verify
npm run build:home-scene
```

`verify` includes the root Jest suite, scene Vitest suite, and focused packaging
tests. Simulation checks cover explicit device mappings, protocol validation,
account/transport isolation, persistence, and delayed acknowledgements. The
shared-state checkpoint passed 1,411 Jest tests, 352 scene tests, and six packaging
tests. The integration browser check passed 28 assertions: five viewport sizes
without page scrolling, sandbox isolation, actual live weather, mobile
quick/full controls, landscape/night mode, four solar poles, reduced motion,
phone rotation, and return to dashboard. Twelve additional browser assertions
verified bidirectional dashboard/scene controls, rapid toggles, saved brightness,
unmapped blinds, lighting preferences, and a cold app reload. Neither browser
flow reported scene runtime exceptions. Desktop development scene readiness was
measured separately and does not establish a mobile loading-time target.

Web, iOS, and Android JavaScript/Hermes exports passed. These are bundle checks, not physical device runs. Physical-device GPU, memory, battery, and native WebView behavior remain unverified. Automated scene success is not evidence of hardware readiness.

On **2026-09-26**, the user confirmed that the local Safari demo opened during
the iPad/iPhone check and reported that everything looked and felt good so far.
The preview was exported from commit `dbc2eb4` with explicit demo mode. This is
a positive initial, user-reported browser check; individual test cases, device
models, OS versions, frame rates, memory use, and sustained heat/battery results
were not recorded. Native iOS WebView testing remains outstanding.

On **2026-09-27**, Xcode 27 completed a signed Release demo build and installed
`VantaHome Preview` alongside the existing app on an iPhone 16 Pro Max running
iOS 26.6.2. The six packaging tests passed; the offline scene and all five model
assets matched their manifest hashes. The built app passed strict signature
verification and contained the JavaScript bundle and offline scene. Its local
preview identity was restored to the original app identity in the source
checkout after packaging; signing overrides stayed local to the build.
The initial launch was rejected by iOS with a signing/trust message. The user
then trusted the developer profile and confirmed that the app opened; a
subsequent device-tool launch also succeeded. Native 3D interactions, state
restoration, and sustained performance still need physical-device validation.

A future real-device adapter must use authorized household/device selectors,
explicit scene-to-device mappings, and the existing `deviceClient` command path.
Render pending, failed, stale, and confirmed states from the command lifecycle
and authorized observations; do not treat animation or optimistic simulation
state as physical confirmation. Real sunset or irrigation automation belongs in
the approved automation/bridge architecture if it must execute while the app is
closed.

Live hardware readiness and the private pilot remain governed separately by
[HOME_PILOT.md](HOME_PILOT.md). This integration does not change that readiness
status or connect any of the 90 simulated devices to hardware.
