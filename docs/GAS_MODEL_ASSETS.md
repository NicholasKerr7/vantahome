# Gas device model assets

The shared `house-manifest.json` and `device-geometry.json` contain the exact placement,
dimensions, materials and editable primitive parts for `utility-gas-meter` and
`kitchen-gas-leak`. These are illustrative simulation devices, not installation plans.

The compact meter is on the kitchen's exterior east wall, away from the southwest
energy pavilion. It contains a service meter, pipe unions and valve, with no storage
tank. The LPG detector is low on the kitchen's south return wall, separate from the
existing ceiling heat/CO sensor. Placement tests raycast the actual exported wall
faces and check the clear approach in front of the detector.

Run `node scripts/build-gas-device-assets.mjs` after changing either descriptor.
The script updates only `ground.glb`, `exterior.glb` and `landscape.glb`. It appends
material-batched static parts while retaining every existing material, accessor,
node transform, image, index and binary geometry byte. It records baseline hashes,
replaces its own previous append on rerun and rejects changes to the protected
baseline. A fresh full-house export without gas fixtures can also be used as a new
baseline. A full export of the updated Blender master already includes the gas
shells; the append script detects that case and refuses to duplicate them.

The browser draws live readouts/status indicators from the `display` parts.
Static display backing remains present in the GLBs. Filament loads the same
exterior and landscape assets; its current property view includes the meter.
The detector is also present inside the exterior asset and in the browser's
ground-floor cutaway. No extra Filament room view is introduced.

The additions cost 1,080 detector triangles and 1,208 meter triangles, with four
and five material batches respectively. No new textures or runtime dependencies
are needed. Verify with `node --test scripts/build-gas-device-assets.test.mjs`.

For an editable Blender master, run:

```sh
Blender --background --python scripts/add-gas-fixtures-to-blender.py -- \
  --source /path/to/seaview-luxury-smart-home.blend \
  --output /path/to/seaview-luxury-smart-home-with-gas.blend
```

This reads the same repository descriptors, adds the two device assemblies to the
complete-house scene and the detector to the ground-floor scene, and saves a new
file. Existing Blender objects and source-file bytes remain unchanged. The new
objects keep the established `floor`, `landscape` and `runtimeDynamic` export tags.
