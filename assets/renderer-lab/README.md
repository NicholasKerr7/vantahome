# Shared renderer comparison assets

Regenerate with `node scripts/build-renderer-lab-assets.mjs`. The script reads the
existing house manifest, fixture catalog, and property boundary. It does not edit
the house exports. Verify with `node --test scripts/build-renderer-lab-assets.test.mjs`.

All coordinates are metres, Y-up, with X east and Z south. `fixtures.glb` uses the
upper floor's local elevation, matching `packages/home-scene/public/models/upper.glb`.
Add 2.9464 m to the fixtures only when using the complete exterior model.

- `lab-light-master-light`, `lab-light-master-bedside-left`, and
  `lab-light-master-bedside-right` are meshes with same-named emissive materials.
  Only their diffusers are exported; their static fixture shells are already in
  the existing upper-floor model. Turn emission off to indicate an inactive light.
- `lab-blind-fabric` is a group whose closed transform is translation
  `[8.139, 2.1, -16.49]` and unit scale. Its children are twenty closed venetian
  slats named `lab-blind-slat-00` through `lab-blind-slat-19` and
  `lab-blind-bottom`. The existing model contains the fixed headrail.
  For the simple shared prototype, opening fraction `p` sets group Y to
  `2.1 + 0.28 * p` and scale Y to `1 - 0.82 * p`. This gathers the geometry at
  the headrail; it is a simplified comparison animation. Exact existing blind
  motion can instead update individual slats using `src/blinds.ts` in the scene
  package, keeping the group at unit scale.
- `rain.glb` contains one mesh and one translucent material, both `lab-rain`.
  Its 180 thin drops use ninety deterministic yard anchors, each repeated twelve
  metres above the first cell. Translate the mesh Y from `0` to `-12` and repeat.
  The house and energy shed envelopes are excluded. Below-ground particles are
  occluded by the landscape. Reduced motion should freeze or hide this effect.
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
