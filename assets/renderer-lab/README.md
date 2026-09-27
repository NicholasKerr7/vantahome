# Shared renderer comparison assets

Regenerate and validate with `npm run build:renderer-lab`. The shared exporter
reads the existing house manifest, fixture catalog, and property boundary;
the native water exporter reuses the Three.js particle factory. Neither edits
the house exports. Verify with `node --test scripts/build-renderer-lab-assets.test.mjs
scripts/build-filament-rain.test.mjs scripts/build-filament-materials.test.mjs`.

All coordinates are metres, Y-up, with X east and Z south. `fixtures.glb` uses the
upper floor's local elevation, matching `packages/home-scene/public/models/upper.glb`.
Add 2.9464 m to the fixtures only when using the complete exterior model.

- `lab-light-master-light`, `lab-light-master-bedside-left`, and
  `lab-light-master-bedside-right` are meshes with same-named emissive materials.
  Only their diffusers are exported; their static fixture shells are already in
  the existing upper-floor model. Turn emission off to indicate an inactive light.
  `packages/home-scene/src/renderer-lab/bedroomLighting.ts` shares their point-light
  positions, seven-metre falloff radius, and warm sRGB/linear RGB color between
  renderers. Emitters sit 0.12 m below the GLB diffuser centers: ceiling
  `[9.9665, 2.3922, -14.145]`, left bedside `[8.655, 0.716, -15.9]`, and right
  bedside `[11.345, 0.716, -15.9]`. The bedside emitters remain below the opaque
  shades. The shared contract test checks these positions against `fixtures.glb`.
  Three.js retains its 18-candela light intensity; native Filament calibrates its
  lumen values separately for the fixed native camera exposure. Bedroom practical
  output stays constant across day/night while environmental illumination changes.
- `lab-blind-fabric` is a group whose closed transform is translation
  `[8.139, 2.1, -16.49]` and unit scale. Its children are twenty closed venetian
  slats named `lab-blind-slat-00` through `lab-blind-slat-19` and
  `lab-blind-bottom`. The existing model contains the fixed headrail.
  For the simple shared prototype, opening fraction `p` sets group Y to
  `2.1 + 0.28 * p` and scale Y to `1 - 0.82 * p`. This gathers the geometry at
  the headrail; it is a simplified comparison animation. Exact existing blind
  motion can instead update individual slats using `src/blinds.ts` in the scene
  package, keeping the group at unit scale.
- `rain.glb` contains 36 batched meshes. Original water batches and shared foliage use the
  absolute pose contract in `packages/home-scene/src/renderer-lab/weatherAnimation.ts`. Its generated
  `weather-surfaces.json` records node anchors, source surfaces, and fixed budgets.
  Twelve original rain phases expose 120, 240, or 360 drops for light rain, heavy
  rain, or thunderstorms. Additional heavy-rain batches use 0.5–0.8 m streaks; storm batches
  use 0.85–1.2 m streaks so stronger rain remains visible at property scale. Drops
  terminate on sampled roof, road, driveway, or yard surfaces;
  the house and shed interior envelopes exclude ground-level drops.
- Four impact batches contain 112 splashes sampled from actual roof triangles,
  driveway/apron, road, paths, and service covers. Four runoff batches contain
  56 drops immediately outside exposed roof eaves, with clearance from lower roofs.
  `lab-weather-wet` copies upward-facing hardscape triangles with a thin wet overlay.
  Each phase uses one transform; individual particles never require native calls.
- Three.js replaces the 20 rain/splash/runoff batches at runtime using
  `threeRainGeometry.ts`, `threeRainShaders.ts`, and `threeRain.ts`. Its three fixed
  GPU pools contain 720 rain quads, 336 splash-arm quads for the same 112 impacts,
  and 56 runoff quads: 2,224 triangles total. Anchors remain exact copies of
  `weather-surfaces.json`; rain has two independently phased instances per anchor,
  and each splash's three arms share a phase. Shader animation gives streaks soft
  edges and a minimum viewport footprint without per-particle JavaScript updates.
  The source water batches are hidden while replacements are mounted and restored
  on disposal; their shared GLB geometry remains unchanged.
  The existing wet-overlay triangles mask procedural ripple rings, including at
  narrow pavement edges, so rings do not spill onto grass. Motion off removes
  moving water and rings while keeping static wetness. The controller restores the
  original overlay material and releases generated GPU resources on disposal.
- Filament hides all original water batches and the wet overlay, retaining the
  shared foliage. `filament-rain.glb` holds three native quad batches with the same
  720/336/56 particle counts, anchors and seeds, plus an exact pavement-mask copy.
  The generator invokes `threeRainGeometry.ts` so seed laws cannot drift. Each
  batch adds two zero-alpha, degenerate bounds guard triangles, preserving the
  full shader-motion envelope through glTF loading without changing any anchor.
  UV0 holds corners, UV1 phase/size, and COLOR_0 tier/3, variation, zero, guard alpha.
  A one-pixel embedded placeholder texture retains both UV channels in glTF loaders;
  custom materials replace it before water is reported ready.
  `filament-water.filamat` and `filament-wet.filamat` port the soft streaks, impacts,
  runoff and procedural pavement rings. Their sources live in `materials/`.
  They include Metal, Vulkan and OpenGL shaders in material format 68. Run
  `FILAMENT_MATC=/path/to/matc npm run build:filament-materials` using Filament
  1.68.3 tools after shader edits; normal scene builds verify committed binaries
  against source hashes and both installed SDK headers. Runtime cleanup restores
  borrowed materials and removes renderables before custom material owners release.
  Counts and timing laws now match Three.js, but rendering paths differ; callback
  timings still do not establish equal GPU work or a performance winner.
- Fifteen `lab-weather-plant-*` meshes contain exactly the original foliage triangles
  split into seven palm crowns and eight shrub beds. Original material colors are
  baked into vertex colors, allowing one draw per anchor. Hide the three original
  `landscape-Site Leaf dark/light/middle` meshes while this replacement asset is
  mounted, and restore them on disposal. Three.js sanitizes spaces in these names
  to underscores. Trunks and bark stay in the original landscape and remain fixed.
  The weather asset stays resident in clear weather so plants never disappear.
  Reduced motion hides all precipitation, disables lightning and foliage movement,
  and retains wet surfaces whenever a rainy mode is selected.
- `solar.glb` contains the four named `lab-light-grounds-solar-*` diffusers.
  Their world positions and rotations come from the existing device catalog;
  static poles, panels, and housings remain in `landscape.glb`. Both comparison
  renderers illuminate these diffusers and their inward-facing light pools in
  night mode. `solarLighting.ts` shares the exact downlight positions, directions,
  nine-metre falloff, and soft cone across engines. Solar power follows night
  mode independently of the bedroom switch.

The representative bedroom bounds are X `[7.457, 12.476]`, Z
`[-16.545, -11.745]`. Existing immersive camera: position `[10, 1.5, -13.05]`,
target `[10, 1, -15.2]`. An overhead comparison can use `[13.5, 8, -9.5]`, targeting
`[9.9665, 0.5, -14.145]`, with viewport-specific fitting applied identically in
both renderers.

The existing `gate.glb` stays separate. Translate its root to
`[-9.79 + 6.8 * openFraction, 0.575, -22.37]`. Its two renderable node names are
`gate-Site Gate metal` and `gate-Site Rubber`; no animation clip is embedded.
