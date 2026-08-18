# Vantahome Brand Assets

This folder contains the approved VantaHome icon master and supporting editable
brand artwork.

## Files

- `vantahome-icon-master.png` — approved, product-owner-supplied app icon master.
- `vantahome-mark.svg` — standalone brand mark / source icon direction.
- `vantahome-logo-horizontal.svg` — full horizontal logo lockup with wordmark.
- `vantahome-app-icon.svg` — opaque, full-bleed iOS/legacy icon source.
- `vantahome-adaptive-foreground.svg` — transparent Android foreground source.
- `vantahome-splash.svg` — padded transparent splash source.

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

Keep `vantahome-icon-master.png` unchanged as the source of truth for app icons.
The SVG files remain editable supporting artwork for other brand placements.
