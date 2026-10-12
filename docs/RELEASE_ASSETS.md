# Release Assets

The approved app-icon source is `assets/brand/vantahome-icon-master.png`.
Release icons live in `assets/release/` and are referenced by `app.json`.

- `icon.png`: opaque, full-bleed 1024x1024 app icon.
- `adaptive-icon.png`: opaque 1024x1024 copy of the approved icon for Android's
  system-provided adaptive mask.
- `splash-icon.png`: transparent 1024x1024 image with a padded mark for Android's
  system splash, on the configured `#050612` background.
- `favicon.png`: 48x48 web icon.

The iOS launch image is `assets/brand/motion/vantahome-arrival-poster.png`: a
1024x768 first-frame export of the bundled cinematic entrance. It is displayed
with full-view `scaleAspectFit` on the same `#050612` background as the in-app
poster and video. The three checked-in iOS splash image scales are exact copies
of this frame; the native app icon remains an exact copy of the release icon.
Run `npm run release:assets-check`; CI also runs it through `npm run verify`.

The app icon, adaptive icon, favicon, and Android system splash remain
deterministic derivatives of the product-owner-supplied raster master. The
Android splash centers a 640x640 copy on a transparent 1024x1024 canvas. The
cinematic iOS launch frame is an approved generated interpretation of that
artwork, not a replacement for the icon master.

`expo-splash-screen` is configured explicitly. iOS retains full-view legacy
image sizing so its static frame matches the in-app `contain` presentation.
Android uses the padded icon at 200dp because the platform's system splash is
icon-based; it does not promise a full-frame match to the cinematic player.
There is no checked-in Android native project, so that configuration still
requires a generated Android build and physical-device validation. Native
splash changes require a new binary; an asset-only update cannot replace the
installed system launch screen.
