# Responsive layout QA

Last run: 2026-08-18

This check deliberately uses the React Native Web target so layout regressions
can be exercised without creating a Docker image or a native simulator. Native
release artifacts still require a final device smoke test before store upload.

## Viewport matrix

| Device class | Orientation | Viewport | Result |
| --- | --- | ---: | --- |
| Phone | Portrait | 390 × 844 | Pass |
| Phone | Landscape | 844 × 390 | Pass |
| Tablet | Portrait | 820 × 1180 | Pass |
| Tablet | Landscape | 1180 × 820 | Pass |

The Home and Scenes layouts were visually inspected at every viewport. The
onboarding, Settings, and Automations flows were also exercised at phone
portrait size. Internal scroll containers remained usable at reduced landscape
height, the root matched each viewport, navigation remained reachable, and no
page errors or error overlays were reported.

The 2026-08-18 polish pass added a compact side-by-side Home dashboard for both
landscape classes, reduced the phone landscape navigation footprint, prevented
phone room-action clipping, increased onboarding headline contrast, and removed
unintended flex growth from the Settings integration panels. All four viewport
baselines were rechecked after these changes.

## Runtime regression found during QA

The initial web development bundle parsed Zustand's ESM middleware inside a
classic script and failed before React mounted with `Cannot use 'import.meta'
outside a module`. `metro.config.js` now resolves only
`zustand/middleware` to its equivalent CommonJS build on web. This leaves native
resolution unchanged while restoring the browser runtime used for low-storage
QA.

## Repeat the check

1. Start Expo without Docker or a simulator: `npm run web`.
2. Open the local URL in a browser and exercise the four viewports above.
3. Confirm onboarding and all four bottom tabs mount, scroll, and navigate.
4. Confirm the browser has no page errors or React error overlay.
