# Release Assets

The approved app-icon source is `assets/brand/vantahome-icon-master.png`.
Release PNGs live in `assets/release/` and are referenced by `app.json`.

- `icon.png`: opaque, full-bleed 1024x1024 app icon.
- `adaptive-icon.png`: opaque 1024x1024 copy of the approved icon for Android's
  system-provided adaptive mask.
- `splash-icon.png`: transparent 1024x1024 image with a padded mark on the
  configured `#050612` background.
- `favicon.png`: 48x48 web icon.

The checked-in native iOS icon and splash copies must match these release PNGs.
Run `npm run release:assets-check`; CI also runs it through `npm run verify`.

The app icon, adaptive icon, and favicon are deterministic resizes of the
product-owner-supplied raster master. The splash remains derived from the
editable SVG artwork. No generated variation is introduced during export.
