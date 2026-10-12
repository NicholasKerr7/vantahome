# Vantahome Brand Assets

This folder contains the approved VantaHome icon master.

## Files

- `vantahome-icon-master.png` — approved, product-owner-supplied app icon master.
- `vantahome-mark-256.png` — compact 256px derivative for dashboard branding and
  loading displays. Generated from `assets/release/icon.png` without altering the
  approved artwork; the scene embeds it for offline use.

## Meaning

The mark is built around three ideas:

1. **Home** — the roof and chimney make the app instantly read as a home product.
2. **Vantahome identity** — the lower structure forms a strong `V` shape.
3. **Smart automation** — the central glowing hub and connected nodes represent the app as the control brain for the home.

## Expo asset targets

`app.json` points to these generated PNG files:

- `assets/release/icon.png`
- `assets/release/adaptive-icon.png`
- `assets/release/splash-icon.png`
- `assets/release/favicon.png`
- `assets/brand/motion/vantahome-arrival-poster.png`

Use the approved icon artwork for release icons and the approved film’s opening
frame for the arrival poster.

Recommended sizes:

- App icon: `1024x1024`
- Adaptive icon foreground: `1024x1024`, centered with safe padding
- Android system splash icon: `1024x1024`, centered with padding
- iOS arrival poster: `1024x768`, the exact first frame of the bundled entrance
- Favicon: `48x48` or `32x32`

Keep `vantahome-icon-master.png` unchanged as the single source of truth. The
app icon, adaptive icon, favicon, and padded Android splash derivative must all
use this approved artwork. The iOS arrival poster uses the approved cinematic
interpretation and must remain aligned with the in-app player.

## Cinematic brand animation

“Core Awakening” interprets the approved icon as a sculptural reference for a
standalone disassembly/reassembly film. Its reusable prompts, generation
settings, source checksum and delivery evidence are recorded in
[`motion/core-awakening.production.json`](motion/core-awakening.production.json).
It does not replace the master artwork. The app uses short, silent derivatives
for its unified arrival and reveals the home when it is ready; the complete
film is not a mandatory loading delay.
The finished widescreen delivery is 1920×1080, 24 fps, about 12 seconds, with
stereo audio. Large media stays in the work cache and Higgsfield media library;
the optimized arrival clips and their matching still frames are bundled here.

To regenerate the compact UI mark on macOS:

```sh
sips -Z 256 assets/release/icon.png --out assets/brand/vantahome-mark-256.png
```
