# VantaHome scene workspace

This workspace contains the editable browser implementation of VantaHome's
optional 3D Home simulation: furnished house, landscape, 90 simulated devices,
lighting, weather, and animations. The host app's dashboard and real device
services remain separate. See [integration notes](../../docs/THREE_D_HOME.md) for
isolation, lifecycle, feature configuration, and release limitations.

## Develop

Use the repository's root lockfile; do not install a separate dependency tree or
create a workspace lockfile.

```bash
npm ci
npm run dev --workspace @vantahome/home-scene
```

The Vite command provides a standalone editing preview. After changing source or
models, regenerate the app's embedded scene from the repository root:

```bash
npm run build:home-scene
npm run web
```

The app's start/build scripts already run the packaging step automatically. A
running embedded scene is a generated snapshot; standalone Vite edits do not
automatically replace it.

## Source and outputs

| Location | Purpose |
| --- | --- |
| `src/` | UI, scene rendering, device simulation, and environment logic |
| `src/house-manifest.json` | Stable simulation IDs, rooms, and device placement |
| `src/device-geometry.json` | Device geometry and material definitions |
| `public/models/` | Five GLB exports and site layout metadata |
| `../../scripts/build-home-scene.mjs` | Validated web/native packaging |
| `../../public/home-scene/index.html` | Standalone production web scene |
| `../../public/home-scene/embedded.html` | Self-contained sandboxed web scene |
| `../../assets/home-scene/scene.vhscene` | Self-contained native HTML asset |
| `../../src/features/three-d-home/generated/` | Asset reference and hash manifest |

Generated outputs are ignored by Git. The editable Blender master is the
previously delivered `seaview-luxury-smart-home.blend`, maintained outside this
repository. Export changes into `public/models`, preserve the scene coordinate
system and IDs, and update hotspot/geometry metadata when objects move. Do not
add the Blender project to runtime assets.

## Behavior and checks

All controls are simulated. Embedded sessions reset when closed or backgrounded;
the standalone preview can persist its own local simulation preferences. Weather
uses fixed Hopewell, Jamaica coordinates, and automatic solar lights affect only
the visual model. Weather failures do not stop the local daylight clock.

```bash
npm run test:home-scene
node --test scripts/build-home-scene.test.mjs
npm run build:home-scene
```

Run those commands from the repository root. Packaging rejects missing,
unexpected, external, malformed, or oversized assets. The self-contained scene
is approximately 27.4 MiB, so physical-device loading and memory profiling remain
required. See the [validation and performance notes](../../docs/THREE_D_HOME.md)
before interpreting desktop or automated test results as release readiness.
