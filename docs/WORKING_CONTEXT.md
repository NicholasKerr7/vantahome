# VantaHome working context

Last maintained: **2026-10-07**. Read this before rediscovering the project.

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

- Staging Supabase: `dcevusczjtmdpzrxpdou`. Migrations **001–020** applied only here.
  019 adds owner-only interior consent; 020 adds checked Guest deadline changes.
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

1. Preview 40 is installed for visual review; no repeated Guest renewal/offline
   test is needed merely to see the redesign. Next permission check remains Owner
   shared-interior consent and Guest layout/revocation.
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
