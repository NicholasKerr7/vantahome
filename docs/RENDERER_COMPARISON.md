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

Each WebView document embeds the shared source GLBs. Three.js creates instanced
water pools at runtime; Filament loads a separate compact water GLB and compiled
materials derived from the same surveyed anchors and seeds. The bedroom package is approximately 5.4 MiB
and the property package 17.7 MiB.
The packaged documents make no network requests. Manual Clear, Light rain, Heavy
rain, and Thunderstorm modes are deterministic and work offline. Auto uses the
host's validated Open-Meteo service for the existing Hopewell, Jamaica location;
it needs no device location permission. The host pauses polling in the background,
labels stale/unavailable conditions, and stops using observations older than six
hours. Day/night remains a separate comparison control.

The house and furniture exports remain editable and unchanged. The asset exporter
reads the existing device catalog and emits separate named blind and light parts.
The simplified blind gather and rooted foliage poses match both previews; water
animation now uses separate rendering paths. This is not a port of every existing
device or weather effect. The detailed asset contract is in
`assets/renderer-lab/README.md`.

Both cases share camera presets, full device pixel density, gate travel, animation
easing, and reduced-motion behavior. Native controls use at least 44-point targets.
Phone portrait and tablet portrait put controls below the scene; tablet landscape
uses a side panel. The screen does not introduce vertical scrolling.

### Surface-aware storms

The shared weather asset traces the committed roof and landscape triangles.
Both storms use 720 rain streaks, 112 hard-surface impact clusters (three arms
each), and 56 roof-edge drips in fixed GPU batches. Lighter modes activate fewer particles. Roof, driveway,
road, paths, and service covers receive their own sampled impacts; foliage and
indoor floors do not receive pavement splashes. Every roof-drip anchor is checked
for clearance from adjoining roofs.

Fifteen rooted foliage groups preserve the source leaf triangles and colors.
Only crowns and shrubs sway; trunks and bark stay fixed. Exposed roof/pavement
materials darken and become smoother in wet conditions, with a fitted wet-surface
overlay. These are bounded visual effects, not a fluid simulation or planar
reflection pass. The 36-group asset is about 1.25 MiB, uses no new textures, and
never grows its particle pool. Native foliage transforms update at most 30 times
per second independently of camera input. Native water receives a shared clock
each frame; individual particle motion runs entirely in its vertex shader.

Thunderstorm codes alone enable a soft 0.85-second lightning envelope once per
19 seconds. Filament adds this to its single sun/moon source because the SDK
supports only one directional light. Reduce Motion or Motion off hides moving
precipitation, disables lightning, and rests the plants while keeping wet surfaces.
Original scene exports and the existing full 3D Home experience remain unchanged.

### Three.js water rendering

Three.js now renders water through three fixed GPU-instanced quad pools: 720 rain
streaks, 336 splash arms representing the same 112 impacts, and 56 roof-edge drips.
These pools contain 2,224 water triangles in total. They use the exact surveyed
contact points without spatial jitter; two independently phased raindrops share
each existing rain anchor. Particle ages advance on the GPU, with synchronized
arms for each splash burst. Soft streak edges and a viewport-aware minimum width
keep rain legible at property scale without adding a bloom pass.

The controller hides the original 20 GLB water batches while its replacement
pools are mounted and restores their previous visibility on disposal. It also
borrows the existing wet-overlay geometry for a procedural ripple material.
The authored pavement triangles clip the ripple field at driveway, road, path,
and service-cover boundaries, preventing rings from spilling onto grass. Reduce
Motion or Motion off hides moving water and ripple rings while retaining the
static wet finish. Generated geometry and materials are released on disposal,
and the original overlay material is restored.

### Filament water rendering

`filament-rain.glb` expands the same Three.js anchor/seed factory into three batched
quad meshes, plus an exact copy of the wet-overlay triangles. Each water batch
contains two invisible, degenerate bounds guards so the native loader accounts
for vertex-shader motion. UV0 holds corners; UV1 holds phase/size; vertex color
holds tier/variation and a guard mask. A bundled one-pixel placeholder texture
preserves both UV streams through glTF loading and is unused by the final shaders.

Two custom, unlit Filament materials reproduce soft camera-facing streaks,
ballistic splash arms, eave runoff and pavement-clipped procedural rings. They
use premultiplied alpha, depth testing and no depth writes. Water color is
independent of the physical camera exposure so fine streaks remain readable at
night. A logical viewport height preserves the same minimum streak width across
device densities. Motion off hides particles and animated rings while retaining
static wetness; weather changes and Reset restart the deterministic clock.

`FilamentRain` owns the two materials and their instances. Setup validates every
named primitive, initializes uniforms before attachment and rolls back partial
failures. Teardown stops frame updates, detaches water renderables and restores
their original materials before releasing custom owners. `useModel` retains
ownership of loaded geometry. The shared site, fixtures, foliage and full 3D Home
remain unchanged.

Material sources are in `assets/renderer-lab/materials/`. Committed binaries
contain Metal, Vulkan and OpenGL shaders compiled with Filament 1.68.3 (`matc`
material format 68), matching both SDKs bundled in react-native-filament 1.11.0.
`npm run build:renderer-lab` regenerates native geometry and checks source/binary
hashes, shader backends and installed material versions before packaging. To edit
shaders, install the [matching Filament tools](https://github.com/google/filament/releases/tag/v1.68.3)
outside the repo, set `FILAMENT_MATC` to that `matc` executable, and run
`npm run build:filament-materials`. Normal app builds need no shader compiler.

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
alone do not prove equal rendering work. Water particle counts, sampled surfaces
and timing laws now match, but instancing, shader compilation, transparency and
tone mapping still differ. Their callback timings are not an equal-work GPU benchmark.

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
tests verify blind pivots, lamp locations, surveyed rain anchors, fixed GPU pool
budgets, and offline bundle inventory. Browser checks exercise selection, gate/blind movement, rain, and layout.

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

### Native lighting calibration

The bedroom now shares its emitter positions, seven-metre falloff radius, and
warm light color through `bedroomLighting.ts`. Each emitter sits exactly 0.12 m
below its committed GLB diffuser: the ceiling light is at Y 2.3922 m, and both
bedside lights are at Y 0.716 m. This moves the native bedside emitters below the
opaque shades instead of leaving them inside the shade geometry. A contract test
checks all three positions against the exported fixture nodes. Three.js retains
its existing 18-candela lights and appearance; native lumen values remain a
separate calibration for the SDK's fixed camera exposure.

Native lights now use explicit linear RGB colors on both creation and updates.
This avoids the previous difference between the SDK's initial Kelvin conversion
and the application's later temperature conversion. Ambient fill, directional
light, and practical output have been raised for the visual comparison. Bedroom
practical output stays constant through day/night changes while the surrounding
illumination changes; this supersedes the night-only practical-light gain recorded
in the build 8 audit above. Solar lights still follow night independently of the
bedroom power control. Diffuser emission retains its existing day/night behavior.

The authored geometry, textures, normals, colors, and material roughness remain
unchanged. Rain, impact, and runoff geometry, animation, and emission gain are
also unchanged. This calibration changes the light rig without altering the
weather effects or introducing broad material overrides.

Ambient occlusion and bloom remain disabled. A low-cost contact-shadow trial
introduced visible grain on wall and cabinet faces, so the final version retains
the clean calibrated lighting without an additional GPU pass.

Both TypeScript checks, 52 focused app tests, 23 shared-scene tests, and 10
asset/packaging tests pass. The offline comparison documents rebuild successfully.
Matching simulator captures across both engines cover bedroom day/night,
lights on/off, and clear/storm property views. They confirm brighter ivory/sage
finishes, a distinct lamp-off state, and clearer solar light pools. The engines
retain differences in background color and material response; this is a visual
calibration, not pixel-identical rendering.

The native interaction test passed lamp switching, animated night storms, a gate
drag to 64%, gate opening retained through renderer recreation/background resume,
and real pinch gestures. An earlier harness assertion read the slider before its
accessibility value updated; waiting for that value resolved the test failure.
The native console contained no fatal, worklet, or graphics exception. This final
interaction run included the subsequently rejected contact-shadow trial; the
14 matching captures verify the final appearance with that effect disabled.

Release preview build 10 compiled, passed signature verification, and was installed
and launched on the physical iPhone. Physical interaction and sustained GPU/thermal
profiling remain unverified; Android hardware was not tested and iPad testing is
deferred. Callback cadence is not a measure of GPU completion or rendered FPS.

### Three.js water polish verification

Both TypeScript checks, 35 shared-scene tests, and 10 asset/packaging checks pass.
The offline comparison documents rebuild successfully. Chrome compiled the water
and wet-surface shaders successfully. Geometry tests cover fixed pool sizes,
finite and deterministic seeds, unchanged surveyed anchors, coherent splash arms,
visibility tiers, and conservative bounds; controller tests cover borrowed-resource
restoration and generated-resource disposal.

The iPhone simulator's WKWebView passed Light/Heavy/Storm, day/night, motion off,
gate drag/toggle, real pinch, switching to Filament and back, and background/resume.
Visual captures confirm soft wind-slanted streaks and wet pavement without bright
ripple discs. A 13-second simulator recording captures the running effect. No
shader recovery UI or shader/WebGL/fatal exception appeared. An initial automation
run missed a weather radio tap; the corrected harness passed against the same app.
The host slowed during concurrent builds; these runs are functional verification,
not a controlled performance comparison.

Release preview build 11 compiled, passed signature verification, and was installed
and launched on the physical iPhone. Physical interaction, sustained GPU/thermal
profiling, and Android verification remain pending; physical iPad testing is deferred.

### Filament water port verification

TypeScript and all 79 targeted automated checks pass: 58 native comparison tests,
8 native geometry tests, 3 material packaging checks, and 10 existing shared
asset/offline packaging checks. The complete scene build passes; the Three.js
document hashes remain unchanged. The native GLB reproduces every Three.js anchor
and seed and preserves the exact paved mask. Material validation checks all
three mobile graphics backends, format 68 compatibility, and source/binary hashes.

The compiled Metal shaders were inspected as well as their sources. Mobile half
precision initially collapsed the ripple hash and quantized its clock; explicit
high precision now preserves independent surface rings and smooth time evolution.
Coordinate transforms, premultiplied alpha, UV channel mapping, and bounds guards
also passed independent review.

The Release iPhone simulator passed the full native water audit in 167.3 seconds:
clear/light/heavy/storm, day/night, motion off/on, wet-surface pause, gate
drag/toggle, pinch, Three.js roundtrip, background/resume, and clear restoration.
The 13-second video and close views confirm tapered streaks and subtle pavement
rings without opaque cards or bright ripple discs. There were no shader recovery
screens or shader/worklet/fatal native errors. These are functional and visual
checks, not a controlled GPU or battery benchmark.

Release preview build 12 compiled, passed signature verification, and was installed
and launched on the physical iPhone. Packaged native water geometry and both
materials match the verified source artifacts byte for byte. Production app
identity metadata was restored after the isolated preview build. Physical water
interaction and sustained GPU/thermal profiling remain unverified. No Android
SDK or device was available for runtime testing; physical iPad testing stays deferred.
