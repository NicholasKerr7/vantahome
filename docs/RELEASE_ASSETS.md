# Release Assets

The editable source of truth is in `assets/brand/`. Release PNGs live in
`assets/release/` and are referenced by `app.json`.

- `icon.png`: opaque, full-bleed 1024x1024 app icon.
- `adaptive-icon.png`: transparent 1024x1024 Android foreground with safe
  padding; Expo supplies the `#050612` background layer.
- `splash-icon.png`: transparent 1024x1024 image with a padded mark on the
  configured `#050612` background.
- `favicon.png`: 48x48 web icon.

The checked-in native iOS icon and splash copies must match these release PNGs.
Run `npm run release:assets-check`; CI also runs it through `npm run verify`.

The current raster files were rendered deterministically from the SVG brand
sources using macOS Quick Look. The app icon was flattened to an opaque PNG as
required by iOS. No AI-generated variation was introduced.
