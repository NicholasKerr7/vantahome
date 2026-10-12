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

Use the final icon artwork as the visual source for those PNG files.

Recommended sizes:

- App icon: `1024x1024`
- Adaptive icon foreground: `1024x1024`, centered with safe padding
- Splash icon: `1024x1024`, centered with more padding for `contain`
- Favicon: `48x48` or `32x32`

Keep `vantahome-icon-master.png` unchanged as the single source of truth. The
app icon, adaptive icon, favicon, and padded splash derivative must all use this
approved artwork.

## Cinematic brand animation

“Core Awakening” interprets the approved icon as a sculptural reference for a
standalone disassembly/reassembly film. Its reusable prompts, generation
settings, source checksum and delivery evidence are recorded in
[`motion/core-awakening.production.json`](motion/core-awakening.production.json).
It does not replace the master artwork or add a loading delay to the app.
The finished widescreen delivery is 1920×1080, 24 fps, about 12 seconds, with
stereo audio. Large media stays in the work cache and Higgsfield media library;
only production metadata is tracked here.

To regenerate the compact UI mark on macOS:

```sh
sips -Z 256 assets/release/icon.png --out assets/brand/vantahome-mark-256.png
```
