# 3D Home integration

3D Home is the main VantaHome interface after authentication. The old dashboard
and bottom tabs have been retired; authentication, household permissions,
runtime mode policy, and device command services remain in place. Its 92 scene
devices are simulated; toggles, presets, the gate, irrigation, and automatic
exterior lighting do not control physical equipment.

The home menu opens Scenes, Automations, Cameras, Notifications, room/device
management, Household, Settings, Integrations, command activity, and audit history.
The former feature screens retain their existing services and return to the same
home stack. The renderer comparison remains in Connections for explicitly enabled
demo/development builds. A native device library remains available if graphics fail.
The menu and new voice/integration panels fit on bounded pages; existing management
screens retain their internal scrolling for long forms and lists.

Tap-to-speak and typed commands control the same persisted simulation as touch.
Room/device power, brightness, Celsius AC temperature, and open/close position
commands are supported. Gas/monitor commands require their full inspectors.
Dictation is opt-in, stops on close/background/session changes, and has a typed
fallback. It is not a Siri shortcut or an always-listening wake-word integration.
All open simulation surfaces share local updates, including unmapped scene devices.

Integrations shows Alexa/Google authorization setup, planned Apple/Matter support,
and the unfinished Vanta Bridge path. An authorization callback records local
progress only; it does not verify a provider connection or physical execution.
See [Browser Account Linking](./VOICE_ACCOUNT_LINKING.md) for deployment boundaries.

Full device inspectors share a typed capability catalog with the native renderer
preview. Quick actions stay compact; Controls, Modes, Schedule, and Status expose
the advanced settings on fixed-height pages. Portrait uses a sheet and tablet
landscape uses a right drawer, with no vertical scrolling. Schedules and timers
are local preferences only. Media, remote, and camera buttons produce labeled
simulation outcomes. Independent light brightness, color, white temperature, and
steady effect previews update the corresponding fixture in the model.

Hotspot quick controls include the device's primary supported adjustment:
brightness, fan speed, Celsius target temperature, media volume, or opening
position. Every matching fixture uses the shared capability catalog, including
bedside lamps and repeated room AC units. Off-device adjustments retain power
state and explain that the value is kept while off. Short phones keep their
toggle and Full controls action; the slider remains in the full inspector.
Landscape tablets use their existing right inspector without a duplicate popup.
Full-control page capacity follows the available body space, including native
font scale; resized web pages retain the focused field and native enum pages
retain the selected option's position in the list.

Reset view restores the current room/property framing without resetting the
room, floor, device state or saved preferences. It ends cinematic playback and
clears orbit momentum. Reduced motion and immersive views use an immediate cut.

The LPG meter on the exterior service wall and kitchen gas-leak detector share
the same local scenario in the original demo, 3D Home, and native full controls.
The meter models a 12.5 kg demo supply with usage, remaining quantity, budget and
refill preferences. Detector tests, leak scenarios, silencing, and linked valve
closure are explicit simulation actions. Silencing does not clear a leak;
clearing a scenario never reopens the valve. Home lighting presets preserve gas
state. These devices do not monitor gas or operate physical equipment, and the
original command boundary rejects gas-device commands.

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

The public-DOM regression scripts `verify-control-polish.mjs` and
`verify-full-controls.mjs` in `packages/home-scene/scripts/` accept a standalone
scene URL. They cover quick/full parity, remembered off-state brightness,
repeated fixtures, responsive touch targets, modal paging and keyboard focus.
These browser checks do not substitute for physical-device verification.
The full-controls sweep isolates each device/viewport case in its own browser
session and waits for the visible scene to finish loading. It writes page
measurements and screenshots to a temporary evidence directory; set
`VANTA_QA_OUTPUT_DIR` to choose that directory explicitly. Keyboard editing and
saved brightness are checked by closing and reopening controls in one session.

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

The house graphics are enabled by default. Set `EXPO_PUBLIC_ENABLE_3D_HOME=false`
and restart/rebuild Expo to pause the graphics surface for recovery. The home menu,
device library, and feature routes remain available. This public build setting
contains no credentials. The house has loading, retry, save-error, and session
reconnection feedback; it is no longer an optional dashboard destination.

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

The host persists all 92 simulated device states, supported device settings,
day/night mode, and the reduced-motion preference in a separate versioned local
cache. Leaving the screen or backgrounding the app releases its graphics;
reopening restores these settings. Camera position, room selection, and open
control panels start from the default view. Brief native inactive states, such
as a system overlay, do not unload the scene. The standalone editing preview
retains its separate browser simulation preferences.

In demo mode, an unauthenticated local Owner with no account, active home, or
enabled realtime/MQTT transport shares **24 explicitly paired demo devices**
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

Web, iOS, and Android JavaScript/Hermes exports passed. These are bundle checks,
not physical device runs. Physical-device checks are recorded below; quantitative
GPU, memory, and battery measurements remain outstanding. Automated scene success
is not evidence of hardware readiness.

On **2026-09-26**, the user confirmed that the local Safari demo opened during
the iPad/iPhone check and reported that everything looked and felt good so far.
The preview was exported from commit `dbc2eb4` with explicit demo mode. This is
a positive initial, user-reported browser check; individual test cases, device
models, OS versions, frame rates, memory use, and sustained heat/battery results
were not recorded. Native iOS WebView testing was still outstanding at that point.

On **2026-09-27**, Xcode 27 completed a signed Release demo build and installed
`VantaHome Preview` alongside the existing app on an iPhone 16 Pro Max running
iOS 26.6.2. The six packaging tests passed; the offline scene and all five model
assets matched their manifest hashes. The built app passed strict signature
verification and contained the JavaScript bundle and offline scene. Its local
preview identity was restored to the original app identity in the source
checkout after packaging; signing overrides stayed local to the build.
The initial launch was rejected by iOS with a signing/trust message. The user
then trusted the developer profile and confirmed that the app opened; a
subsequent device-tool launch also succeeded.

In the same iPhone preview, the user then confirmed that 3D Home loaded, orbit
and pinch zoom responded, and the light, blinds, and gate controls worked.
Settings survived leaving and reopening 3D Home, and switching to another app
and back worked. A fresh device-tool launch succeeded and its captured console
contained no fatal or uncaught-error indicators during this check. These are
user-reported functional results, not measured frame rates or memory results.
Force-quit persistence, offline reopening, sustained heat/battery behavior, and
native iPad portrait/landscape testing remain outstanding.

Further inspection on the same iPhone confirmed a saved simulation snapshot
with all 90 device entries and the 27.4 MiB local scene cache. A 31.244-second
Time Profiler attachment recorded no potential hangs above 250 ms and no
hang-risk events. The trace did not establish the foreground screen or user
activity, and it excluded the separate WebView graphics process. This is an
initial native-host baseline, not a scene frame-rate, thermal, or battery pass.

The same trace showed sustained Reanimated-driven border rasterization. Source
review found that the dashboard orb's perpetual pulse updated its bordered,
shadowed view and continued while the dashboard was covered. Preview build 2
moves animation to a plain wrapper and cancels the pulse and prompt timer when
the screen is hidden, the app is inactive, or reduced motion is enabled. A live
accessibility subscription handles preference changes without restarting the app.
Fourteen component/screen tests, ten navigation tests, root TypeScript, the
native Release build, and strict signature verification passed. Build 2 was
installed and launched; its 90-device saved snapshot matched the pre-update
snapshot exactly. A comparable post-change native profile is still required to
measure the performance benefit.

The full-restart/offline and three-minute interaction checks for build 2 are
awaiting user results; iPad testing is deferred at the user's request.

On **2026-09-30**, Release preview **build 28** was rebuilt from `80a45bc`,
installed over build 27, and launched on the iPhone 16 Pro Max. It includes the
quick adjustments, Reset view, adaptive control pages, quiet routine demo
delivery notices, and distinct demo navigation keys. The scene assets were
regenerated before the native build. All 16 packaging tests passed, the signed
app passed strict verification, and its three bundled scene documents matched
the generated assets; the house scene and five model hashes matched the manifest.
The saved simulation snapshot containing 92 devices was byte-for-byte identical
before the update and after installation and launch. The original VantaHome app
remained installed, production identity files were restored, and the launched
preview process was still running at the follow-up check. Physical touch flows,
sustained performance, and iPad behavior were not retested in this build pass.

A future real-device adapter must use authorized household/device selectors,
explicit scene-to-device mappings, and the existing `deviceClient` command path.
Render pending, failed, stale, and confirmed states from the command lifecycle
and authorized observations; do not treat animation or optimistic simulation
state as physical confirmation. Real sunset or irrigation automation belongs in
the approved automation/bridge architecture if it must execute while the app is
closed.

Live hardware readiness and the private pilot remain governed separately by
[HOME_PILOT.md](HOME_PILOT.md). This integration does not change that readiness
status or connect any of the 92 simulated devices to hardware.

## Renderer comparison preview

The optional Filament comparison is documented in [RENDERER_COMPARISON.md](RENDERER_COMPARISON.md).
It uses separate temporary simulation controls and does not replace this scene.

## 3D-first shell verification

The migration replaces the dashboard/tab navigator with the house as the first
private route. Existing authentication, recovery, membership, scene, automation,
registry, camera, and household paths remain behind their prior access boundaries.
Navigation regression tests exercise repeated trips through the actual stack
router and retain the original Home route instead of accumulating duplicates.

The migration passed the full 100-suite / 1,596-test app run, followed by focused
checks for the final panel-recovery, navigation, and microphone lifecycle changes.
TypeScript and dependency checks passed. Browser checks exercised all menu pages,
all five integration pages, typed simulation commands, feature returns, and the
native device library at 320×562, 390×844, 834×1194, 1194×834, and 960×600.
The iOS Release preview uses build 16. Native spoken recognition still requires
an owner check on the phone; browser commands do not establish microphone accuracy,
provider linking, or physical hardware operation. Physical iPad testing remains
deferred and no Android device result is claimed.
