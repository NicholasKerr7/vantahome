# VantaHome scene workspace

This workspace contains the editable browser implementation of VantaHome's
optional 3D Home simulation: furnished house, landscape, 92 simulated devices,
lighting, weather, and animations. The host can share explicitly paired local
demo controls with its dashboard; real device services remain separate. See
[integration notes](../../docs/THREE_D_HOME.md) for
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

All controls are simulated. The embedded host saves all 92 devices' supported
state, lighting mode, and motion preference, and restores them after closing or
backgrounding. Graphics are released while closed; camera/room selection starts
from the default view on reopening. The standalone editing preview retains its
own browser-local preferences.

Only an offline, unauthenticated demo Owner without account/home scope shares
the 22 curated device pairs with the original dashboard. Every pair requires
its explicit demo ID, scene ID, and expected kind; room labels and names do not
infer a mapping. Other contexts use a separate saved preview per account, or a
local isolated preview when signed out. Changing account, home, member, role,
or realtime/MQTT scope disconnects the bridge until the scene is reopened.

`simulationBridgeProtocol.ts` bounds and validates the simulation-only messages;
`simulationBridgeClient.ts` preserves pending edits during host acknowledgements.
Neither sends device commands, authentication data, private media URLs, or
household observations. Persistence belongs to the host, and save failures are
reported there. The narrow protocol does not give the scene host-storage access.

Weather uses fixed Hopewell, Jamaica coordinates, and automatic solar lights
affect only the visual model. Weather failures do not stop the local daylight
clock.

```bash
npm run test:home-scene
node --test scripts/build-home-scene.test.mjs
npm run build:home-scene
```

Run those commands from the repository root. Packaging rejects missing,
unexpected, external, malformed, or oversized assets. The self-contained scene
is approximately 27.4 MiB before transport compression, so physical-device
profiling remains required: cold/warm startup, peak memory, frame rate during
landscape/weather animations, sustained heat and battery use, and recovery
after backgrounding. Verify tablet landscape, tablet portrait, and mobile
portrait, including touch controls, reduced motion, saved state, and no
page-level vertical scrolling. See the
[validation and performance notes](../../docs/THREE_D_HOME.md) before interpreting
desktop or automated test results as release readiness.
