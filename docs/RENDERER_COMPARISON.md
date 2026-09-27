# Native renderer comparison

This preview evaluates React Native Filament alongside a controlled Three.js
WebView scene. It does not replace 3D Home or connect to physical devices.
The original scene, saved simulation, authentication, and device transports are
unchanged. Comparison controls are temporary and reset when leaving the preview.

## Build and open

1. Install dependencies, then run `npm run build:scenes`.
2. For iOS, install Pods and rebuild the native application. Expo Go does not
   contain Filament or Worklets Core.
3. Set `EXPO_PUBLIC_VANTA_MODE=demo` and
   `EXPO_PUBLIC_ENABLE_RENDERER_LAB=true` for a preview build.
4. Open **3D Home**, tap the flask button, and select **Three.js** or **Filament**.

The entry is disabled by default and cannot be enabled in alpha/production mode.
The flag hides the feature; it does not strip the experimental native library or
comparison assets from the binary. Remove unused comparison dependencies/assets
before a production release after the renderer decision.
Browser previews offer the Three.js case; Filament requires an iOS/Android native
build. Return to 3D Home using the header. Only one comparison renderer is mounted
at a time. Backgrounding or leaving the screen releases its graphics surface.

## Shared test cases

| Case | Assets | Controls |
| --- | --- | --- |
| Bedroom | Original furnished `upper.glb` plus exported live fixture parts | Ceiling/bedside lights, blind opening, day/night, orbit/pinch |
| Property | Original `exterior.glb`, landscape, gate, solar diffusers, and shared weather geometry | Sliding gate, weather preview/Auto, day/night with four solar lights, orbit/pinch |

Each WebView document embeds only its case's assets, matching the native inventory.
The bedroom package is approximately 5.3 MiB and the property package 17.6 MiB.
The packaged documents make no network requests. Manual Clear, Light rain, Heavy
rain, and Thunderstorm modes are deterministic and work offline. Auto uses the
host's validated Open-Meteo service for the existing Hopewell, Jamaica location;
it needs no device location permission. The host pauses polling in the background,
labels stale/unavailable conditions, and stops using observations older than six
hours. Day/night remains a separate comparison control.

The house and furniture exports remain editable and unchanged. The asset exporter
reads the existing device catalog and emits separate named blind and light parts.
The simplified blind gather and shared weather poses match both previews; this
is not a port of every existing device or weather effect. The detailed asset
contract is in `assets/renderer-lab/README.md`.

Both cases share camera presets, full device pixel density, gate travel, animation
easing, and reduced-motion behavior. Native controls use at least 44-point targets.
Phone portrait and tablet portrait put controls below the scene; tablet landscape
uses a side panel. The screen does not introduce vertical scrolling.

### Surface-aware storms

The shared weather asset traces the committed roof and landscape triangles.
Storms use 360 rain streaks, 112 hard-surface impact clusters, and 56 roof-edge
drips in fixed batches. Lighter modes activate fewer batches. Roof, driveway,
road, paths, and service covers receive their own sampled impacts; foliage and
indoor floors do not receive pavement splashes. Every roof-drip anchor is checked
for clearance from adjoining roofs.

Fifteen rooted foliage groups preserve the source leaf triangles and colors.
Only crowns and shrubs sway; trunks and bark stay fixed. Exposed roof/pavement
materials darken and become smoother in wet conditions, with a fitted wet-surface
overlay. These are bounded visual effects, not a fluid simulation or planar
reflection pass. The 36-group asset is about 1.25 MiB, uses no new textures, and
never grows its particle pool. Native weather transforms update at most 30 times
per second independently of camera input.

Thunderstorm codes alone enable a soft 0.85-second lightning envelope once per
19 seconds. Filament adds this to its single sun/moon source because the SDK
supports only one directional light. Reduce Motion or Motion off hides moving
precipitation, disables lightning, and rests the plants while keeping wet surfaces.
Original scene exports and the existing full 3D Home experience remain unchanged.

## What the numbers mean

- **Assets ready**: time from mounting the case until its required assets report
  ready. This is not a measured first-visible-frame time. The first native load
  includes lazy module initialization; first WebView load includes materializing
  its local HTML file. Compare cold and repeated loads separately.
- **Interval P50/P95**: render-callback cadence in milliseconds, over approximately
  two-second windows after a one-second warm-up. Both collectors use the same
  percentile implementation and keep visible scheduling hitches. Settings changes
  restart warm-up; background periods are excluded.
- **Samples**: callback intervals in the current window. These are not GPU frame
  completions, an FPS guarantee, memory readings, or battery measurements.

The Three.js case uses the current renderer technology with a smaller comparison
controller, not the full React Three Fiber application. Its hemisphere lighting,
ACES exposure, PCF shadows and MSAA differ from Filament's image-based illumination,
native tone mapping, shadows and FXAA. Visual calibration is required before using
these results to claim equal-quality performance. Resolution and asset parity
alone do not prove equal rendering work.

## Decision procedure

1. Use release builds on the same device with the same case, controls, orientation,
   brightness, and thermal starting state. Alternate which engine runs first.
2. Confirm the same furniture and site geometry, readable materials, working lights,
   full blind/gate travel, picking, orbit/pinch, reduced motion, and background resume.
3. Record cold and repeated startup separately. Run each animated property case for
   15–20 minutes. Profile frame pacing, native/GPU/WebView memory, input latency,
   thermal state, and energy with platform tools; the UI diagnostics are insufficient.
4. Include the target Android performance tier before choosing a renderer. Physical
   iPad testing remains deferred. Do not infer Android behavior from an iPhone build.
5. Migrate additional features only if repeatable improvements justify the cost and
   the remaining lighting, materials, picking and lifecycle checks pass.

## Verification scope

Automated coverage checks preview gating, bounded messages, shared interval
statistics, state retention when switching engines, stale callbacks, background
unmounting, reduced motion, load timeouts and initialization-error recovery. Asset
tests verify blind pivots, lamp locations, shared rain geometry and offline bundle
inventory. Browser checks exercise selection, gate/blind movement, rain, and layout.

The React error boundary covers JavaScript/import failures. A native graphics or
asynchronous worklet failure can still terminate the process; installing and
exercising the native preview is required. No renderer performance winner is
established by these tests.

### Preview verification, 2026-09-27

- iPhone Release preview build 4 compiled, signed, and installed successfully.
- Android JavaScript/assets exported successfully; no Android native build or
  physical Android verification has been performed.
- TypeScript and the production dependency audit passed. Focused app, scene,
  protocol, asset and packaging tests passed.
- Browser checks at 430×932, 1280×800 and 820×1180 found no vertical overflow;
  controls, keyboard sliders, scene selection, reduced motion and return to the
  original 3D Home worked. Existing dashboard/library warnings remain unrelated.
- The standalone physical UI test runner compiled, but installation was rejected
  by Apple's three-app limit for the free developer profile. No existing app was
  removed. The subsequent physical test reported a crash when selecting Filament;
  build success did not establish runtime correctness.
- Sustained GPU, memory, heat and energy comparisons remain unmeasured.

### Native startup crash investigation

The iPhone reports identified invalid memory access on `filament.render.queue`.
Two reports point to `CameraWrapper::setProjection`: Filament 1.11.0 publishes a
four-argument TypeScript declaration, but its C++ method requires a fifth FOV
direction and its JSI dispatcher does not check the argument count. The comparison
camera now supplies an explicit `vertical` direction through a narrowly corrected
type. The camera regression test asserts the complete native call.

The first report instead failed while constructing a nested Worklets Core callback.
The SDK's shared-value light subscriptions create that nested callback during scene
initialization. The comparison therefore owns its light entities and performs
updates on the render thread without those subscriptions. This also allows light
components to be removed and destroyed explicitly when leaving a scene.

The same API audit found that the SDK's `EntitySelector` writes `emissiveFactor`
as four floats, although the glTF material declares three. Lamp glow now uses
the native material's `setFloat3Parameter` directly.

Release preview build 5 passed compilation and signature verification, and was
installed on the same iPhone. It got past renderer initialization, but physical
testing still produced crash reports. An iPhone simulator test reproduced the
failure after loading the native bedroom and toggling lights, blinds and night
mode. LLDB caught the original JavaScript exception during the switch to Property:
light cleanup called `.catch()` on the Worklets Core native thenable, which does
not expose that method correctly. Cleanup now uses its supported `.then(undefined, onError)`
rejection callback. The regression mock matches that restricted native contract.

After the cleanup correction, TypeScript and all 26 focused tests passed, including
seven new light ownership/material regression tests. Release build 6 passed
compilation and signature verification and was installed on the physical iPhone.

An automated iPhone 17 simulator test passed the full native flow with zero
failures: bedroom lights/blinds/night, property gate/rain/motion/day, switching
between Three.js and Filament, recreating both scenes, background/resume, and
returning to the original 3D Home. Screenshots confirmed visible native geometry.
The debugger caught no exception in that corrected run.

An additional idle check found blank native interval diagnostics. Worklets Core
reuses its shared array wrapper when the sampling window resets, clearing the
array before its asynchronous JavaScript callback reads it. The collector now
copies each completed window into an independent array before reporting it.
Two regression tests cover delayed delivery, consecutive windows, warm-up resets,
and callbacks after unmount. TypeScript and all 28 focused tests pass.

A second native simulator test, with no debugger attached, passed ten-second idle
checks in both scenes: P50/P95 and positive sample counts appeared, the scenes
remained responsive, and returning to the original 3D Home succeeded. Its logs
contain no JavaScript fatal error or native crash. Release preview build 7 includes
this diagnostics correction, passed compilation and signature verification, and
was installed on the same physical iPhone.
Physical iPhone confirmation remains pending; simulator success does not establish
device performance. Android native verification and sustained profiling remain
outstanding; physical iPad testing is deferred.

### Native interaction and night-lighting audit

Native simulator gestures reproduced the reported pinch failure: the property
rotated instead of zooming. The SDK's internal Metal `UIView` does not enable
multiple touches. A standard React Native view now owns the complete touch
sequence while the child render surface ignores hit testing. Finger identifiers
keep a pinch stable when events reorder touches or a third finger arrives.
Zoom bounds now limit the actual camera distance after portrait fitting, preventing
over-zoom and allowing an immediate reversal at either limit.

Night screenshots also reproduced almost identical bedroom lighting in the on and
off states. Filament 1.11 hardcodes a daylight camera exposure and exposes no
exposure setter. The native rig now applies nine stops of night radiance gain to
fixtures, with separately balanced dim ambient/moonlight, and scales diffuser
emission consistently. This follows Filament's [physical lighting and exposure
model](https://google.github.io/filament/main/filament.html#lighting); the resulting
intensities are display calibration, not a claim about installed bulb output.
The SDK's skybox hex parser also skips sRGB decoding; a prelinearized midnight
color prevents the intended dark background from becoming bright blue-gray.
Both engines now include the four solar diffusers and inward light pools that
were missing from the property comparison. Day/night controls switch them
automatically; the bedroom power setting does not affect them.

Static house/landscape models no longer perform device-animation math. Blinds
and the gate settle exactly at their target and stop allocating native matrices;
paused rain keeps its last pose without repeated transform submissions.
Reduced-motion device changes still apply immediately.
Fixture-shell picking is restricted to device batches so walls and floors cannot
activate a nearby projected lamp. Native picking already converts display points
to pixels internally; no extra density scaling is applied.

TypeScript and 38 focused app tests pass, including native spotlight arguments,
night/off lighting, solar automation, finger transitions, portrait distance limits,
settled animations, and paused rain. Six asset/packaging tests and three shared
solar geometry/runtime tests pass; both offline comparison documents rebuild.

The final iPhone simulator run passed two native UI flows with zero failures:
night lights on/off, property pinch in/out and orbit/reset, fixture selection,
blinds/gate controls, rain, motion toggling, renderer/scene recreation, and
background/resume. Screenshots confirmed warm room illumination, visible solar
light pools, and the corrected midnight background. No Filament, fatal JavaScript,
or worklet exception appeared in the captured native error log. Release preview
build 8 compiled, passed signature verification, and was installed/launched on
the physical iPhone. The owner's device retest remains pending; Android native
verification, physical iPad testing, and sustained performance profiling remain
outside this verification run.

### Surface-weather preview verification

Both TypeScript projects pass, as do 49 focused app tests, 21 shared-scene tests,
and 10 asset/packaging tests. Geometry tests check roof/hardscape impact positions,
runoff clearance, intensity-specific streak dimensions, particle budgets, and
exact preservation of the source foliage triangles. A sampled trajectory audit
found no roof penetration across eight wind directions and six fall heights.

The iPhone 17 simulator passed a complete storm interaction flow and a final
geometry visual check. Coverage includes every manual mode, day/night, motion
off with wet surfaces retained, gate drag/toggle, real pinch gestures, switching
between engines, background/resume, and returning to the original scene. Auto
successfully fetched current Hopewell conditions and displayed Clear / Live.
Screenshots confirmed visible roof sheen, longer rain streaks, surface impacts,
and roof drips. The native console contained no fatal JavaScript, worklet, or
graphics exception. The first test attempt hit an ambiguous XCTest slider label;
the corrected harness passed against the same app logic.

Release preview build 9 compiled, passed signature verification, and was installed
and launched on the physical iPhone. Its packaged weather asset matches the final
verified source. Physical interaction/performance confirmation remains pending;
Android hardware and sustained thermal/energy profiling were not performed.
Physical iPad testing remains deferred.
