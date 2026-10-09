# VantaHome working context

Last maintained: **2026-10-09**. Read this before rediscovering the project.

## Locations and branch

- Active checkout: `/Users/nick007/Library/Caches/VantaHome/native-device-test`
- Branch: `3d-home-integration`; remote: `NicholasKerr7/vantahome`
- Logs, screenshots, build helpers: `/Users/nick007/Library/Caches/VantaHome/work`
- iOS derived data: `/Users/nick007/Library/Caches/VantaHome/native-derived-data`
- Public staging build configuration (outside Metro/repository):
  `/Users/nick007/Library/Caches/VantaHome/work/staging-client-public.env`
- Scene source: `packages/home-scene/src`; host bridge: `src/features/three-d-home`
- Generated scene bundles are ignored and rebuilt with `npm run build:home-scene`.
  Do not edit generated bundles or rebuild/retest everything without a reason.

## Product decisions to preserve

- 3D-first VantaHome with the original purple palette, modern navigation/cards,
  large furnished mid-poly property, cinematic but subtle motion.
- iPhone/Android phone portrait and tablet portrait/landscape; desktop tablet
  preview. No vertical page scrolling; preserve reduced-motion/touch behavior.
- Three.js is the main scene. Filament is an optional administrator renderer lab,
  disabled in the current authenticated Preview. No product references to Codex.
- Device hotspots: quick controls on mobile, full controls available; tablet
  avoids duplicating the adjacent inspector's quick toggle.
- Simulation first. No hub purchased or connected; NUC 15 is the user's intended
  hub direction. The 20-space/92-device authenticated model is simulation-only.
- Individual accounts and household invitations. Owner/Admin/Member have whole
  home role scope; Guest/Tenant live information and controls follow room grants.
- Property overview is separate from permissions: current invitees see the
  exterior/grounds. Only the Owner can optionally share furnished interiors.
  Shared layout never grants device readings/actions, occupancy, cameras, or
  activity. Unassigned rooms remain layout-only. Do not grant `fullHome` to
  implement this. All source GLBs are still bundled: visual privacy is not
  confidential asset delivery.
- Existing finite Guests use **Extend / Renew access**, not another invitation.
  Owner/authorized Admin can add 1 hour / 24 hours / 7 days or set a custom local deadline within
  365 days. Preserve rooms/actions, reset optional interior consent, and cancel
  superseded pending invitations. The Guest cannot extend their own access.
- Production remains unchanged; iPad physical testing is deferred.

## Environment and confirmed milestones

- Staging Supabase: `dcevusczjtmdpzrxpdou`. Migrations **001–021** applied only here.
  019 adds owner-only interior consent; 020 adds checked Guest deadline changes.
  021 adds Owner-managed, consented property weather configuration.
- Use configured CLI/Keychain credentials in memory; never print/store privileged
  keys or put them in `EXPO_PUBLIC_*`. Do not read account credentials into chat.
- Preview bundle: `com.anonymous.vantahome.preview`; scheme `vantahome-preview`.
- Physical iPhone: iPhone 16 Pro Max / UDID `00008140-000171261411801C`.
- Preview 37 user-confirmed: Owner invite/code/password/home/model setup; Guest
  invite and acceptance; Living-room-only access; working Pendant light; blocked
  Front entry door; Guest persistence after reopening; Owner account switch.
- User confirmed Owner password reset from the iPhone, cold email-link return,
  new password, and full Owner home after sign-in. Passwords/codes were not read.
- The original test Guest used 24-hour access ending October 5; do not silently
  extend that grant. Check current server state before further Guest testing.
- Preview 39 Release build **succeeded**; exact bundle/schemes, device coverage and
  strict signature verified. Production metadata restored. Signing profile
  expires **2026-10-11 06:55:16 UTC**. Installed October 7; the physical device's
  app listing confirms 1.0.0 (39), and the developer service launched it.
- The user confirmed the requested Preview 39 iPhone Guest renewal check works:
  renewal, return with the existing account, and retained Living-room/control
  restrictions. Do not repeat that test.
- Preview 39 iPhone offline/reconnect also passed by user report: with Wi-Fi off
  and Airplane Mode on, the supplied screenshot shows **Unable to verify home
  access**, **Retry**, and **Sign out**. Restoring connectivity returned access;
  door control remained blocked. Do not repeat this check or infer whether Retry
  was tapped, how long recovery took, or broader lifecycle behavior from it.
- Preview **40** is now installed and launched on the same iPhone (device listing
  confirms 1.0.0 / 40). It adds the cinematic verification/recovery screen below.
  Release packaging, exact identity/schemes, profile device coverage, and strict
  signature passed; production metadata was restored. Signing expiry remains
  October 11 as above. Physical review of the new presentation is not yet reported.

## Responsive room controls (Preview 51)

- Fixed `#room-controls > aside` children shrinking below their assigned width:
  a legacy narrow-layout `align-items: start` survived the switch from grid to
  flex. The dashboard inspector now explicitly stretches its heading, selected
  card, room inventory and footer across the panel.
- Room cards fill the remaining height and add complete two-column rows based on
  the measured grid and CSS minimum card height. Fractional measurements avoid
  fitting a clipped extra row; an odd final card uses the row's full width.
  Short panels retain readable cards, paging and 44px actions. Keyboard rings
  are inset to remain visible at the panel edges.
- Pagination preserves selected or focused devices through resizing and manual
  browsing. A new selection clears stale page anchors, including returning to a
  previously selected device. Hidden portrait panels retain their last capacity;
  returning from a shared property overview observes the newly mounted grid.
  Permissions, device state, portrait full-width model and hotspot controls are
  unchanged. No page scrolling or dependencies added.
- **126 focused tests** pass, including 17 inspector regressions for row capacity,
  focus, selection, manual paging, room/access updates and overview transitions.
  Native/scene TypeScript, scene builds and diff checks pass. Eleven browser
  viewports (320×568 through 1440×900) passed 31 layout measurements and 12
  portrait quick/full-control checks: full allocated width/height, adaptive rows,
  no document overflow, 44px targets and reduced motion. Screenshots reviewed.
  Evidence: `work/room-controls-{inspector-tests,scene-build,native-types}.log`,
  `room-controls-final-evidence.json` and `room-controls-final-*.png`.
- Final-bundle pointer/keyboard, tall-to-short resizing, portrait/landscape
  rotation, hotspot reselection and genuine coarse-pointer tablet touch checks
  pass. Selection/focus stay intact, full controls open/close correctly, and no
  browser runtime errors occurred. Evidence: `room-controls-interactions.json`,
  `room-controls-touch.json`, `room-controls-reselection.json`; summary:
  `room-controls-qa-summary.json`. Temporary fixture, owned browser and ports
  5186/5187 removed/stopped; production entry remains `index.ts`.
- Preview **51** Release built from production `index.ts`, with exact packaged
  scene identity, device profile coverage and strict signature verified. Installed
  and launched on the iPhone; Apple reports **1.0.0 (51)**. Production source
  metadata restored; release version/assets/redirect checks pass. Native scene:
  **31,795,814 bytes**, SHA256
  `4dbd0ca4b8629af378f370e0e446b174ea6d19d4e6a36ce0223812e178c53b2b`.
  Receipts: `native-preview-build-51*`, `preview51-package-check.json`,
  `preview51-install*`, `preview51-installed-app*`, `preview51-launch*`.
  Physical presentation review remains user-owned; iPad physical testing remains
  deferred. Browser verification uses the public local demo, not live accounts.

## View selection and dashboard surface polish (Preview 50)

- Fixed the apparent double selection after leaving Immersive/resetting the view.
  Camera state already selected only one mode; persistent hover painted a second
  mode with the same accent. Only `aria-pressed=true` now gets the selected fill;
  fine-pointer hover is a different shade, and touch gets no sticky hover fill.
  Reset/exit behavior, device state and camera geometry are unchanged.
- Removed the native landscape rail's right border and centered its compact,
  evenly spaced destinations. Portrait navigation retains its height and evenly
  sized targets. Removed the dock's top separator and used solid selected purple.
- Header, safe areas, native navigation and embedded dashboard now share the exact
  base purple. Removed the short header's cropped ambient layer and the embedded
  full-page gradient that caused bright bands at native boundaries. Motion within
  the property and reduced-motion behavior remain intact. Card artwork uses a
  single neutral fade, embedded panels have consistent solid surfaces and the viewport
  vignette is lighter. Floor-switch inner padding/border no longer overflow the
  52px room strip; its buttons retain 44px touch height.
- **86 focused tests** pass across reset/camera/access, navigation and host/cards;
  native/scene TypeScript, diff checks and scene build pass. Local demo browser
  verification passed **36 mode/reset checks across four layouts** (320×568,
  430×932, 768×1024, 1024×768), plus six touch gestures at 393×852 with coarse
  pointer/no-hover in both host and sandboxed renderer. Real canvas drag/recenter,
  upper-floor and gate exits, focus, reduced motion, 44px targets, rail centering,
  removed borders and no page overflow verified. Final screenshots and card text
  reviewed. Evidence: `work/dashboard-blend-{final,touch}-evidence.json`, final
  PNGs, `dashboard-navigation-polish-tests.log`, `reset-view-regression-tests.log`.
  An old Metro graph initially served stale native styles; restarting the owned
  test server with a clean graph resolved it. Final assertions also verify the
  absent header SVG and actual navigation colors/borders. No browser runtime
  errors; existing development require-cycle/RN warnings remain unchanged. Final
  summary: `work/dashboard-blend-qa-summary.json`. Temporary fixture, owned browser
  and servers on 5186/5187 removed/stopped after verification.
- Preview **50** Release built from production `index.ts`, packaged scene identity
  and strict signature verified, installed and launched on the iPhone; Apple
  reports **1.0.0 (50)**. Production source metadata restored; release version,
  assets and redirect checks pass. Native scene **31,794,199 bytes**, SHA256
  `b6b4b1eb25901dd836c52ac54e56422065eaf958c73aaeb28359ed6b36e41390`.
  Receipts: `native-preview-build-50*`, `preview50-package-check.json`,
  `preview50-install*`, `preview50-installed-app*`, `preview50-launch*`. Physical
  presentation review remains user-owned; no live-account or hardware testing added.

## Dashboard cleanup, starter scenes and device audit (Preview 49)

- Removed the horizontal rule below the unified header and above scene shortcuts.
  Existing purple design, room navigation, touch and reduced-motion behavior stay intact.
- **Scenes → Presets** offers Good morning, Movie time, Good night and Away as
  editable drafts with cinematic artwork. Review/rename/adjust before saving;
  nothing runs automatically. Scenes remain account/home-scoped, device-local
  storage, explicitly labeled in the UI; there is no cloud scene sync.
- Saved scenes can be edited or deleted with confirmation. Deletion clears their
  dashboard shortcut/last-used metadata and pauses dependent routines. Deleted
  scenes are not reseeded; a preset can be added explicitly again.
- Authenticated virtual scene execution now uses current exact model bindings,
  validated controls, atomic updates of the latest simulation snapshot and safety
  reconciliation. It rechecks scope after hydration, rejects mixed hardware/model
  scenes and cannot publish old-home completion metadata. Comfort starters leave
  safety/security/exterior lighting untouched. No real-device integration added.
- All device surfaces share kind-aware activity/alarm presentation: closed covers
  and disarmed cameras do not glow as active, monitoring remains distinct from
  power, and acknowledged smoke/CO incidents retain alarm/reset-pending status.
  Speaker rings stop while paused, muted or silent. Native switches now have one
  full-row accessible touch target; short-phone routine help no longer clips.
  Scene sliders announce actual values; scene editing excludes monitor power and
  read-only observations and normalizes cover/camera/appliance intent.
- Verification: app/scene TypeScript, targeted native and scene regression suites,
  diff check and offline/web scene build pass. Actual native web host plus bundled
  renderer: all **92 devices / 30 kinds**, **2,419 full-control pages**, **152 quick
  panels**, 30 kind-specific action/illumination roundtrips, at 320×568, 430×932,
  768×1024 and 1024×768. Four presets fit all reviewed viewports; dialogs centered,
  44px+ actions and keyboard switch behavior verified. Screenshots reviewed.
  Browser create/edit/run/delete/cancel/reload flow passed, including TV Off
  reaching the model and deleted scenes staying absent. Browser used a public
  local demo; authenticated permission/execution paths have regression coverage,
  not a new live-account or physical iPad test.
- Evidence in work cache: `dashboard-final-qa-summary.json`,
  `dashboard-scene-crud-evidence.json`, `dashboard-final-*.png`,
  `dashboard-device-*.json`, `scene-presets-*.log`, `dashboard-*-tests.log`.
  Public fixture retained at `work/dashboard-native-preview.tsx`; temporary repo
  entry, both test browsers and owned ports 5186/5187 were removed/stopped.
- Packaged scene: **31,794,347 bytes**, SHA256
  `72df7951e47c3c680714a07e6383cc1b3c71e533f2301d079b766f2f44b17b4f`.
  Preview **49** Release build succeeded; exact identity/schemes, packaged scene
  hash/size, device profile coverage and strict signature verified. Installed and
  launched on the iPhone; Apple reports **1.0.0 (49)**. Source production metadata
  restored; release version/assets/auth-redirect checks pass. Evidence:
  `native-preview-build-49*`, `preview49-package-check.json`, `preview49-install*`,
  `preview49-installed-app*`, `preview49-launch*`. Physical review of these latest
  changes by the user is not yet reported.

## Unified home header and account preferences (Preview 48)

- Replaced the stacked native/embedded headers with one native cinematic header:
  brand, truthful simulation label, property time/location/weather, voice and
  current account. The embedded row is removed, returning space to the property.
  The standalone scene authoring preview retains its own header.
- Personal settings now open directly from **Account → Preferences**, with
  Experience / Comfort / Display tabs. Motion and automatic tour live here;
  3D help/reset and time/weather remain reachable. Units and clock format update
  the new header immediately. Reset permissions and device controls are unchanged.
- A strict presentation-only bridge carries bounded public weather/time values
  and explicit navigation/preferences. Account identity stays native. Commands
  require current access/readiness; backgrounded, covered or stale actions are
  consumed without replay. Only the foreground Preferences sheet can change
  presentation settings while it covers the retained scene. Late old-renderer
  callbacks cannot replace the new home's header state.
- Automatic tour now persists in host AsyncStorage under
  `vantahome:cinematic-preferences:v1`; opaque embedded storage is never used.
  A fresh install defaults on after hydration; unreadable/corrupt storage leaves
  tours off with a visible error. Serialized writes retain the latest choice
  through scene unmounts/reloads. No device/safety state or credentials added.
- Verification: targeted native/scene unit tests, app/scene TypeScript,
  diff checks and offline/web scene build pass. Real Expo-web native host plus
  sandboxed packaged scene checked at 320×568, 430×932, 768×1024 and 1024×768:
  exactly one header/weather control, 44px+ actions, no page overflow; weather,
  voice, account/preferences, units/time, comfort and reduced-motion paths work.
  Tour/motion survive a full page reload; help returns to the embedded panel.
  Screenshots were visually reviewed. **28 responsive actions + 7 final
  integration checks** passed, including Space/Enter, reload persistence and help
  return, without browser errors. QA entry, ports 5186/5187 and test browser were
  removed/stopped.
- Native scene: **31,793,185 bytes**, SHA256
  `3db9bda82b5c0bcff2e39b2f97e3d0d7d3cf0009ffd7c9860afa3ecf80eec208`.
  Evidence: work cache `unified-header-*`, `account-preferences-*` and bridge
  test logs. Browser fixtures use demo data; authenticated identity has unit
  coverage. Physical iPhone presentation review remains user-owned; iPad deferred.
- Preview **48** Release build, exact preview identity/schemes, strict signature,
  device coverage and packaged scene hash/size passed. Production metadata was
  restored; release version/assets/auth-redirect checks passed. Installed on the
  physical iPhone October 9; device listing confirms **1.0.0 (48)** and Apple's
  developer service launched it. Receipts: `native-preview-build-48{|-summary}.log`,
  `preview48-package-check.json`, `preview48-install.json`,
  `preview48-installed-app.json`, `preview48-launch.json`.

## Clearer scene artwork (Preview 47)

- Extended the clearer artwork treatment to native scene cards and the embedded
  dashboard's scene shortcuts. Native `scene-backdrop` keeps upper imagery clear,
  with names/actions near the bottom fade and readable room/status badges. The
  dashboard uses a neutral lower fade, text shadow and clearer selected border.
  Existing artwork and Run/Details behavior are preserved; no new assets,
  dependencies, animations, permissions or routine/device/room styling changes.
- Verification: app TypeScript, **38 existing native component tests**, **10
  existing scene tests**, and web/offline scene build passed. Dashboard browser:
  **18 checks** across 320/390px phones and both tablet orientations; all four
  simulation scene actions update the selection, images decode, controls fit,
  reduced motion remains enabled, no scrolling or browser errors.
- Native Expo-web fixture: four responsive captures, nine paginated pages and
  local Run/Details/last-used/Clear checks passed. Images load and controls remain
  reachable at least 44px high, with no page overflow/errors. Bright/dark artwork
  and phone/tablet screenshots visually reviewed. QA entry/servers/browser removed.
- Native scene: **31,789,061 bytes**, SHA256
  `a1bb89b0807bc84e8f4cfe0152c874d5b8cf05ae31d068812c2b9c617d005ab3`.
  Evidence in work cache: `scene-artwork/`, `scene-artwork-before.png`,
  `scene-artwork-native-evidence.json`, `scene-artwork-native-scenes-*.png`,
  `scene-artwork-{tests|browser|build}.log`, and native tests/TypeScript/capture logs.
- Preview **47** Release build, exact identity/schemes, strict signature, device
  coverage and packaged scene hash/size passed. Production metadata restored;
  version/assets/auth-redirect checks passed. Packaging receipts are
  `native-preview-build-47{|-summary}.log` and `preview47-package-check.json`.
  Installed on the physical iPhone October 9; device listing confirms
  **1.0.0 (47)** and Apple's developer service launched it. Receipts:
  `preview47-install.json`, `preview47-installed-app.json`, `preview47-launch.json`.
  Physical visual review is not yet user-confirmed; iPad physical testing deferred.

## Clearer room artwork (Preview 46)

- Lightened **Your rooms** cards in the embedded model and native room/library
  collections. The embedded room-only style replaces the purple image wash with
  a nearly clear upper image and a neutral-plum fade behind bottom-aligned labels.
  Floor/icon badges and footer labels retain readable contrast.
- Native artwork has explicit `room-backdrop` and `room-row` variants, each with
  one localized shade. DeviceBrowser groups labels at the bottom; ManageRooms
  preserves its compact centered text with a localized band and subtle text
  shadow. Other device/scene/routine artwork treatments are unchanged. No new
  media assets, dependencies, animations or loading gates; access/actions and
  bounded pagination remain unchanged.
- Verification: app/scene TypeScript, **31 existing scene tests**, **27 existing
  native component tests**, and bounded web/offline scene build passed. Embedded
  browser: **21 checks**, 320/390px phones and both tablet orientations, all 20
  room images decoded, no scrolling, room selection works, no browser errors.
  Before/after and light/dark room captures were visually reviewed.
- Native components rendered through Expo web: eight captures and eight scoped
  action groups across 320/430px phones, 768px portrait and 1024px landscape
  tablets passed. Room paging, selection, and ManageRooms details/navigation
  work; no page overflow or browser errors, visible buttons remain reachable
  and at least 44px high. Phone and tablet captures were visually reviewed.
  Temporary QA entry, browser and local servers were removed/stopped.
- Native scene: **31,788,866 bytes**, SHA256
  `7e9ee2ac8711de7389ce856a284c87649bc5dbac1c5cc90eaa92ce271084a667`;
  the 32 MiB budget remains unchanged.
- Work-cache evidence: `room-cards-before.png`, `room-artwork/` screenshots and
  `verification.json`, `room-artwork-browser.log`, `room-artwork-scene-tests.log`,
  `room-artwork-scene-build.log`, `room-artwork-native-evidence.json`, and
  `room-artwork-native-{library|manage-rooms}-*.png`.
- Preview **46** Release build succeeded; exact preview identity/schemes, strict
  signature, physical-device profile coverage and packaged scene hash/size passed.
  Production metadata was restored and version/assets/auth-redirect checks passed.
  Build/signature receipts: `native-preview-build-46.log`,
  `native-preview-build-46-summary.log`, and `preview46-package-check.json`.
  Installed on the physical iPhone October 9: the device app listing confirms
  **1.0.0 (46)** and Apple's developer service launched it successfully.
  Receipts: `preview46-install.json`, `preview46-installed-app.json`, and
  `preview46-launch.json`. User review of the room-card appearance on the
  physical iPhone is not yet reported; iPad physical testing remains deferred.

## Property weather accuracy (Preview 45)

- Owner route: **Settings → Weather → Set property location**. Three bounded
  steps review a name/latitude/longitude, IANA time zone, and explicit consent to
  share coordinates with authorized household members and Open-Meteo. No phone
  GPS is requested; do not infer the property's precise location. Town fallback
  remains **Hopewell, Jamaica** until the Owner saves a setting. A confirmed
  reset removes the saved coordinates and consent. At deployment there were
  **zero saved property locations**; no account settings were fabricated.
- `home_weather_settings` and migration 021 keep location separate from device
  access. Authorized, unexpired members can read it; canonical `homes.owner_id`
  alone can save/reset through checked RPCs. Direct writes and anonymous reads
  are denied. Staging 021/schema/RLS verified; production remains unchanged.
- The trusted native/web host supplies verified configuration to the scene.
  Initial/switching/failed reads expose no old coordinates and do not fetch a
  guessed location. Session changes and Guest expiry clear configuration;
  cancelled/late responses cannot cross locations. Native renderer messages
  still cannot choose a URL, coordinates, credentials or headers. Native and
  opaque iframe storage do not persist private weather coordinates.
- Shared settings refresh on foreground/local save and every **60 seconds**
  while active. Same-location revalidation preserves its reference and does not
  restart forecast polling. Changes on another device may take up to a minute.
  Settings reads are separate from home verification; weather failure alone
  does not change room/device permissions.
- Forecasts remain Open-Meteo **regional model estimates**, checked every 15 min,
  not on-property measurements or guaranteed rain detection. Model/download age
  is shown separately. Both must be within **30 min** for current effects;
  offline/failure/stale data pauses precipitation, wind and weather cloud effects.
  Saved readings may display for at most **6 hours**, explicitly labelled.
  Render-time freshness avoids showing a newly downloaded response as future.
- Rain + showers totals are converted using the supplied interval to **mm/h**;
  snow remains separate in cm/h. Particle budgets and reduced motion are intact.
  The optional disabled renderer lab also pauses stale effects, but its explicitly
  labelled town-weather comparison/manual previews remain separate.
- Weather and lighting occupy two compact panel pages. Day/local/night previews
  stay inside the time button; no dashboard shortcuts were reintroduced. Weather
  labels/header follow the confirmed location. Native location forms preserve
  44px targets and keyboard completion, with concise pages for small phones.
- Verification: **78 scene suites / 887 tests**, **8 app suites / 116 tests**, app
  and scene TypeScript, **530 PostgreSQL assertions / 11 suites** across all 21
  migrations, protocol/privacy review, and bounded scene/renderer builds pass.
  **36 browser checks** cover 320/390px phones and tablet portrait/landscape,
  current/stale/offline/reconnect, mm/h, separate age labels, no scrolling and
  lighting selection. Fresh-session browser/WebGL errors were empty; captures
  were visually inspected. Native keyboard/font-scale review remains pending.
- Final native scene: **31,788,123 bytes**, SHA256
  `62111d1f998c43a7b7770c8bc6eae04c381f50f9c22dddc0766949d08f40ab48`;
  32 MiB budget unchanged; no new dependencies or media assets.
- Evidence in work cache: `weather-scene-tests-final.log`,
  `weather-native-tests-final.log`, `weather-location-postgres-test.log`,
  `weather-staging-schema-check.json`, `weather-scene-build-final.log`,
  `weather-browser-final.log`, `property-weather/verification.json` and captures.
  The first browser run's old hot-reload errors and clock assertion were replaced
  by the clean fresh-session final run; use final evidence.
- Preview **45** Release build and strict package/signature/device coverage checks
  passed. Exact scene SHA/size match confirmed; production metadata restored and
  release version/assets/auth-redirect checks passed. Profile expiry is still
  October 11. Logs use `native-preview-build-45-final`; package receipt is
  `preview45-package-check.json`.
- Preview **45 is installed and launched** on the physical iPhone; its app listing
  confirms **1.0.0 / 45**. The initial CoreDevice 4016 connection failure cleared
  after the user connected/unlocked the phone. Receipts: `preview45-install.json`,
  `preview45-installed-app.json`, `preview45-launch.json`. Native visual/keyboard
  feedback and the Owner's actual coordinate setup are still pending; do not
  claim measured on-property weather or a completed real-location test.
  Task-owned weather browser sessions and Vite port 5184 are stopped.
- Implementation pushed as `09b4857` on `3d-home-integration`; this receipt update
  records the later successful installation.

## Contextual camera recovery (Preview 44)

- The permanent Reset button remains removed. **Recenter view** appears beside
  the view selector only after meaningful manual orbit, pan, zoom or immersive
  look, after the gesture ends. Bare taps, jitter, automatic framing and cinematic
  movement do not reveal it. It disappears when the camera returns to its default.
- Activation restores only the current view's camera, hides the action immediately
  and returns keyboard focus to the stable viewport. It preserves rooms, selected
  devices, device state and access. Normal motion is smooth; reduced motion cuts
  immediately. There is no idle camera reset. The property film still restores
  the exact prior camera, retaining recovery when that camera was displaced.
- The action stays hidden behind dialogs, quick controls, tours and unavailable
  views. Full labels and 44px targets fit 320px phones, including the four-tab
  shared-interior Guest layout. It uses the existing bottom strip without adding
  a row, scrolling or covering more model height.
- Camera thresholds are isolated in `scene/cameraRecenter.ts`; publication is
  transient and only occurs on visibility changes. Immersive focus loss and
  backgrounding release held input. The camera's authored destination now respects
  its existing zoom limits before interpolation: tall phone overviews previously
  could keep aiming beyond the 55-unit limit and never finish settling. Recenter
  compares against the actual settled default; zoom/privacy limits are unchanged.
- Verification: **71 scene files / 813 tests**, app and scene TypeScript, bounded
  web/offline scene packaging and independent code review pass. **57 browser
  checks** cover 320/390px phones, both tablet orientations, two Guest scopes,
  real pointer orbit/pan/return, targeted canvas wheel zoom, immersive keyboard
  look, tour return, focus, unchanged home state and reduced motion. No browser
  or WebGL errors. Captures were visually reviewed; physical UI review is pending.
- Evidence: work cache `recenter-scene-tests-final.log`,
  `recenter-app-typecheck.log`, `recenter-scene-build-final.log`,
  `recenter-browser-final.log`, and `recenter/verification.json` plus captures.
  `recenter/wheel-diagnosis.json` records the automation issue: CLI wheel input
  landed at (0,0), so the final zoom check targets actual canvas WheelEvents.
- Native scene: **31,781,981 bytes**, SHA256
  `5e93a1ef7f4d9d6b048735be0abe35acef2055e60cd1a5a410825af69a8007d3`;
  the existing 32 MiB budget remains unchanged. No new assets or dependencies.
- Preview **44** Release build succeeded and is installed/launched on the same
  iPhone; its app listing confirms **1.0.0 / 44**. Exact identity/schemes, strict
  signature, profile device coverage and packaged scene SHA/size match passed.
  Production metadata is restored; version/assets/auth-redirect checks pass.
  Signing expiry remains October 11. Receipts: `preview44-package-check.json`,
  `preview44-install.json`, `preview44-installed-app.json`, `preview44-launch.json`;
  build logs use `native-preview-build-44`. Physical visual review is pending.
  Task-owned browser sessions and port 5184 were stopped at that milestone.
  Older Preview sections below retain their historical evidence.

## Automatic property film (Preview 43)

- Removed the dashboard Reset and Cinematic play buttons. Eligible Home views
  now enter an **84-second looping exterior tour after 90 seconds of inactivity**:
  gate arrival/opening, driveway approach, west facade, full-property aerial,
  roof detail, east facade, and a final architectural view. The tour works from
  floor plans, property view and immersive rooms without changing saved navigation.
- The first touch/key/wheel ends the film and consumes that complete gesture.
  Exact camera position, look, zoom and target return; later real rotations still
  reframe normally. No click-through, device command or persisted gate change.
  The authored gate opening is strictly visual; interruption restores its current
  authorized device position. Tour windows are opaque and device hotspots hidden.
- Settings → Automatic property tour can disable it. Only this separate versioned
  local preference is persisted (`vantahome.cinematic-preferences.v1`). Reduced
  motion, open controls/forms, held gestures, active fire incidents, host coverage,
  hidden/background views and unavailable property access prevent idle playback.
  Access revocation stops it immediately; no broader Guest grants are added.
- Presentation uses a weather-aware sky/haze, calibrated sun/moon lighting,
  grounded surrounding terrain and subtle finish grain on owned material clones.
  Existing weather, scoped light states and adaptive quality remain authoritative.
  No new dependencies, downloaded textures, model geometry or shadow maps. This
  is cinematic real-time rendering of the existing mobile model, not an offline
  photorealistic replacement model.
- Implementation: `idleCinematic.ts`, `useIdleCinematic.ts`, `cinematicStore.ts`,
  `CinematicTourOverlay.tsx`, `scene/cinematicTour.ts`, `scene/CameraRig.tsx`,
  `scene/CinematicAtmosphere.tsx`, `scene/cinematicMaterials.ts`; integration in
  `App.tsx`, `HouseScene.tsx`, `Landscape.tsx`. Old camera controls were deleted.
  Existing browser scripts observe `data-scene-ready` instead of a removed button.
- Verification: **69 scene files / 786 tests**, app and scene TypeScript, bounded
  offline packaging pass. Browser actual idle entry occurred after 93.9 seconds;
  accelerated shot review covered 320/390px phones, tablet orientations and the
  1366px desktop preview bound. Exact orbit/immersive return, first-tap isolation,
  later/during-tour rotation, night views, Guest grant revocation, reduced motion,
  enlarged captions and opt-out persistence passed with no browser/shader errors.
- Evidence: work cache `idle-tour-tests-final.log`, `idle-tour-app-typecheck.log`,
  `idle-tour-scene-build-final.log`, `idle-tour-browser.log` (real timer check),
  `idle-tour-browser-final.log`, `idle-tour-edge-final.log`, and `idle-tour/`
  captures/verification JSON. Early harness failures were corrected (camera pose
  initialized without ending preset motion; a quoted test selector); the final
  sweeps pass. A separate code review caught and fixed permanent resize suppression.
- Final native scene is **31,776,653 bytes**, SHA256
  `1b5b97d1458e44d9605e7b6cf0c2336742d664caa651fb7e4be2b4988305151c`;
  the existing **32 MiB** budget remains unchanged.
- Preview **43** Release build succeeded, and the physical iPhone app listing
  confirms **1.0.0 / 43** after installation; the developer service launched it.
  Strict signature, exact preview identity/schemes, profile device coverage and
  packaged scene SHA/size match passed. Production metadata was restored; release
  version/assets/auth-redirect checks pass. Signing expiry remains October 11.
  Receipts: `preview43-package-check.json`, `preview43-install.json`,
  `preview43-installed-app.json`, `preview43-launch.json`; build logs use
  `native-preview-build-43`. On-device visual/performance review is not yet reported.
- The updated control-polish browser sweep also passes five responsive layouts,
  quick/full setting parity, saved brightness, off-state semantics and Celsius.
  Evidence: `idle-tour-control-polish.log`. Task-owned browser sessions and port
  5184 were stopped; retained captures/helpers are only in the work cache.

## Cinematic reference cards (Preview 42)

- Built-in image generation produced **47 local reference images** for every
  room family, all 30 device kinds and fixture variants, scene moods, and routine
  purposes. Optimized JPEGs total **1,751,527 bytes**. Assets and exact prompts:
  `assets/cinematic/README.md`, `assets/cinematic/prompts.json`.
- Shared pure selectors live in `packages/home-scene/src/cinematicArtwork.ts`;
  native presentation is in `src/features/cinematic-artwork`. Native collections,
  embedded libraries/inspector, scene chips, routine cards, search results and
  device headings now use the same visual language. Cards keep existing paging
  and touch actions; no new dependency, network request or loading gate.
- Artwork is decorative and independent of live state. Existing room grants,
  camera feeds, explicit status and action permissions remain authoritative.
  Shared scene selection uses only public identity; no extra bridge data.
- Packaging validates bounded JPEG outputs (128 KiB each / 2 MiB total), with
  the existing 32 MiB offline scene limit unchanged. Final offline scene:
  **31,758,259 bytes**, SHA256
  `4a06fa1875dbcae56dfe0f9b7d9d2d728878a676092670f940a8fcec4f7047e3`.
- Browser review found duplicate sibling keys in HouseScene; distinct lighting
  and model prefixes retain the same permission-scope reset behavior.
- Verification: **180 app suites / 2,619 tests**, **64 scene files / 748 tests**,
  **47 script tests**, app/scene TypeScript, release version/assets/redirects and
  offline packaging pass. After the key fix, 18 access/lighting/artwork tests and
  three suspension tests passed. No backend change or repeated real Guest test.
- Native browser harness: **28 captures**, including 320px phone large text and
  reduced motion; no overflow, failed images, unreachable actions or errors.
  Embedded browser: **153 checks / 19 captures**, all 20 rooms / 30 device kinds
  across phone and tablet orientations; no browser errors. Review harnesses were
  removed from the repository and owned servers/browsers stopped.
- Evidence in the work cache: `cinematic-app-tests.log`,
  `cinematic-scene-tests.log`, `cinematic-script-tests.log`,
  `cinematic-native-visual-evidence.json`,
  `cinematic-native-accessibility-evidence.json`,
  `cinematic-embedded/verification.json`. Original source PNG paths are indexed
  in `cinematic-artwork-source-paths.json`; use them to re-optimize without
  regenerating. Do not add those large originals to Git.
- Preview **42** Release build succeeded and was installed/launched on the
  physical iPhone; the device app listing confirms **1.0.0 / 42**. Exact preview
  identity/schemes, all 47 packaged images, strict signature and profile device
  coverage passed. Production metadata was restored. Signing expires October 11
  as above. On-device visual feedback for the new cards has not yet been reported.
  Receipts: `preview42-package-check.json`, `preview42-install.json`,
  `preview42-installed-app.json`, `preview42-launch.json`; build logs use
  `native-preview-build-42` and `native-preview-build-42-summary`.

## Continuous arrival and warm return (Preview 41)

Startup now uses one mounted arrival component through account preparation and
membership verification. Its artwork continues without a new intro; copy follows
real state. Once verified, controls/navigation are available while a compact
`PropertyArrival` occupies only the scene. The old native ring loader was removed.
There are no minimum animation holds, fake percentages, or new dependencies.

- Membership reads run concurrently after user/home selection; room grants wait
  only for room IDs. Any failed policy/registry read rejects the entire snapshot.
- Native packaged HTML prewarms alongside account setup. In-flight copies deduplicate;
  later calls still detect an OS-evicted cache.
- Same-account Home can retain a paused WebView/iframe for up to 45 seconds behind
  an opaque input/accessibility shield during re-verification. This is a resource
  lease, **never cached authorization**. Shared runtimes stop, frame access/catalog
  clear, native panels close, and fresh permissions reconnect the bridge.
- Failure, missing/revoked access, Guest expiry, scope change, timeout, and memory
  pressure release retained resources. Only Main/Home qualifies; no camera or
  account route is retained during a check. Queued frame navigation also requires
  live authority and an unsuspended view.
- `membershipVerification` is ephemeral and excluded from persistence. A lifecycle
  generation rejects pre-background requests that arrive after foregrounding.
- Verification: **180 app suites / 2,616 tests**, app TypeScript and release
  version/assets/auth-redirect checks pass. Independent lifecycle review found and
  repaired the stale-request race and queued-frame-navigation issue. Final logs:
  `arrival-full-tests-final.log`, `arrival-root-typecheck-final.log`,
  `arrival-release-checks.log`, `arrival-warm-guard-tests.log`.
- Real-component browser harness: preparing/checking/returning/property at
  320×568, 430×932, 768×1024, 1024×768 (16 captures), no page/internal overflow.
  Preparing→checking preserves the artwork DOM node. Motion animates normally;
  Reduce Motion freezes it. Simulated 1.5× text fits the smallest phone with
  artwork hidden and actions reachable. No browser errors; harness/browser/servers
  removed. Evidence: `arrival-consolidated-visual-evidence.json`,
  `arrival-consolidated-accessibility-evidence.json`, `arrival-consolidated-*.png`.
- Preview **41** Release build succeeded and strict signature/bundle/scheme/device
  checks passed. Installed and launched October 7; device listing independently
  confirms **1.0.0 / 41**. Production metadata was restored. The signing profile
  still expires October 11 at 06:55:16 UTC. Logs/receipts: `native-preview-build-41.log`,
  `native-preview-build-41-summary.log`, `preview41-package-check.json`,
  `preview41-install.json`, `preview41-installed-app.json`, `preview41-launch.json`.
- Native startup latency and physical Dynamic Type are not measured by these browser
  checks. The prior offline/renewal tests remain valid historical evidence; the new
  warm-return presentation still needs the user's physical review.

## Previous cinematic arrival (Preview 40)

The verification/connection fallback now has a cinematic purple arrival screen:
generic floating villa artwork, gentle light-ring motion, distinct checking and
unconfirmed-access copy, and accessible Retry/Sign out actions. The artwork uses
small SVGs, never household data or the private scene; there are no new dependencies
or artificial loading delays. Reduce Motion, background pauses, and large-text
fallbacks are preserved. Scoped sign-out now rejects duplicate taps and displays
failures without leaking feedback across accounts. Permission gates are unchanged.

- Focused verification: **46 tests / three suites**, app TypeScript, and diff checks
  passed. Independent review found no actionable security/motion regressions.
- Actual-component browser harness: checking/unavailable at 320×568, 375×667,
  375×812, 430×932, 768×1024 and 1024×768 with representative safe-area insets.
  No document or internal scrolling; actions stay visible. Reduced Motion is
  static; regular checking motion animates. Larger-text layout and approximate
  browser text scaling were checked, not physical iOS Dynamic Type.
- The exact sign-out failure copy also fits 320×568 with no scrolling. The final
  small-screen artwork is 88 px high. Temporary harness entry, both servers and
  test browsers were removed before the final native packaging run.
- Evidence in the work directory: `arrival-focused-tests.log`,
  `arrival-typecheck.log`, `arrival-visual-evidence.json`,
  `arrival-final-browser-errors.json`, and `arrival-*-safe-*.png` screenshots.
  Fresh browser reports no errors; the existing RN Web pointerEvents deprecation
  warning remains. The harness uses no accounts or backend calls.
- Preview 40 logs/receipts: `native-preview-build-40.log`,
  `native-preview-build-40-summary.log`, `preview40-package-check.json`,
  `preview40-install.json`, `preview40-installed-app.json`, `preview40-launch.json`.
  Apple initially could not see the phone; reconnecting made it available and
  installation/launch succeeded. No further reconnect request is pending.

Guest Extend/Renew implementation, staging rollout, and Preview 39 installation
are complete. Prior property sharing landed in `9ac2056`. Use
`git log -1` for the latest commit/push state rather than treating an old hash as
current.

- Latest app verification: **176 suites / 2,561 tests**, including 50 service,
  24 deadline-policy and 14 new UI tests. After final tablet/copy tweaks, 47 UI/security
  tests and TypeScript passed again. SQL: all 20 migrations / 482 checks / 10 suites.
- Hosted API passed with exact denial codes. Browser: Owner extend and renew
  succeed; expired Guest **Check access** restores the property with only Living
  room / six devices and door control still blocked. Reviewed 375×667, 768×1024, 1024×768.
- A stale-deadline RPC initially used 40001, exposing PostgREST retry behavior.
  Repaired to 22023; repeated SQL/strict hosted checks pass. No stuck extension RPCs
  remained. Final 020 SHA256: c76ba01f63ffbae32b817cd0578fb26a859db9921dc232ab9caa90dc31524a02.
- Latest logs: `guest-extension-app-tests.log`, `guest-extension-final-ui-tests.log`,
  `guest-extension-final-typecheck.log`, `guest-extension-postgres-test.log`,
  `native-preview-build-39.log` and `native-preview-build-39-summary.log`.
  Receipts: `preview39-install.json`, `preview39-installed-app.json`, `preview39-launch.json`.
  Synthetic QA home/accounts/private file removed; browser sessions and task's 5184
  Expo server closed. No real Guest renewed automatically; production unchanged.

Previous property-sharing evidence (no scene source changed for Preview 39):

- Full `npm run verify`: **2,464 app tests / 173 suites**, **738 scene tests /
  62 files**, **127 bridge tests**, **45 script tests**, app/edge TypeScript,
  dependency and release checks passed.
- Fresh isolated PostgreSQL 17: all 19 migrations and **414 checks / nine suites**
  passed. Database stopped/removed by its runner.
- Hosted staging with disposable accounts: Owner share/revoke works; Guest RPC
  self-grant and direct-column mutation rejected; six visible devices unchanged.
- Authenticated browser: Owner switch saves; Guest opens full shared upper floor
  without private hotspots; revocation returns the open tour to exterior at the
  next membership refresh; assigned Pendant light still toggles; door stays
  disabled. No browser errors. Reviewed 375×667, 430×932, 768×1024 and 1024×768.
- Remote membership edits refresh normally within 60 seconds plus network time or
  on foreground return. Store-to-renderer scope changes are immediate.
- Logs: `property-overview-verify.log`, `interior-layout-postgres-test.log`,
  `property-overview-scene-build.log`, `native-preview-build-38-summary.log`,
  `native-preview-build-38.log`, all in the work directory above.
- External QA helper: `property-overview-qa.cjs`. Its synthetic `@example.invalid`
  accounts/home and temporary private credential record were removed October 7.
  No active task-owned browser sessions or port 5177 server remained at cleanup.
- Install/launch receipts: `preview38-install.json`, `preview38-installed-app.json`,
  `preview38-launch.json`, in the work directory. These establish installation
  and launch, not a physical UI review.

## Resume next

1. Review the latest installed Preview listed above, including idle tour entry,
   touch return and the cinematic reference cards. Next permission check remains
   Owner shared-interior consent and Guest layout/revocation.
   Guest renewal and offline/reconnect with retained door restrictions already
   passed by the user's report; do not repeat them.
2. Other physical checks: online background/resume, warm recovery,
   explicit invitation-link routing, and observed Guest deadline expiry.
   Do not represent automated/browser results as physical-device results.
3. Continue work from relevant source/tests and cached evidence; do not rerun all
   checks or rediscover the repository merely to resume. Recheck volatile state.

Detailed references: [Room access](ROOM_ACCESS.md),
[Guest access extensions](GUEST_ACCESS_EXTENSIONS.md),
[Auth redirects / build recipe](AUTH_REDIRECTS.md),
[Invitations](INVITATION_ONBOARDING.md),
[Dependency patches](DEPENDENCY_SECURITY.md).
