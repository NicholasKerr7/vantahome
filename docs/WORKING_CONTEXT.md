# VantaHome working context

Last maintained: **2026-10-18**. Read this before rediscovering the project.

Track remaining work and deeper implementation opportunities in the maintained
[implementation backlog](IMPLEMENTATION_BACKLOG.md). Update it at meaningful
milestones; preserve explicit hub/sync/iPad deferrals and distinguish verified
defects from ideas or untested risks.

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
  hub direction. The 20-space/92-authored-device model and up to 32 household-added
  fixtures are simulation-only.
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

## Dashboard shell focus outline — October 18 / Preview 78 installed

- At the user's request, removed the unintended purple outline around the whole
  property panel with one documented CSS rule:
  `#house-preview[tabindex='-1']:focus { outline: none; }`. The stable programmatic
  focus-return target remains; canvas, buttons and hotspots retain their outlines.
  No TypeScript, logic, layout, state or security behavior changed.
- **10 existing RecenterViewControl / SceneViewControls tests**, scene TypeScript
  and web/native builds passed; focused review found no issues. Evidence:
  `work/dashboard-shell-focus-tests.log`,
  `work/dashboard-shell-focus-scene-build.log`,
  `work/dashboard-shell-focus-preview78-build.log`.
- Browser verification stopped when the CUA transport closed, including after
  a bounded reconnect attempt. **No new visual verification or screenshot was
  completed.** Preview 78 built, passed signature/staging/scene hash and exact
  shell-rule verification, and installed and launched on the iPhone. Apple
  inventory confirms **1.0.0 (78)**, now latest installed. The scene is
  **31,986,128 bytes**, below 32 MiB; production metadata was restored. Evidence:
  `work/dashboard-shell-focus-preview78-{package,devices,install,apps,launch}.json`.
  Next: verify Recenter and exit from the idle tour show no shell
  ring, then use the keyboard skip link → Tab and confirm the canvas still has a
  focus ring. Physical acceptance and the climate checks below remain pending.

## Centered climate layout in embedded Home — October 18 / Preview 77 installed

- Corrected the CSS layout against the Expo embedded Home surface, whose native
  chrome leaves less scene space than the earlier standalone browser checks.
  Sheet padding is 14px/12px (from 22px/20px), sheet/workspace gaps are 8px/6px,
  and stage padding is 4px/8px. The centered 208px ring remains: a middle layout
  at stage heights ≤536px uses an 8px console gap and 12px padding, trimming the
  decorative vent to fit 494px tall; only ≤500px uses the 140px ring and 378px
  compact console.
- Embedded browser verification allowed 96px for native safe areas from a
  440×956 phone: host **440×860**, iframe **440×723**, stage content **560.75px**,
  console **531px**, ring **208px**. It has no overflow and all 14 targets are
  ≥44px. Boundary hosts 440×836/835 yield 537/536px stages and 531/494px consoles;
  440×794/793 yield 501/500px stages and 208/140px rings. Other passing hosts:
  428×832, 414×805, 390×748, 375×716, 768×928 and 1024×720.
- The **320×568 host retains its pre-existing 103px internal stage overflow**,
  with no page overflow. Keep the accessible internal scroll fallback; these
  results do not establish a scroll-free layout at every size. The earlier
  Preview 76 standalone sweep did not include this embedded-chrome constraint.
- The **8 ClimateControlPanel tests**, scene TypeScript and web/native builds
  passed; a focused CSS review found no findings. Embedded browser power/target
  interaction passed from off at 22°C to on at 23°C, and More/Back restored focus,
  with zero error logs. Evidence:
  `work/climate-centered-{viewports.json,browser-acceptance.json,iphone.png,
  tests.log,scene-build.log}`. No control logic, authorization, persistence,
  device commands or dependencies changed.
- **Preview 77 built, passed package verification, and installed and launched on
  the iPhone.** Apple inventory confirmed **1.0.0 (77)** at that milestone;
  Preview 78 now supersedes it.
  Signature, Preview identity/schemes, staging configuration, exact scene hash,
  both new layout thresholds and fixture exclusion passed; the scene is
  **31,986,079 bytes**, below 32 MiB. Production metadata was restored. Evidence:
  `work/climate-centered-preview77-build.log` and
  `work/climate-centered-preview77-{package,devices,install,apps,launch}.json`.
  Physical centered-layout and controller acceptance remain pending: check fit
  and interactions, then matching Home/Devices settings and close/reopen retention.
  Physical iPad testing, hub execution and household sync remain deferred.

## Climate spacing correction — October 18 / Preview 76 installed

- The user reported that Preview 75's orb and temperature buttons felt too close,
  and the target caption was crowded. Adjusted only the embedded web controller's
  CSS: the regular 208px orb retains its size with 15px of face-to-key clearance;
  the compact 140px orb has 8px. Temperature keys remain 44px. The target caption
  is centered on two lines at 9px normally and 8px compact (previously 6px compact).
  Its 536px compact threshold was verified only in the standalone scene App;
  it did not retain the full ring under embedded native chrome. Preview 77's
  tiered correction is recorded above.
  Device state, native controller styling, permissions and persistence are unchanged.
- This correction passed the **8 existing ClimateControlPanel tests**, scene
  TypeScript, and scene web/native builds. A focused read-only review reported no
  findings. The standalone scene App browser sweep covered **11 viewport profiles** from
  320×568 to 1440×900: all 14 controls remained at least 44px, with no overlap,
  page/stage overflow or caption escape from the orb. Temperature increase
  **23 → 24** and decrease **24 → 23** passed, with zero console errors. This is
  new spacing evidence, separate from the original 212-test feature verification
  below. Evidence: `work/climate-spacing-{viewports.json,browser-acceptance.json,
  phone.png,tests.log,scene-build.log}`.
- **Preview 76 built, passed signature/staging/packaged scene hash verification,
  and installed and launched on the iPhone.** The packaged native scene is
  **31,985,826 bytes**, below 32 MiB; production build metadata was restored.
  Apple app inventory confirmed **1.0.0 (76)** at that milestone; Preview 77
  supersedes it above.
  Evidence: `work/climate-spacing-preview76-build.log` and
  `work/climate-spacing-preview76-{package,devices,install,apps,launch}.json`.
  Physical spacing/fit and full climate-controller acceptance remain pending.
  Acceptance status: `work/climate-spacing-preview76-acceptance.json`.
  Follow the Preview 77 centered-layout correction above before the remaining
  Home/Devices and close/reopen checks. Simulation-only staging scope, reduced-motion behavior
  and the iPad physical testing deferral remain in force.

## Climate controller — October 17 / Preview 75 installed, iPhone acceptance pending

- Added the climate controller to Home full controls and the native Devices
  inspector. Target temperature, Cold/Fan/Dry mode, fan speed, swing and
  Normal/Eco/Quiet/Turbo airflow presets stay together; **More** retains the
  existing advanced controls. The controller displays saved targets and a visual
  airflow preview, not a fabricated room-temperature reading.
- Both surfaces use the existing catalog, guarded controls and local persistence.
  Relative temperature steps of 1°C and fan steps of 10% reduce current state,
  clamp to 15–28°C and 0–100%, and preserve power. Manual fan adjustments clear
  airflow presets; Normal clears all three preset flags atomically. Off-state
  adjustments remain off. Scope, membership, hydration and save-recovery guards
  remain in force; no new permission or real AC command path was introduced.
- The account's Celsius/Fahrenheit preference is presentation-only on both
  surfaces. The scoped preference bridge covers delayed hydration and account
  recovery; stored targets remain Celsius, and Fahrenheit controls describe the
  actual 1.8°F equivalent step.
- Verification: **147 scene tests / 8 suites**, **48 native tests / 4 suites** and
  **17 host tests** passed (**212 distinct focused tests**), covering the climate
  panel, shared actions, TV regressions and presentation/preference bridge.
  Final `npm run lint` and scene web/native builds passed; the native scene bundle
  is **30.5 MiB**, below 32 MiB.
- Standalone scene App browser checks passed **11 viewports**, from 320×568 to
  1440×900: all 14 controller controls were at least 44px, with no overlap or page
  overflow. Reduced-motion checks found no controller animations/transitions.
  More/Back restored focus; rapid relative steps, mode/preset/swing changes and
  off-state preservation passed. Reload restored **25°C, Dry, fan 70%, Horizontal,
  Quiet**. Evidence: `work/climate-viewports.json`,
  `work/climate-browser-acceptance.json`, `work/climate-mobile-final.png`.
- **Preview 75 built and passed package verification:** signature,
  `com.anonymous.vantahome.preview` identity/build 75, Preview URL schemes,
  staging-only configuration, exact packaged scene hash and **31,985,650 bytes
  (30.5 MiB)** below 32 MiB. Web/native climate and TV markers are present; QA
  fixtures are excluded. Production build metadata was restored. Evidence:
  `work/climate-preview75-build.log`, `work/climate-preview75-package.json`.
  At the user's subsequent request, the existing package was reverified and
  **Preview 75 installed and launched on the iPhone**. Apple app inventory confirms
  **1.0.0 (75)**. Receipts: `work/climate-preview75-{devices,install,apps,launch}.json`.
  Physical climate acceptance remains pending: the user has been asked to check
  Home → Primary suite → Air conditioning → Full controls for comfortable fit,
  power, repeated temperature/fan presses, modes, presets, swing and More/Back.
  The October 18 spacing report and installed correction are recorded above.
  Continue physical checks after the Preview 77 layout correction is installed,
  then verify matching Home/Devices settings and
  close/reopen retention, including remembered settings while powered off. iPad
  physical testing remains deferred. Simulation-only staging scope and the
  no-hub boundary remain unchanged; production is unchanged.

## Tactile TV remote — October 17 / Preview 74 iPhone acceptance complete

- Replaced the primary paginated TV controls with a code-rendered, sculpted remote
  in both Home hotspot full controls and the native Devices inspector. Its common
  keys stay together; **More** retains the advanced controls, routines and status
  pages. The shell uses the existing styling systems, without a generated image,
  additional renderer or dependency. Touch targets, keyboard focus and reduced
  motion remain supported.
- Both surfaces use the same catalog and guarded, persisted simulation actions.
  Added Back (dismiss the selected preview tile, then return to the sample Home
  menu) and relative volume steps of five, bounded to 0–100 while preserving power,
  mute and playback. Source and playback actions remain local previews; no provider
  app, stream or real TV control is implied. Household permissions are unchanged.
- Verification: **134 scene tests / 7 suites**, **31 native tests / 3 suites**,
  app/scene TypeScript and scene build passed. Actual App browser checks covered
  ten viewports from 320×568 to 1440×900: all 21 remote keys were at least 44px,
  with no overlap or page overflow. Reload preserved YouTube, volume 40, power on
  and playing; More/Back restored focus correctly, and fresh-load console errors
  were zero. Evidence: `work/tv-remote-{web-tests.log,native-tests.log,viewports.json,
  mobile-final.png,scene-build.log,browser-acceptance.json}`. The editing suite
  retains its existing non-failing decorative-motion async-act warning; the
  remote and pagination suites pass cleanly when run separately.
- Preview 74 built and passed signature, Preview URL-scheme, staging-domain,
  native/web remote marker and packaged scene hash/size checks: 31,969,107 bytes,
  below 32 MiB. Evidence: `work/tv-remote-preview74-{build.log,package.json}`.
  Production build metadata was restored. At the user's subsequent installation
  request, the iPhone became available and Preview 74 installed and launched.
  Apple app inventory confirms **1.0.0 (74)**. Receipts:
  `work/tv-remote-preview74-{devices,install,apps,launch}.json`. This supersedes the
  earlier unavailable-device status. The user confirmed the Home TV remote fits
  comfortably and responds correctly through power, repeated volume presses,
  mute/unmute, directional ring/OK/Back, and More/Back, without jumping or clipping.
  The user then confirmed Home and Devices show the same source, volume and paused
  state, and those settings survive fully closing/reopening the app. The planned
  iPhone remote acceptance is complete by user report. Evidence:
  `work/tv-remote-preview74-acceptance.json`. iPad/Android physical checks remain
  separate; no broader performance or physical TV-control claim is implied.

## Arrow-free scenes and quieter Home returns — October 17 / Preview 73

- Removed only the dashboard scene arrows. The cards use the full row with native
  horizontal momentum, drag support and contained overscroll. Phones show two
  cards at 145–200px in the tested widths; tablets show up to four. Keyboard users
  can browse with Left/Right/Home/End; Tab and explicit activation remain native.
  Reduced motion, focused-card resize/reorder/deletion recovery, and protection
  against a swipe's trailing click are covered. Other device/room arrows remain.
- The user clarified that the apparent Home restart is the VantaHome launch film
  followed by Home, not a reported process crash. A confirmed source path matched:
  after 45 seconds away, graphics retention releases the renderer; its next loading
  publication incorrectly triggered the root launch film. Initial arrival now
  completes once per account/session/home admission. Subsequent renderer reloads
  show the quiet local property placeholder with navigation available.
- Both retention budgets remain 45 seconds. Membership checking/failure still
  shields the home independently; a new account/session/home resets initial
  arrival. Generation-scoped leases reject stale callbacks even across A → B → A.
  Error/retry and rendering-readiness behavior remain intact. Background membership
  rechecks can still remount navigation under the existing privacy policy; this
  change does not diagnose every possible process termination or route reset.
- Verification: **75 scene tests / 5 suites**, **137 native/root lifecycle tests /
  6 suites**, app/scene TypeScript, web/offline scene build and independent read-only
  lifecycle review. Browser checks passed eight phone/tablet/desktop-preview sizes,
  swipe, focus, Home/End, reduced motion and one explicit click. No page overflow or
  remaining scene arrows; no gesture-triggered run. New final-load checks had no
  console errors; earlier development hot-refresh errors are not a crash diagnosis.
- Evidence: `work/scene-swipe-only-{focused-tests.log,viewports.json}`,
  `work/home-arrival-{focused-tests,typecheck}.log`,
  `work/scene-swipe-home-return-build.log`, and `work/scene-swipe-*.png`.
  The synthetic catalog fixture was removed from the repo after browser checks.
  Preview 73 built and passed signature, Preview URL-scheme, staging-domain, and
  packaged scene hash/size verification (31,952,122 bytes, below 32 MiB); fixture and
  scene-arrow controls are excluded. Package evidence:
  `work/scene-swipe-preview73-{build.log,package.json}`.
- **Preview 73 installed and launched on the iPhone** after the user explicitly
  requested installation. Apple app inventory confirms **1.0.0 (73)**; the process
  was present after launch. Receipts: `work/scene-swipe-preview73-{install,apps,
  launch,process-before,process-after}.json`. This supersedes the earlier
  installation deferral. The user confirmed both Home → Devices for 5 seconds →
  Home and the 60-second foreground/screen-awake repeat return without the launch
  animation, with navigation working. Before/after process inventory independently
  showed the same app PID, **62534**, supporting process continuity during this
  bounded test. Evidence: `work/scene-swipe-preview73-acceptance.json`.
  Return-to-Home physical acceptance is complete by user report; scene-swipe feel
  remains separately unreported. A cold launch and background membership recheck
  are different paths; this is not a general crash/performance certification.

## Responsive dashboard scene cards — October 17 / Preview 72 (superseded by 73)

- Fixed the reported mobile scene-card collapse. With more than four saved scenes,
  a later legacy `has-scene-pages` CSS rule overrode the horizontal scroller's grid:
  the actual seven-scene embedded fixture reproduced three **6px-wide** buttons.
  Removed the competing track definitions and duplicate spacing rules.
- The row now measures its available width, label and arrow space. Typical phones
  show two readable cards (130px at a 390px embedded viewport), narrow phones show
  one, and tablets show up to four. Existing arrows and native horizontal momentum
  move the same cards; no vertical page scrolling. Empty/failed states, current
  scene artwork, bounded rendering and reduced motion remain intact.
- Pagination follows scene identity through resize, reorder and deletion. Focus is
  captured before catalog reconciliation so moving a focused card to a distant
  page cannot unmount it. Swiping/paging never executes a scene; explicit activation
  still sends exactly one request. Scene persistence/permissions are unchanged.
- Verification: **70 tests / 5 suites**, scene TypeScript and offline/web scene
  build; actual App/CSS browser checks at eight embedded viewport sizes spanning
  phone, tablet portrait/landscape and desktop preview, with synthetic saved
  catalogs (4, 5 and 7 scenes). Checked arrows, direct dragging, final partial page,
  focused scene continuity on rotation, reduced-motion alignment, and the phone
  landscape orientation message. No document overflow; touch targets >=44px.
  A clean-tab load/resize/phone-rotation round trip had no console errors; earlier
  hot-refresh teardown errors did not reproduce in that flow. Physical
  iPhone/Android/iPad behavior is not newly verified by these browser checks.
- Evidence: `work/scene-card-layout-{tests,build}.log`,
  `work/scene-card-layout-viewports.json`, `work/scene-cards-*.png`; the temporary
  browser fixture is retained only in `work/scene-cards-qa.{html,ts,css}`, excluded
  from the app. Preview 72 final package verification is recorded in
  `work/scene-cards-preview72-package.json`; installation is **deferred at the
  user's explicit request** ("Install later"). Preview 71 remains installed.

## Vanta home assistant — October 16–17 / Preview 71

- **Bounded actual Member acceptance complete by user confirmation:** the user
  invited a separate **Test Member** account through the Owner's Household flow,
  preserving the existing Guest. They confirmed email delivery, the **Member** role,
  visible Create scene button, and saving **Member evening** for only the Living
  room Pendant light, On at 30%, with the light remaining off. Manual creation and
  save-without-execution passed by user confirmation. Explicit Run then set it to
  30%; the user confirmed the scene and light state survived fully closing and
  reopening. The user also confirmed AI draft **Member calm**, one light On at 20%:
  Review → Create left the light at 30%, and explicit Run applied 20%. This completes
  the planned Member checklist for the default-permission test account. No provider
  output or device state was independently inspected; broader override combinations
  and independent security review remain separate. The Guest account was preserved.
  See HOME_CONCIERGE.md. No account role was changed by the agent.
  Two explicit Member success cases now cover AI draft saving and manual scene
  creation/reopening/explicit Run request; **40 tests / 3 suites** pass. The editor
  and store are real, membership is a fixture and execution is mocked. Evidence:
  `work/concierge-member-scene-tests.log`. Physical manual/AI creation, explicit Run
  and local restart persistence passed by user report; see
  `work/concierge-member-live-acceptance.json`.
  App TypeScript and diff checks pass. Existing collection tests emit async
  reduced-motion `act` warnings. Only tests and documentation changed; no rebuild.
- **Bounded Guest AI acceptance complete by user report:** the existing focused
  automated checks passed **134 tests / 8 suites**, including room-limited context,
  layout-sharing isolation, withheld scene authority, Guest expiry, account switches,
  late responses, one-use review
  tokens, server reauthorization and forbidden proposals. Evidence:
  `work/concierge-guest-restrictions-tests.log` (129/7) and
  `work/concierge-guest-handoff-tests.log` (5/1). No code changes or new deployment.
  **First physical result passed:** user signed in as the existing Guest and
  confirmed Living room-only Home brief with no previous Owner answer. Evidence:
  `work/concierge-guest-live-acceptance.json`. On October 17 the user clarified
  that the reported missing Member scene-creation button was observed while still
  signed in as **Guest**. This is the expected default restriction, not a confirmed
  Member defect. Current client/server rules grant Member `automation.manage` by
  default; explicit denials and current-session checks still apply. No grants or
  code were changed during Guest acceptance; the later actual Member login and
  manual creation results are recorded above.
  **Additional physical results, October 17:** the comfort-only Living room scene
  request was unavailable, with explicit user confirmation of no Review scene
  button, saved scene or light change. The primary-bedroom lights question returned
  that the room was not listed, by user report; the full answer was not independently
  inspected. The mixed scene/front-door request subsequently returned scene
  drafting unavailable, by user report. Returning to Owner restored Owner options
  and cleared the Guest answer and draft. This completes the planned bounded live
  checklist for the existing Guest; mixed-prompt output/device state were not
  independently inspected. Keep the isolated scene-denial result distinct from
  the safety-device exclusion enforced for every role. Other role/override
  configurations, broader answer quality/cost and independent review remain
  outside this acceptance. No app rebuild, grant change or new deployment needed.
  Do not infer account identity or output contents from payload-free logs. See the
  compact checklist in HOME_CONCIERGE.md.
- **Live connection accepted / Preview 71:** the user added API credit privately,
  confirmed the balance updated and live answers now work. Independently verified
  two staging **HTTP 200 / `answered`** operations: **6,411 ms**
  (`75a383cc-f7e1-4462-b37e-c8abcfec5bc5`) and **12,062 ms**
  (`8137c784-fc55-4d00-8f50-e9ab6f5755f9`). This outcome follows structured-response
  validation and a fresh identity/home-permission check; it is a real provider
  answer, not merely availability. No answer content, payment details or key was
  inspected/retained. Evidence: `work/concierge-live-answer-acceptance.json`.
  Billing blockage is resolved; no new key, permission expansion, deployment or
  iPhone rebuild was needed after funding. The user also confirmed the full
  **Review scene → Create → explicit Run scene** physical test: "Living room
  evening" targets only the Living room Pendant light, on at 30%, leaving other
  devices/settings unchanged. Creating does not execute; explicit Run applies the
  requested setting. Initial live answer and scene-flow acceptance are complete.
  The bounded Guest live checklist was subsequently completed as recorded above.
  The two timings are observations, not a performance benchmark; broader role
  configurations and quality/cost remain unmeasured.
- **Live Send diagnosis:** the user confirms Preview 71 now shows Home brief.
  Availability succeeds (`200 availability_checked`), but Send fails. Staging
  `home-concierge` v3 added bounded provider error classification: fixed categories
  and HTTP status only, never provider messages, keys, prompts or answers.
  The user's retry confirms **`provider_quota_http_429`** (2,746 ms,
  request `79331a3d-f613-42b3-8026-d27385f8ebb5`). OpenAI receives the request but
  rejects it for credit/spend quota. The user initially reported existing credit.
  Follow-up **v4** diagnostics resolve the ambiguity: **`provider_quota_credit_balance_http_429`**
  (2,405 ms, request `22993b0b-f30f-4ed1-9911-9d89beb19d8b`). The OpenAI billing
  page eventually loaded and independently shows **Free trial / $0.00 API credit**
  for the **Personal** organization containing VantaHome Staging. Key metadata
  shows Active and Responses Write. Evidence: `work/openai-staging-billing-zero.png`.
  This historical zero-balance blocker was resolved when the user privately added
  credit, as recorded above. No key replacement or permission expansion was needed.
  This server-only diagnostic update works with Preview 71, without a new build.
  Refined exact quota codes in **v4 ACTIVE, JWT verification enabled** to identify
  credit balance, project spend, organization spend/usage or billing limits when
  the provider supplies that code. Generic insufficient-quota remains generic.
  **78 provider/handler tests / 2 suites**, Edge TypeScript, tracked-file secret
  scan and diff check pass. Evidence: `work/concierge-provider-diagnostics-tests.log`.
  The v4 physical Send produced the exact credit-balance failure recorded above.
- **Connection recovery fix / Preview 71:** the Owner reported Check connection
  remaining at Home information unavailable. The assistant rejected the actual
  signed-in default (`realtime.enabled: true`, empty `wsUrl`) even though no hub
  transport was configured. It now matches the existing simulation editor's
  no-hub rule; a configured enabled socket or MQTT still blocks this AI slice.
  Endpoint changes invalidate pending answers/reviews. Retry also reconnects an
  unavailable local simulation session before checking cloud configuration.
  Generic server failures now use temporary-service copy rather than claiming
  the key is missing. No key/permission/backend changes were required for this fix.
  Verification: **85 assistant tests / 7 suites**, app TypeScript and diff check
  pass. Six new tests use the real hook/client/session/persistence, covering cold
  hydration, StrictMode reopening, the signed-in default, failed-read recovery
  with exact saved values, corrupt-cache rejection and stale household reads.
  The prior tests substituted an already-ready simulation and missed this boundary.
  **Preview 71 built, installed and launched** on the connected iPhone. Signing,
  staging endpoint, assistant markers, absence of the provider key/endpoint from
  the app, original arrival assets and unchanged scene hash passed package checks.
  Production metadata was restored; release version/assets/auth-redirect checks
  and tracked-file secret scan passed. Evidence: `work/concierge-fix-tests.log`,
  `concierge-preview71-package.json`, and build/install/launch receipts.
  The user confirmed Home brief appears; the later credit addition and live answer
  verification are recorded above.
- **Live activation now authorized:** the user subsequently asked to connect OpenAI
  and test in the app. Created the separate OpenAI **VantaHome Staging** project
  (`proj_KNfFzIjQlgpdkOHyQQc6ooWu`). Prepared a user-owned key named
  **VantaHome staging concierge**, Restricted, Responses Write (UI reports two
  effective permissions), 30-day expiry. On October 16 the user confirmed privately
  creating/copying it into staging Supabase and closing the reveal dialog. CLI
  secret-name-only verification confirms `OPENAI_API_KEY` exists; no model override
  is configured. Do not inspect the key or clipboard. The later billing resolution
  and real app answer verification are recorded above.
  Chrome API Keys tab `1394035335` and staging diagnostics `1394035341` are temporary;
  recheck state. Evidence: `work/openai-staging-key-prepared.jpg`.
  The real-answer and one-device scene-draft checks passed as recorded above.
  Availability alone checks configuration
  presence, not provider readiness. The user completed funding privately.
  Review server metadata and the user's iPhone result; preserve
  separate Review/Save/Run and Guest restrictions. Preview 71 distinguishes
  temporary failures from missing configuration; staging diagnostics now classify
  provider failures without logging private payloads.
- The user chose **build now; connect AI later**. The existing dashboard microphone
  now opens a purple **Home intelligence** panel with **Ask / Controls**. The local
  brief reads actual permitted simulation snapshots; existing typed/spoken controls
  remain available. No API key, provider account, billing or real model call was made.
- Ask is prepared for one explicit question and a reviewable comfort-scene draft.
  Prompt chips and dictation fill the composer; only Send shares the question and
  permitted names/settings. Without a provider key it clearly says AI is not
  connected. No cameras, safety/access controls, profiles, coordinates, occupancy
  or history are automatically included. See [design and setup](HOME_CONCIERGE.md).
- The server uses caller JWT/RLS, current permissions, bounded structured output,
  persistent request budgets and a fixed OpenAI endpoint. It has no model tools or
  command execution. Account/home/grant changes and backgrounding cancel requests;
  responses/review expire after 60 seconds. Guest restrictions remain in force.
- Review opens the ordinary scene editor through a one-use in-memory token. Nothing
  saves or runs automatically. Save preserves explicit suggested/edited fields;
  brightness-only proposals cannot acquire power, and TV power cannot acquire
  channel/volume defaults. Running the saved scene remains a separate action.
- Adjacent review fixed stale review tokens erasing newer drafts, cancelled promise
  rejection handling, foreground availability refresh and small-phone keyboard
  layout. The component is lazy-loaded; no dependency was added. Current shared
  scene/routine sync and hub work remain deferred.
- **Staging only:** deployed `home-concierge` version 1 with JWT verification.
  Provider key absence and unauthenticated HTTP 401 verified. Receipt:
  `work/concierge-staging-deployment.json`. No database migration or production
  change. Authenticated live AI quality/latency/cost remains untested until connected.
- Verification: app/Edge TypeScript; **3,768 app tests / 254 suites** full regression
  pass, then **113 final focused tests / 10 suites** after keyboard and exact-editor
  refinements. The latter includes eight real handoff/editor tests. **20 browser
  cases** cover phones, tablet orientations, enlarged text, disconnected/answer/error
  states, direct controls and five keyboard-padding layouts. These use explicit
  answer/simulation fixtures, not live AI. Secret scan and diff checks passed.
  Evidence: `work/concierge-*`, `assistant-ui-*` and `assistant-keyboard-*`.
- **Preview 70 installed and launched** on the connected iPhone; inventory confirms
  **1.0.0 (70)**. Signature, device provisioning, staging endpoint, assistant bundle
  markers, arrival assets and exact scene hash verified. Scene remains **31,949,595
  bytes**, SHA256 `3620096e05a8a92c1c0afda2244868735a0ff2b3fd87d28659b94c303e1a9174`.
  Receipt: `work/concierge-preview70-package.json`. Production metadata was restored;
  release version/assets/auth-redirect checks passed. All temporary browser probes
  and task-owned servers were removed. Physical dictation and keyboard feel remain
  user review; physical iPad testing remains deferred.

## Actual card scrolling — October 15 / Preview 69

- **Correction:** the user rejected Preview 68's footer-only page rails. They
  meant the cards themselves should scroll. Those rails and their hooks/styles
  are removed; preserve ordinary page counts and existing Previous/Next buttons.
  Preview 68's evidence remains in `work/smooth-scroll-*`, but is superseded.
- Actual room/device/scene/routine cards, assigned-room cards, scene shortcuts,
  starter presets and add/edit-device choices now move horizontally beneath the
  finger. Previous/Next scrolls the same card surface. The dashboard and collection
  heights stay bounded; full device-control forms/sliders retain their own inputs.
  The separate AI task is now delivered above; live provider connection remains deferred.
- Native FlatList paging supplies momentum; scene cards use native horizontal
  overflow/snapping with mouse-drag support. Scope/count/layout changes cancel old
  gestures. Dragging cannot activate cards or Run/control actions; offscreen pages
  are excluded from focus/accessibility. Only nearby scene content renders, native
  pages are virtualized, and per-frame offsets stay outside React state.
- Reduced motion disables programmatic travel while preserving direct scrolling.
  Existing inspector focus/selection survives responsive repartition. Preset and
  device selection remain valid when the final page shrinks. No dependencies,
  backend/schema changes or live household mutations.
- Verification: app/scene TypeScript, **3,609 app tests / 245 suites**, **1,166 scene
  tests / 97 suites**, and scene packaging passed. **15 browser cases** (9 RNWeb,
  6 scene) passed at 320×568, 390×844, 768×1024 and 1024×768, including enlarged
  text and reduced motion. Actual touch drags visibly moved cards; wheel/mouse and
  buttons moved that same surface; action isolation, hidden-page focus protection,
  search resets, no page overflow and no JavaScript errors were checked.
  Tests cover scope/layout cancellation; browser checks used simulation fixtures.
- Evidence: `work/card-scroll-qa-summary.json`, `card-scroll-native-browser.json`,
  `card-scroll-scene-browser.json`, `card-scroll-app-tests.log`,
  `card-scroll-scene-tests.log`, and associated screenshots. Temporary probes and
  task-owned servers/browser were removed. Physical iPhone gesture feel remains
  user review; iPad physical testing remains deferred.
- **Preview 69 installed and launched** on the connected iPhone; inventory
  confirms **1.0.0 (69)**. Signature, device provisioning, staging endpoint, arrival
  media and exact packaged scene checks passed. Scene: **31,949,595 bytes**, SHA256
  `3620096e05a8a92c1c0afda2244868735a0ff2b3fd87d28659b94c303e1a9174`.
  `work/card-scroll-preview69-package.json` records verification. Production build
  metadata was restored; release version/assets/auth-redirect checks passed.
  Production, hub and real-device control remain unchanged.

## Cleaner hotspot controls — October 15 / Preview 67

- Removed the pasted decorative device-photo layer from both mobile hotspot quick
  controls and full-controls headers on all viewports. Names, icons, truthful
  status, sliders, edit/close actions and permission checks stay intact.
- Removed the unused scene `identity` artwork variant and its CSS. Card/background
  imagery elsewhere is outside this targeted cleanup. No state, schema, persistence
  or device-behavior changes.
- Updated existing artwork assertions; **163 tests / 5 focused scene suites** and
  scene TypeScript/build passed. Browser checks at 390×844, 768×1024, 1024×768 and
  320×568 confirmed image-free headers, usable power/brightness/full-control
  actions, 44px close targets, no overflow and no JavaScript errors. The standalone
  scene tests are simulation checks, not authenticated iPhone interaction tests.
  The task-owned browser server was stopped.
- **Preview 67 installed and launched** on the connected iPhone; inventory confirms
  **1.0.0 (67)**. Signature, device provisioning, preview identity, staging endpoint,
  arrival assets and packaged scene verification passed, including absence of the
  removed identity-artwork variant. Scene: **31,940,035 bytes**, SHA256
  `87a5d67c72ad8ddef85fba1c09b2162ab5511e9b5495bc638c0087f6de7524e2`.
  Production metadata restored; release/version/assets/auth checks and secret scan
  passed. No backend changes. Physical visual acceptance remains user review.
  Evidence: `work/hotspot-artwork-*`.

## Saved-device editing — October 15 / Preview 66

- Added **Full controls → Edit device** for saved custom fixtures, from both the
  property hotspot inspector and native device library. Verified Owners/Admins
  can rename, move to a compatible room, reposition, rotate and adjust supported
  mounting height through **Details → Place → Review**. The preview omits the
  old fixture pose; closing returns to the retained property or original controls.
- Editing updates the existing registry row, UUID, model ID and template. It never
  deletes/recreates the device or submits control settings. Membership refresh and
  simulation reconciliation preserve same-ID power, levels, color and capability
  settings; fresh room grants determine visibility and controls after a move.
- Additive staging migration **027** implements server-owned revisions and atomic
  compare-and-save, with permanent private request receipts. Direct writes cannot
  forge revisions or replace fixture identity/template. Concurrent edits report a
  conflict; retry cannot overwrite a newer edit or resurrect a removed device.
  Applied only to staging; privileges and guards verified. Receipt:
  `work/device-edit-staging-deployment.json`; source SHA256
  `47430605902918bf649a23878aa3e83cb240266032f5ee0e7e227c01fbeaf10d`.
- Account/home/device-scoped journals preserve the exact submitted edit before
  networking. Uncertain results resume the same request after reopening; success
  waits for a fresh authoritative registry. Confirmed conflicts offer explicit
  reload. Pre-write biometric cancellation leaves the draft editable; an uncertain
  retry cannot be unlocked by cancellation. Removed fixtures have a clear exit.
- Adjacent fixes: revoked custom quick/full controls no longer dereference missing
  catalog records; native edit parsing no longer imports browser-only code; stale
  edit callbacks cannot cross household/session boundaries; inspector/removal keys
  are distinct. Editing grants are presentation hints, rechecked by host and RPC.

Verification: **3,580 app tests / 243 suites**, **1,155 scene tests / 96 suites**,
**809 SQL assertions / 17 suites**, and real two-connection edit/delete races
passed. Additional final editor/native-entry/host tests: **30 / 3 suites**
(including 15 new native-entry cases); pagination checks also passed. Browser UI checks captured 30 screens across
phone, tablet portrait/landscape, 320×568, enlarged text, retries and conflicts,
with no overflow or page errors. These use fixture identities/mocked services,
not a live Owner session. App/scene TypeScript and scene packaging passed.
The rebuilt embedded scene also verified that Owner Edit emits one validated
navigation intent, Guest grants hide it, and brightness remains unchanged with no
device-control patch or page errors. Temporary probes were removed and owned
servers stopped. Detailed evidence: `work/device-edit-*` and `work/edit-device-*`.

**Preview 66 installed and launched** on the connected iPhone; installed inventory
confirms **1.0.0 (66)**. Strict signature, device provisioning, preview schemes,
staging endpoint, four arrival assets and packaged scene bytes/hash passed.
Scene: **31,940,702 bytes**, SHA256
`b7d3974b7fda51edeaa36e5ba03335a134dbce5042c4b68bf16df0e3e504c23d`.
Provisioning expires **2026-10-19 05:19:39 UTC**. Production metadata was restored;
release version/assets/auth redirects and tracked/history secret checks passed.
Physical edit, reopen and settings-preservation acceptance remains user testing;
installation/launch is not an interaction signoff.
No production, real-device, hub, household control-state sync or iPad acceptance
claims are implied by these simulation checks.

## Durable Add device and 3D placement — October 15 / Preview 65

- **Devices → Add** now opens Room → Device → Place → Review for verified
  Owners/Admins. Eight curated templates: ceiling light, table lamp, ceiling fan,
  wall AC, wall speaker, outdoor path light, air sensor and TV with its own stand.
  The furnished room preview supports tap placement, orbit/pinch, rotation and
  height adjustments where appropriate, plus keyboard/screen-reader buttons.
  Wall/ceiling mounting and room bounds are validated; fixture proximity is a
  warning. This is not automatic furniture-collision detection or physical pairing.
- Added devices are real household registry rows with `simulation_only=true` and
  versioned `model_placement`. Staging migration **025** atomically saves the row,
  room, pose and permanent retry receipt. Only a confirmed current Owner/Admin can
  register/remove, including direct table operations. Maximum 32 additions/home.
  Receipt reuse cannot duplicate or resurrect a deleted device. Production unchanged.
- Additive staging migration **026** rejects outdoor path lights overlapping the
  conservative house envelope, including their rotated footprint and clearance.
  The editor uses the same shared bounds and shows the house exterior. A live
  preflight found zero existing placed devices, so no saved pose needed repair.
- An account/home-scoped local journal precedes the request. Uncertain saves resume
  the same request after restart; success waits for the authoritative membership
  refresh. Membership owns the render catalog. Cached simulation state cannot
  grant a device or restore a deleted/revoked fixture. Old-account async disk work
  and teardown snapshots cannot import a new account's catalog.
- Runtime geometry shares existing hotspots, controls, effects and bounded light
  budgets. Guest/Tenant access follows room grants. Layout sharing never grants
  readings or controls. Added-device removal is confirmed and server-backed;
  authored fixture-slot linking excludes custom fixtures, and room rebinding cannot
  strand them. Device control state remains local simulation state; this does not
  deliver shared household control-state sync.
- The placement document is an isolated, demand-rendered editor using bundled
  geometry, bounded typed messages and no device commands, credentials or storage.
  Tablet/phone layouts retain reduced motion and fixed-page navigation. No new
  dependency, generated model download or real-device transport was introduced.
  Loading waits for the model's first rendered frame, with a 15-second recovery
  deadline. Compact inner controls remain 44 pixels; the isolated document permits
  widths below the full dashboard minimum. Outdoor picking uses the actual land
  mesh, avoiding a coplanar fallback plane that caused jagged lawn artifacts.

Verification: **3,491 app tests / 238 suites**, **1,116 scene tests / 95 suites**,
and **761 PostgreSQL assertions / 16 suites** passed. SQL includes direct-write
authority, retries, deletion, room binding, all fixture poses and parent-home
cleanup. Real WebGL checks covered five mounting/template cases and tablet layout;
a runtime-added lamp rendered a hotspot and accepted its simulated power control,
with no browser errors. Browser probes use fixture accounts/mock service responses,
not a live Owner's authenticated session. Staging deployment receipt:
`work/device-placement-staging-deployment.json`; migration025 privileges and guards
verified live; the additive026 receipt is
`work/device-placement-staging-grounds-deployment.json`. Detailed evidence uses `work/device-placement-*` and
`work/device-registration-*`. Native packaging/install status follows below.

Additional focused tests cover the legacy metadata guard, model-room binding,
outdoor clearance parity and preview readiness. The full wizard had **35 browser
step captures** across phone, tablet portrait/landscape, 320×568 and enlarged text,
with no overflow or page errors. The final inner-editor sweep covers **286×284**
through tablet sizes, confirming reachable 44×44 controls. UI evidence:
`work/add-device-wizard-*.json` and `work/add-device-placement-final.json`.

**Preview 65 installed and launched** on the connected iPhone; installed-app
inventory confirms **1.0.0 (65)**. Strict signature, device provisioning, staging
endpoint, preview identity/schemes, arrival media and current packaged scene hash
passed. Production metadata was restored; release version/assets/auth redirects,
secret/history scan and diff checks passed. Scene: **31,938,951 bytes**, SHA256
`24714c26fd5741195701b0c394b7828c0bd0ec50cbacd6ab70238ff572d7f859`.
Provisioning expires **2026-10-19 05:19:39 UTC**. Task-owned servers 5187 and 8088
were stopped and the temporary UI probe removed. Other user servers and production
remain unchanged. On October 15, the user confirmed that adding the device worked
on the iPhone and that the device and its position remained after reopening the
app. This verifies the physical save/reopen path; do not infer additional control
or failure-recovery tests from that report. Saved-device rename/reposition/move
is not implemented in Preview 65; controls and confirmed removal are available.

## Smooth manual gate closing — October 15 / Preview 64

- User reproduced a gate jump **after tapping Close**. The safety simulator emits
  one-second position samples at 25% travel/second; the old exponential renderer
  repeatedly decelerated toward each sample and surged at the next. No duplicate
  timer or ordinary state reset was found. This is independent of geography.
- `scene/gateMotion.ts` now closes at constant speed toward the latest accepted
  simulation position, never extrapolating toward the final requested close target.
  Opening keeps its responsive easing. A rapid Close stops unfinished opening;
  if the visible pose trails the logical opening, it waits for confirmed closing
  samples to catch up. Pause/fault cancels visual catch-up; hold/beam/vehicle/fire
  constraints inhibit closing while authorized obstruction reopening remains smooth.
- Covered canvases synchronize the gate on demand, so dismissing full controls
  cannot replay stale travel. Existing reduced-motion, hidden-page, permission-loss
  and cinematic authority handoff remain. No simulator cadence, persistence,
  command, access or device geometry changes. Optional renderer labs remain unchanged.
- Real WebGL carriage traces after the actual mobile **Close smart gate** action
  reproduced the previous easing via a browser response override, then measured
  the fixed code. Middle-80% frame speed range changed from approximately
  **9.3–40.9%/second** to **22.9–26.8%/second** (nominal 25; frame sampling jitter).
  The fixed gate reaches exact closed. Mobile and tablet recordings had no page
  errors. Full-controls covered/reveal, reduced motion and revoked gate visibility
  were separately checked against the actual scene object, with no page errors.

Verification: **1,078 scene tests / 91 suites** passed; final focused reversal and
resume additions passed **12 tests**. App TypeScript and scene build/TypeScript
passed. Focused read-only review found no blocking issues. React review: no new
state/effects, listeners, dependencies or per-frame React renders. Evidence:
`work/gate-motion-{before,after,after-tablet,comparison,covered}.json`, browser
helpers/captures, `gate-motion-*-tests.log`, `gate-motion-app-types.log`, and
`gate-motion-scene-build.log`. These are simulation tests, not physical gate tests.

**Preview 64 installed and launched** on the connected iPhone. Device inventory
confirms **1.0.0 (64)**; its launched process was present in a subsequent inventory.
Strict signature, device provisioning, preview identity/schemes, arrival media and
current packaged scene hash passed. Production metadata was restored; release
version/assets/auth redirects and secret/history checks passed. Scene:
**31,922,843 bytes**, SHA256
`7a6f57c38e20f49c08bd5a38b7bf9508f667987cc78c04bce0b7c94a89e25eeb`.
Provisioning expires **2026-10-19 05:19:39 UTC**. The task-owned scene server 5187
was stopped; other user servers and production were untouched. Physical iPhone
motion/feel remains user verification; process presence is not visual signoff.

## Official geography and weather direction — October 15 / Preview 63

- Supersedes Preview 62's drawn-arrow compass calibration. The official NLA June
  2025 and September 2024 parcel layers match the plan title and each other. The
  mapped frontage is corroborated by the independent mapped road; alignment is
  **26.884524° west of drawing-up**. North is labelled `TRUE`, with an accessible
  map-derived accuracy statement. The house, land, cameras and hotspots remain
  unchanged. Parcel/model edge lengths differ, so this is not a certified survey.
- Fresh raw official responses, reproducible calculation and report are in
  `work/official-property-georeference-{raw.json,measure.py,report.json}`. This report
  supersedes `property-orientation-report.json` and corrects its old grid-convergence
  sign. Private parcel identifiers and coordinates remain outside shipped assets.
- The user **confirmed saving the official parcel-centre pin** through Owner →
  House → Settings → Weather, using `America/Jamaica`. This uses the existing
  household RPC/provider-consent path. No backend, other-household setting or
  generic unconfigured fallback was changed. A live request at the exact pin
  succeeded (`official-property-weather-live.json`); the returned weather grid
  centre is expected to differ. This remains regional model weather, not an
  on-site sensor. Save success is user-confirmed, not independently read from Auth.
- Shared `environment/propertyGeography.ts` now converts true bearings for the
  compass, main rain/plants and optional Three.js/Filament labs. Wind is FROM its
  reported bearing; rain travels and foliage bends downwind. Falling rain now has
  time-dependent horizontal travel with an upwind tail. Conservative full-path
  roof envelopes preserve house/pavilion clipping; no new GPU particle budget.
- Fixed a compass-label jump during panned close orbits by using one directional
  projection ring at every distance. Opposite directions remain opposite. Native
  worklets capture numeric wind values only; touch/reduced motion and weather
  lifecycle/resource ownership remain intact. Independent focused review found
  no actionable issues in this change; this is not an exhaustive app audit.

Verification: **1,066 scene tests / 90 suites**, **9 native rain tests**, **113
weather host tests / 7 suites**, app/scene TypeScript, main scene packaging and
renderer-lab web packaging passed. Roof tests sample **110,400 trajectories**.
The first full test run caught the old compass-label expectation and two timeouts
under concurrent work; the expectation was updated, expensive loop assertions
were reduced without reducing samples, and the full suite passed with two workers.
Browser: **21 captures** across **390×844, 768×1024, 1024×768**, day/night/rain,
orbit/zoom/floor-return; all cardinal labels visible, bounded and non-interactive,
zero page errors or overflow. Four additional captures covered reduced-motion
views and the restricted Guest exterior overview, also without page errors.
Artifacts: `work/official-geography-*` and
`work/official-weather-direction-*`.

**Preview 63 installed** on the connected iPhone; device inventory confirms
**1.0.0 (63)**. The user confirmed unlocking and opening it. Automatic launch and
one bounded retry were blocked by Apple's service reporting `Locked`; subsequent
process inventory did not independently confirm VantaHome. Do not interpret this
as a reproduced app crash or as completed physical direction/visual signoff.
Strict signature, preview identity/schemes, device provisioning, arrival media and
current scene markers/hash passed. Production metadata was restored; release
version/assets/auth redirects and secret/history checks passed. Scene:
**31,922,352 bytes**, SHA256
`4134d9ce0ad4c0af670f1abd0c87a253b2864872c63ecb1d15b83c75d22c7f70`.
Provisioning expires **2026-10-19 05:19:39 UTC**. The task-owned scene server 5187
was stopped after QA. Other user servers and production remain unchanged.

## Property orientation, road paint and mesh cleanup — October 15 / Preview 62

- Historical Preview 62 baseline (orientation superseded above): added N/E/S/W
  around the property, using A002's drawn north arrow: approximately
  30° west of drawing-up. Labels follow orbit/zoom, stay bounded and consume no
  input. A single DOM-owned SVG avoids additional React roots during loading and
  teardown. Hidden on floor, immersive and cinematic views; no added animation.
- The official NLA public parcel layer matched the supplied plan's exact title
  reference. Approximate parcel-centre coordinates, raw responses and measurements
  are in `work/property-orientation-{nla,report}.json`, outside the repository.
  The map and plan boundary dimensions disagree; compass remains explicitly
  plan-derived (`PLAN`), not survey-certified. No coordinate is hardcoded into the
  scene and existing owner weather configuration is untouched.
- Property, house, cameras, hotspots, room names and all model transforms remain
  unchanged. Road paint adds one static mesh: dashed centreline and thin edges,
  interrupted at the driveway. These are illustrative markings on the interpreted
  road, not verified real-world road paint.
- Removed **48 exact zero-area triangles and 48 attribute-identical duplicate
  faces** across exterior/ground/upper GLBs. All five models retain every vertex
  attribute, material, node transform and hierarchy; reverse faces and seams remain.
  No removable triangles or skipped primitives remain in the current five assets.
  Cleanup is offline, deterministic and guarded by the scene build. Gas fixtures
  are rebuilt after cleaning their verified baseline, preserving future appends.
  See [model editing](THREE_D_HOME.md#editing-the-model) for commands.

Verification: **1,047 scene tests / 89 suites**, **56 script tests**, app and scene
TypeScript, and scene web/native packaging passed. Browser evidence covers
**21 captures** at **390×844, 768×1024 and 1024×768**: day/night/rain, orbit, zoom,
floor transition and return; all four labels visible/bounded in exterior views,
zero layout overflow or browser errors. Six additional reduced-motion close-ups
covered gate/grounds, utility, living and family rooms across both floors, with
zero page errors. No additional blob defect was reproduced; this is not exhaustive
visual or physical-device signoff.

**Preview 62 installed and launched** on the connected iPhone; device inventory
confirms **1.0.0 (62)** and process presence was checked after launch. Initial
installation lost its developer connection; a bounded retry succeeded. Strict
signature, preview identity/schemes, device provisioning, arrival media and current
scene markers/hash passed. Production metadata was restored and release
metadata/assets/auth redirects plus secret/history checks passed. Scene:
**31,921,753 bytes**, SHA256
`17c5ab7ff7abd922c6b8a3c8d4c60097d2d3843c6287516891bd91a37a69eb5f`.
Provisioning expires **2026-10-19 05:19:39 UTC**. Physical visual/interaction review
of this update remains pending; install/process presence is not behavioral signoff.
Task-owned scene server 5187 stopped after QA; existing user servers untouched.

Artifacts: `work/property-geometry-browser-after.{cjs,json,log}`, matching screenshots,
`property-geometry-closeups-final.*`, `property-geometry-cleanup/verification-final.json`,
`property-{scene-tests-final,script-tests-final,scene-build-final,app-types}.log`,
`property-orientation-preview62-*`. Existing hub/sync/iPad deferrals remain.

## Account recovery and independent security — October 13 / Preview 61

- **Security & sessions** is available from the no-home/expired-access screen and
  failed or stalled home verification. It opens an account-only route, without
  mounting Profile's household data, the model or private home navigation.
- Security has **Sessions / Password recovery**. The destination comes from the
  server-verified current account; an explicit review is required before requesting
  mail. No editable recipient, profile fallback or claim that requested mail was
  delivered. Duplicate requests are limited and ambiguous results retain continuity.
- A verified recovery callback persists only account/email/request completion
  intent in secure auth storage. Restart resumes unfinished setup. Callback-started intent
  cannot silently expire, including after a binding storage failure; cleanup removes only the reviewed request. Competing
  invitation/recovery tasks must all finish before fresh home verification.
- Password updates use the exact captured JWT and the configured public Auth
  endpoint, with separate token verification. They never use a delayed mutable
  SDK session. Account replacement, stale sign-out callbacks and backgrounding
  cannot release another account's screen; acknowledged background saves require
  deliberate continuation. Uncertain outcomes never assert the password is unchanged.
- A shared non-persisted credential gate closes home authority, runtime, selectors
  and command dispatch. Membership reads carry a version fence; old results stay
  invalid after the gate clears. A fast background/resume session-loader race was
  also fixed. The gate does not grant server permissions or change JWT revocation.

Verification: **3,399 app tests / 232 suites**, app/edge TypeScript, release
metadata/assets/auth redirects, dependency patch checks and secret/history scanning
passed. Service, navigation, UI and shared-runtime reviews covered account changes,
foreground transitions, failed storage, stale callbacks and uncertain responses.
Browser QA passed **45 cases / 33 bounded layouts** at **390×844**, **768×1024** and
**1024×768**, with zero browser errors. Actual App/routes/hooks/authFlow/storage
were used with fake Auth/RPC responses and a stub password mutation boundary.
Cold restart, failed sign-out, verified recipient, confirmation/cancellation,
completion cleanup and fresh membership were checked. Browser tests sent no mail
and do not prove hosted callback delivery or physical interaction.

**Staging only:** the exact password service passed **12 hosted checks** using two
disposable accounts. Its captured token remained tied to the original account
across a replacement login; the new password worked, the old password failed,
and the unrelated account was unchanged. Invalid/revoked tokens were rejected.
Both fixtures were deleted and verified absent. No emails, real-user changes,
migrations or edge deployments. Database remains at **024**; production unchanged.

**Preview 61 installed and launched** on the connected iPhone. Device inventory
confirms **1.0.0 (61)**, with process presence checked after launch. Package
verification passed strict signature, preview identity/schemes, device coverage,
updated UI markers, all arrival media and the unchanged scene. Production metadata
was restored. Provisioning expires **2026-10-19 05:19:39 UTC**. Scene remains
**31,801,189 bytes**, SHA256
`0f328c6ecfded4e3359ea426f3484e9abf36fdbd79277c7e7a562aa4576dd035`.
The task-owned browser server on 5191 was stopped; existing user servers were left
in place. Installation and process presence do not establish physical behavior.

Artifacts: `work/account-recovery-{all-tests-final,browser-check,password-smoke}.log`,
`account-recovery-browser-evidence.json`, `account-recovery-password-smoke.json`,
`account-recovery-preview61-*`. Recovery-email receipt/deep-link behavior on a real
phone and physical review of new controls remain pending. Email change, ownership
transfer/deletion, whole-app lock and session-wide revocation are tracked separately
in the implementation backlog; hub/sync/iPad deferrals remain in force.

## Account security and sent invitations — October 13 / Preview 60

- **Account → Security & sessions** (Profile → Security) lists only this account's
  stored sign-ins, identifies the current session, and offers deliberate
  other-session sign-out plus the existing current-session sign-out. Device names
  are sanitized hints, never live presence. Times distinguish sign-in, token
  refresh and last inventory check. Up to 50 sessions; no inventory stored on disk.
- **Household → Sent** shows authorized pending/expired invitations, real home/room
  scope and deadlines, with a reviewed Revoke action. A monotonic server revision
  prevents cancelling a reissued invitation with a reused ID. Acceptance winning
  the household lock preserves membership; expiry is checked after lock waits.
  Revocation does not delete an account or invalidate its email sign-in code.
- Both paths recheck scope and authority around asynchronous work, reject malformed
  responses and recover explicitly after uncertain results. Background/unmount
  invalidates unsent confirmations; iOS biometric `inactive` preserves them.
  Already-dispatched operations cannot be cancelled; resume rechecks their outcome.
- Session logout targets the captured caller JWT through the public Auth endpoint
  and requires a strict acknowledgement and refreshed inventory. A separate,
  non-persisting verifier prevents an obsolete token error clearing a newer login.
  Existing access tokens can remain usable until expiry; the UI states this.
  Account lifecycle changes and app-wide session-aware enforcement remain backlog.
- The user requested lasting continuity and deeper adjacent investigation.
  `AGENTS.md` now routes future work through the prioritized
  [implementation backlog](IMPLEMENTATION_BACKLOG.md), with evidence and explicit
  deferrals. This is a work practice, not unattended monitoring or exhaustive audit.

Verification: **3,251 app tests / 226 suites**, app/edge TypeScript, release
metadata/assets/auth redirects and local security patch checks passed. All **24
migrations** passed **654 SQL assertions / 14 suites** in isolated PostgreSQL.
Three additional two-connection lock tests covered cancellation, acceptance and
expiry while waiting. Independent service/migration/lifecycle review found and
fixed stale confirmation, biometric foreground and token-verifier isolation edges.

**Staging only:** migrations **023–024** deployed to `dcevusczjtmdpzrxpdou`.
Catalog confirms checked RPCs, private Auth tables and closed invitation writes.
Hosted tests passed **28 checks** using five disposable accounts and one household;
all fixtures were deleted and verified absent. No invitation emails were sent and
no real household/session was mutated. Production and edge functions unchanged.

Browser QA: **37 cases / 27 bounded layouts** at **390×844**, **768×1024** and
**1024×768**, zero browser errors. Covered pagination, long names, expiry, keyboard
confirmation/cancellation, account changes, failed reads/mutations and explicit
refresh. Normal demo routes and isolated fixtures used exact components/services;
mock browser responses are separate from the hosted API checks above.

**Preview 60 installed and launched** on the connected iPhone. Device inventory
confirms **1.0.0 (60)**; process presence checked after launch. Package verification:
strict signature, preview identity/schemes,
device coverage, current UI markers, arrival media and bundled scene. Production
metadata restored. Provisioning expires **2026-10-19 05:19:39 UTC**. Physical
interaction and native biometric review of the new controls remain pending;
installation is not behavioral signoff. Scene **31,801,189 bytes**, SHA256
`0f328c6ecfded4e3359ea426f3484e9abf36fdbd79277c7e7a562aa4576dd035`.

Evidence: `work/account-security-full-tests-final.log`, `*-types-final.log`,
`*-sql-summary.log`, `*-invitation-races.log`, `*-staging-deployment.json`,
`*-hosted-invitations.json`, `*-session-smoke.json`, `*-browser-evidence.json`,
browser screenshots and `*-preview60-{build-status.log,package.json,install.json,
launch.json,apps.json,process.json}`. Temporary QA browser profiles and Metro 5190
closed; existing user Metro 5188 retained.

## Deep rescan fixes — October 13 / Preview 59

The **11 finding groups** in [Deep reliability rescan](DEEP_RELIABILITY_RESCAN.md)
are addressed. The original evidence remains in that report; its new resolution
section records the implementation and limits. Preserve these boundaries:

- Migration **022** replaces direct membership, room-membership and permission
  writes with checked operations. Admin delegation cannot exceed its effective
  actions; expired-Guest replacement preserves explicit denials. Invitation
  creation is checked before email delivery and again under a household lock.
  Initial finite Guest invitations remain capped at 30 days; renewal allows 365.
- A shared read/mutation fence prevents old membership responses (including null
  and errors) from undoing a home change or confirmed policy update. Permission
  reset/removal requires an exact authoritative RPC result. Completion of an old
  login's request cannot invalidate a newer login's verification; this orders local
  reads, without pretending to cancel an already-sent server operation.
- Renderer/native patches include their actual sender baseline. Field rebasing
  preserves newer independent edits; background/access teardown synchronously
  pauses gate simulation in the captured scope. Queued ticks cannot resume it.
- Nested routine/scene/device-patch cache validation includes malformed Unicode
  identifiers. Corrupt bytes remain preserved for recovery. Routine timezone
  refresh bypasses a still-warm cache at its verification interval; it does not
  replay missed minutes or create background/hub execution.
- Cameras distinguish saved power, recent telemetry and actual video playback;
  feeds release on power-off, lost access and background. Playback begins after
  the media view mounts, waits for a first frame, and exposes errors/timeouts and
  Retry without showing private URLs. Missing/stale telemetry stays unverified.
- Web feedback uses a rendered, bounded dialog instead of RN Web's silent Alert.
  Pending confirmations recheck the account/home/policy and Guest deadline.
- Unread favorites cannot be overwritten; failed favorites/activity writes retain
  pending data and have explicit, scoped Retry controls.

Verification: **3,126 app tests / 221 suites**, **1,037 scene tests / 86 suites**,
**127 bridge tests**, **47 script tests**, and **576 SQL assertions / 12 suites**
after all **22 migrations** in an isolated PostgreSQL 17 database. A later focused
15-test lifecycle run additionally covers stale success/null/error responses.
The final old-login completion correction reproduced three failures before the
fix; **99 focused tests / five suites**, TypeScript and independent review passed.
App/edge TypeScript, scene/web builds, release metadata/assets/redirects and local
security patch checks passed. npm's advisory endpoint failed once, then the
full dependency check passed on retry; braces and node-forge remain verified local
backports, not a clean upstream-version audit. Independent cross-review found and
fixed browser playback ordering, expired-confirmation and Unicode-cache edges.

Browser verification recorded **21 cases** across **390×844**, **768×1024** and
**1024×768**: corrupt favorites remain intact, temporary failures recover without
losing saved choices, activity Retry persists dismissals, feedback is keyboard
accessible, and missing camera reports remain unverified. All 12 layout checks
stayed within the viewport; fresh uninstrumented reloads reported zero browser
errors. Fault injection used disposable local profiles, with no cloud writes.

**Staging only deployed:** `home-invite` version **20**, JWT verification enabled,
then migration **022**. Catalog checks confirm table/column write grants are closed
and checked RPCs remain available; unauthenticated invitation returns **401**.
No household exploit test, real invitation email, production change or hardware
command was used. Migration SHA256:
`c9b241d73a16e7c3e06aabf5836222172da8993afe9706d2e1470f7fb1086f38`.

**Preview 59 installed and launched** on the connected iPhone; device inventory
confirms **1.0.0 (59)** and its process was present after launch. Strict signing,
preview identity/schemes, device coverage, arrival media and bundled scene verified;
production metadata restored. Provisioning expires **2026-10-19 05:19:39 UTC**.
Scene: **31,801,189 bytes**, SHA256
`0f328c6ecfded4e3359ea426f3484e9abf36fdbd79277c7e7a562aa4576dd035`.
Native installation is not physical interaction or camera-hardware signoff.

Evidence: `work/secure-rescan-*`, `work/deep-access-fixes-postgres{,-summary}.log`,
`work/deep-access-final-lifecycle-tests.log`, `work/deep-fixes-simulation-*`,
`work/deep-access-late-completion-{repro,fix,types}.log`,
`work/deep-reliability-recovery-tests.log`, `work/deep-fixes-unicode-recovery*`,
`work/secure-rescan-browser-evidence.json` and its 12 screenshots.
Review the browser report alongside these logs; do not treat test fixtures as
production data. Production/hub rollout still needs its existing independent
security review, real-device/provisioning tests and durable household execution.

## Deep reliability fixes — October 13

The seven findings from the audit of **7600c47** are now addressed in source:

- **Saved-data recovery:** unread/corrupt account and simulation caches remain
  intact, writes/controls wait for validated hydration, and Retry restores the
  original state. Invalid profile/preference values and wrong-account payloads
  fail closed. Recovery also restores scene shortcuts and activity tracking;
  its notice releases the arrival shield so Retry remains reachable.
- **Permissions:** one pending write per home/member/permission across reopened
  editors; authenticated grants publish only after server acceptance. Stale
  roles/sessions are rechecked; failures are visible inline, with no older
  optimistic rollback able to erase a newer choice.
- **Personal preferences:** verified same-account home switching preserves
  profile, haptics and notifications atomically.
- **Routines:** foreground execution uses verified property timezone, visibly
  labeled in the editor/list. Unavailable timezone pauses time-based work.
  Account/session/home/member-scoped minute markers survive foreground restarts,
  edits and DST repeats. These are process-local markers, not durable hub jobs.
  Scene/runtime settings reads share one bounded verified cache.
- **Device behavior:** paused TV artwork freezes; fan Reverse/Sleep affect the
  rotor; AC speed/swing/mode/Eco/Turbo/Quiet affect airflow preview. Settings with
  no modeled effect remain compatible, separately labeled saved-only on native
  and web pages. Fixed ceiling/extractor fans do not claim oscillation or lamps.
- **Reports/alerts:** all six air thresholds now evaluate available readings.
  New power/water/air conditions can produce native foreground notices; restored
  conditions and resume establish a silent baseline. Dedupe, current grants,
  preferences, observation age, background changes and delayed OS presentation
  are checked. Simulation stays labeled; current reports remain visible when
  notices are disabled. No background alarm delivery or physical safety claim.
- **Deep account paths:** one rendered sign-out confirmation uses the shared
  scoped service on web/native. Profile picker/save/cleanup failures are visible
  in-page; successful saves rebase the draft before optional old-photo cleanup.

Validation: **3,062 app tests / 215 suites**, **1,034 scene tests / 86 suites**,
app/edge/scene TypeScript, production-mode web export, release asset/version/
redirect checks and secret scan passed. Independent reviews covered storage,
permission/sign-out ordering, routine clocks and delayed notification delivery.
Browser demo at port 5188 verified lowering CO₂ to 600 against sample 620 produces
its labeled current report; original 1200 restored afterward. Phone 320/430 and
tablet 768/1024 layouts remain bounded; no browser console errors. Verified
routine timezone copy, saved-only control copy and account navigation. Evidence:
`work/deep-fixes-air-report-phone.jpg`, `work/deep-fixes-full-tests-final.log`,
`work/deep-fixes-web-export.log`, `work/deep-fixes-scene-build.log`.

**Preview 58 is built, installed and launched on the connected iPhone.** Live
device inventory confirms `1.0.0 (58)`. Strict signing, provisioning, preview
redirect schemes, four arrival assets and updated bundled code are verified.
The bundled scene is 31,800,175 bytes (under 32 MiB), SHA-256
`af2ec6e710a16e4fdd29b572702e0ebba239436fadc28b3a865e06bc789a7549`.
Production metadata was restored and release guards still pass; no new native
dependencies. Evidence: `work/deep-fixes-preview58-{build.log,package.json,
install.json,launch.json,apps.json,process.json}`. Source remains staging/
simulation-only; production and backend services unchanged. Physical OS notice
delivery and the updated controls still need a user smoke test; iPad testing
remains deferred.

Known product work remains separate: hub-backed execution and household/profile
sync are deferred; biometric app lock, location presence and weekly digests are
explicitly unavailable. Sent-invitation management, account email change,
account deletion, session management and ownership transfer have no complete
in-app flows. Generic peer names belong to the deferred profile sync.

## Account portraits and working personal settings — October 13

- Shared portraits now appear in the dashboard account button, account sheet,
  profile, and verified self rows in Household and camera access. Authoritative
  roles/grants and other members remain unchanged; stale/mismatched identities
  never borrow the preceding account's portrait. Missing images use initials.
- New native selections are copied into app documents using sandbox-relative
  references; web selections become bounded cropped JPEGs. Saving waits for
  storage, surfaces failure, and preserves newer settings. Portraits, display
  names and phone remain account-local on this device; cross-device/member
  profile sync is deferred. Expired legacy temporary photos need reselecting.
- Session restoration preserves the saved local name and portrait; verified
  sign-in email remains authoritative/read-only. Removed ineffective home-name
  and timezone fields from the personal editor. Property timezone belongs to
  its weather location. Temperature/clock settings clearly describe their
  dashboard scope; individual device controls keep their labeled units.
- Haptics now respects its preference at each interaction. Local OS notices
  respect the notification toggle and current system permission, including
  changes while async work is pending. Old-account foreground notices are
  suppressed; in-app reports remain visible. This is not hub-backed push.
- Browser verification used a separate local demo at port 5188 and a bundled
  logo as its disposable test portrait: choose/save/reload/account surfaces,
  removal/reload, haptic/notification persistence, and dashboard Fahrenheit/
  24-hour behavior passed. Phone (320/430), tablet portrait (768), and tablet
  landscape (1024) checks retained bounded layouts. No browser console errors.
  Evidence: `work/account-portrait-phone.jpg`. Test browser data was restored.
- Validation passes: **3,000 app tests / 209 suites**, app and edge TypeScript,
  production-mode web export, release asset/redirect/version checks, and diff
  review. Independent review also covered save failures after closing/reopening
  editors, newer field choices, scope changes and safe portrait cleanup.
  Logs: `work/account-settings-full-tests-final.log`,
  `work/account-settings-web-export.log`, `work/account-settings-types-final.log`.
- **Preview 57 is built, installed and launched on the connected iPhone**;
  live device app inventory confirms `1.0.0 (57)`. Strict signing, provisioning,
  preview redirect schemes, arrival media, scene checksum and updated bundled
  account code are verified. Production metadata was restored and release guards
  still pass; tracked/history secret scan passes. No new native dependencies.
  Evidence: `work/account-settings-preview57-{build.log,package.json,install.json,
  launch.json,apps.json}`. Physical photo selection/restart and disabled-haptic
  confirmation remain user checks; browser/unit success is not native UI signoff.
  Production and staging services were not changed.

## Sustained physical iPhone baseline — October 12

- Installed Preview 56 completed a lightweight **8 min 2 s** Power Profiler +
  Thermal State capture. The native app retained the same PID afterward. No app
  source changes or rebuild were needed; staging/simulation scope is unchanged.
- Thermal state was **Nominal for 7 min 25 s**, then **Fair for 37 s**; no Serious
  or Critical intervals. Reported brightness stayed **100%**. Whole-device power
  averaged **43.07%/hr**, integrating to **5.75 battery percentage points** over
  99.78% observed coverage. This is a profiler estimate, not an app-only battery
  measurement or a prediction of everyday battery life.
- User reported battery **34% → 23%**, an **11-point** difference, and confirmed
  23% was read when sending the later reply. This covers a longer interval;
  the capture-end gauge is unknown. Do not attribute the entire drop to the
  eight-minute capture or compare it directly with the profiler integral.
  Subjective warmth/stutters, tour playback and explicit off-charger confirmation
  remain pending. No full-scene FPS was measured; performance is not signed off.
- See [Physical performance baseline](PHYSICAL_PERFORMANCE_BASELINE.md) for minute
  trends, conditions, evidence paths and the next controlled comparisons. Source
  review identified hidden hotspot layout work during tours as an unmeasured
  optimization candidate; no quality reduction or speculative fix was applied.

## Remaining dependency remediation — October 12

- User asked to finish the current pending work while keeping **hub-backed
  automation and household sync deferred**. No hub or production services changed.
- Removed the vulnerable `sprintf-js` coverage-tooling dependency through a
  scoped `@istanbuljs/load-nyc-config` override to `js-yaml` **4.3.2**. This removes
  the obsolete `argparse` chain without a formatter fork or new audit exemption.
  The parser migration boundary is documented in [Dependency security](DEPENDENCY_SECURITY.md).
- Seven installed-source regressions exercise real YAML loading/inheritance,
  invalid configuration recovery, Babel branch instrumentation and CLI parsing.
  Existing braces/node-forge source guards remain unchanged. The dependency gate
  now **passes**; raw npm audit still lists those two source-remediated findings.
  This resolves the sprintf-js blocker recorded in the prior milestone below.
- Full `npm run verify`, tracked/history secret scanning, production web export
  and diff review pass: **2,892 app tests / 200 suites**, **1,028 scene tests /
  85 files**, **127 bridge tests**, **47 script tests**, plus dependency guard
  regressions and app/edge TypeScript. Independent dependency review found no
  actionable issues. Logs: `work/pending-final-verify.log`,
  `work/pending-final-secrets.log`, `work/pending-web-export.log`.
- Development tooling only: no app/native dependency or UI changes. Installed
  **Preview 56** remains current; no reinstall is needed for this fix.
- Hosted verification then exposed cache-dependent npm resolver proposals for
  the two existing backports: Jest 30.5.2 and an Expo 44.0.6 downgrade. The gate
  now distinguishes these exact reviewed stack alternatives from patched leaf
  releases, preserving source hashes, attack regressions and advisory matching.
  Fresh official release catalogs are checked even when npm reports no fix;
  unavailable evidence, new releases or unknown proposals fail closed. No new
  advisory exemption or application dependency change was made. **63 focused
  guard tests**, live dependency verification, captured cold-cache audit replay,
  TypeScript and independent review pass; see Dependency security for the scope.

## First valid physical iPhone profile — October 12

- Reconnecting USB restored Instruments discovery after the installer had already
  seen the phone. No pairing reset, security change or OS upgrade was needed.
- Attached Time Profiler to the installed Preview 56 on iPhone 16 Pro Max,
  iOS 26.6.2, using Xcode 27.0. A **31.55-second** trace saved successfully with
  **2,181 CPU samples**. Sample weights total 2.181 CPU seconds (approximately
  **6.9% of one CPU core** across the window for the native host process).
  There were **zero reported potential hangs over 250 ms**, and the device's
  thermal state was **Nominal** throughout this short capture.
- Scope matters: this is the native host process, excluding separate WebContent
  and GPU processes. It does not establish whole-scene CPU cost, FPS, battery
  life, sustained thermal performance or interactive stress-test results. Attached
  lifecycle state was unknown to Instruments; the user reported Preview open.
- A separate 30-second Animation Hitches attempt failed during finalization with
  Apple's `DTKTraceTapMessageHandler` assertion (exit 134), around a host disk-space
  shortage. Its incomplete trace cannot export. After space recovered, a shorter
  **16.35-second** capture saved and exported successfully: **one 16.67 ms hitch**
  attributed to Preview, 895 frame-lifetime rows and **zero reported potential
  hangs over 33 ms**. Device thermal state was **Fair** throughout that later
  capture; this device-wide reading cannot establish app-specific causation.
  After the first second, full one-second intervals showed 53–60 display surface
  swaps; the initial one-second bucket recorded 28. These are compositor events,
  **not validated Three.js render-loop FPS**. At that stage, sustained scene
  FPS, GPU/energy and interactive stress measurements were pending; the newer
  sustained power/thermal baseline above advances only that measured scope. Preview
  retained the same running PID through the profiler recovery.
- Cached evidence: `work/pending-iphone-preview56-reconnected.trace`, matching
  recording log, `work/pending-iphone-preview56-toc.xml`, exported time-profile,
  potential-hangs, thermal-state and lifecycle XML, and
  `work/pending-iphone-preview56-summary.json`. Successful animation trace/TOC use
  `work/pending-iphone-preview56-animation-retry`; exported data and summary use
  `work/pending-iphone-preview56-animation-metrics.xml` and `-animation-summary.json`.
  Failed animation log uses the `work/pending-iphone-preview56-animation` prefix.
  Device Hub screen sharing
  requires iOS 27, so it could not provide a view of this iOS 26 phone; that
  limitation is separate from the successful CPU recording.

## Product clarity and reliable local activity — October 12

- Implemented the no-hub product-review improvements while preserving the 3D-first
  purple design. Quieter plum control surfaces, brighter secondary text, larger
  small dashboard labels, and fewer redundant selection glows. Motion, touch
  behavior, layout grants and real-device authorization remain unchanged.
- Notifications now contains a bounded **200-entry local inbox**, isolated by
  account/home/member (plus a separate demo scope). It records admitted command
  delivery and actual model changes, never fabricated sample notifications or
  physical success. Read/dismiss revisions persist; scope changes hide old rows
  immediately. No raw payloads, credentials or historical device names are stored.
  Slider updates coalesce; cache failures remain visible and failed reads cannot
  overwrite unknown disk history. Interrupted old deliveries show unknown outcomes.
- Separate **Current reports** preserves the outage, water leak/pressure/budget
  and open-entry overview. It reads permitted devices and canonical model values,
  labels simulations, and uses physical `observedAt` only (unknown/older reports
  remain explicit). Dismissing history cannot dismiss a continuing condition.
  This is local app reporting, not a connected push or independent alarm service.
- Scene cards summarize their actual desired actions. Details retain important
  entry/camera/protection preferences, including child-lock and automatic shutoff
  changes when power is OFF. Sequential virtual camera toggles use the reducer's
  arming semantics. Routine screens explicitly state foreground-only execution,
  device-local storage, and no household sync or connected always-on hub.
- Air controls no longer invent readings, history, confidence, freshness, filter
  life, environmental temperatures or reassuring advice. Per-device sample source
  survives mixed physical/model homes. Missing smoke/water/entry/child-lock states
  stay unknown; closed does not imply locked. Physical window state is not inferred
  from an animation timer. Air aging pauses in background. These targeted fixes
  are not certification of every legacy appliance/hardware path.
- Fixed a browser unmount crash: RN Web may return no AppState subscription,
  particularly for memory warnings. Retained-scene and air cleanup handle that
  while preserving native lifecycle behavior.
- Compatible dependency updates: compression **1.8.2**, shell-quote **1.11.0**,
  source-map-js **1.2.2**, with installed attack regressions. Existing guarded
  braces/node-forge backports remain. `security:dependencies` still fails on
  **sprintf-js GHSA-hp3w-g68c-fv3c** in development tooling; no safe upstream fixed
  version was available in the checked registry. Do not suppress or call CI green.
  Secret scanning now recognizes only two reviewed invalid historical fixtures in
  one exact test path; current files and actual token patterns remain scanned.
- Browser QA: 320×568, 430×932, 768×1024, 1024×768; no document overflow. Light
  off/on feedback, inbox persistence/dismissal across reload, scene safety details,
  compact Current reports and idle-tour return checked. Screenshots/logs use the
  `work/product-review-*` prefix. iPad hardware remains deferred.
- Verification: **2,892 app tests / 200 suites**, **1,028 scene tests / 85 files**,
  **127 bridge tests**, **47 script tests**, native/edge TypeScript, production web
  export, scene build, release identity/assets/redirect guards, full tracked/history
  secret scan and diff review pass. Dependency guard remains red only for sprintf-js.
- **Preview 56 Release built, installed and launched**; device reports 1.0.0 (56).
  Strict signature, preview identity/schemes, device profile and four arrival-media
  hashes pass. Packaged scene **31,796,355 bytes**, SHA
  `537af5f22636f9cb1bc45444f2f249337f65bc01c71ff48d5b5e343fa3911b0e`.
  Final bundle contains Current reports. Production metadata was restored, and
  production services remain unchanged. Receipts: `work/product-review-preview56-*`.
- Physical profiling timed out twice while xctrace listed the phone Offline,
  despite the installer seeing it. After Preview 56 installation xctrace listed
  it online, but a third bounded Time Profiler recording still timed out waiting
  for the device. No valid CPU/FPS/energy measurements were obtained. Installation
  and launch are verified separately; do not describe performance as measured.

## Higgsfield amethyst arrival — October 12

- User approved a quieter, seamless refinement and explicitly requested a new
  **Higgsfield film**. New matched 4:3 keyframes and a silent Seedance 2.5 film:
  contained V seats first, small violet crystal core follows from the left,
  circuit illumination settles last. Original icon master remains unchanged.
- Production record: `assets/brand/motion/higgsfield-refined.production.json`;
  job `b565d056-e1d6-4770-a683-ffedc7a7d6b3`, estimated 53.5 credits including
  both references. Source cache: `work/brand-motion/higgsfield-refined/`;
  SHA `dfa17e3b12c3e5533bdbcae8521bb7c9c2ccb4f03575dbb5866b2a39f36b44d3`.
  Source 1664×1248, 24 fps, 4.042s, no audio; 16 sampled frames reviewed.
- Source 0.25–3.5s becomes a **2s entrance**; 3.5–4.0s supplies a 2s quiet
  cosine-paced hold. Four runtime assets total **1,360,293 bytes (1.30 MiB)**,
  silent 1024×768 H.264 Main 3.1/30fps plus exact decoded opening/hold PNGs.
  Full decode, fast start and source endpoint reuse pass; decoded entrance/hold
  and loop boundary differences are about 1.85 RGB levels out of 255.
- Normal presentation has one small VANTAHOME wordmark at 92% of the centered
  4:3 contain frame. Status stays accessible; delayed/error recovery retains
  retry/sign-out and verified controls. No normal checklist, slogan or subtitle.
- A subtle violet glow uses the existing **300ms readiness fade**. Never wait
  for the film to finish. Reduced motion and returning sessions use completed
  stills; background pause, access checks and immediate privacy coverage remain.
- Source stage uses a protected superellipse blend (inner radius 0.82,
  exponent 2.6). Chrome exposed a decoder color-level seam despite passing
  AVFoundation edge checks. A static SVG overlay now composites exact app navy
  after decoding: ellipse radius 48%, alpha stops 0.83/0, 0.88/0.28, 0.95/0.85,
  0.98/1. Badge geometry stays clear; reflection fades gently. A native-only
  launch composite carries the identical treatment before React is available.
  `assets/release/arrival-native-poster.png` is 464,962 bytes. Its every-pixel
  formula check is within 1/255; center pixels stay unchanged and the opaque
  perimeter is exactly navy. All three OS images match this composite, while
  the four runtime assets retain exact decoded posters.
- Processing: `scripts/build-arrival-media.py SOURCE WORK --source-sha256 SHA
  --provenance RECORD --enter-start 0.25 --enter-end 3.5 --hold-end 4
  --enter-seconds 2 --stage-inner-radius 0.82 --stage-exponent 2.6`.
  Default outputs remain in WORK/delivery until visual approval. Publish the
  OS image with `--native-poster-destination assets/release/arrival-native-poster.png`;
  copy it to all three iOS splash scales. Source,
  timing and script hashes reject stale cache reuse. No runtime dependency added.
- Browser review passes at 320×568, 430×932, 768×1024 and 1024×768 with no
  overflow, silent 2s hold and seamless edges. Reduced motion starts no video;
  early readiness at 1.2s removes the player/shield and permits controls.
  Retry and static returns pass. Actual 3D Home opens full device controls and
  retains no loading overlay/player/inert wrapper. Temporary QA harness removed.
- **104 focused tests**, native TypeScript, media decode, production-script/
  provenance hashes, release asset guards and diff review pass.
- **Preview 55 Release built, installed and launched successfully on iPhone**;
  device reports 1.0.0 (55). Strict signature, preview identity/schemes, device
  profile coverage and all four packaged media hashes pass. The scene remains
  31,796,443 bytes, SHA `1ba87a3896687f44771b2400939daafc20be4017b1e9fc5b081e96929418f3ab`.
  Build restored production metadata; release version/asset guards pass.
  Physical motion review remains pending; iPad tests remain deferred and Android
  playback is unverified. Production remains unchanged.
- Evidence: `work/refined-arrival-*`, `work/verify-refined-preview55.py`, and
  the source cache's `app-edit/` folder. Existing full-suite/dependency limits
  below remain; this work is not a new full release certification.

### Superseded Preview 54 precision arrival

- Previous Higgsfield job `3e339a8d-f8bc-4d35-85f9-efec3c2d1e84` used a large
  foreground V and dark core, 2.5s entrance, 2.04 MiB runtime assets. Its record
  remains `assets/brand/motion/higgsfield-assembly.production.json`; cached
  source and processing evidence remain in `work/brand-motion/higgsfield-assembly/`.
- Preview 54 was built/installed and device-reported as 1.0.0 (54), with exact
  media/scene/signature checks. Launch was blocked by the locked phone.
- Retained the current-segment first-frame guard and preloaded completed poster,
  preventing an empty-shell flash during enter-to-hold source replacement.

### Superseded Preview 53 study

- Deterministic Blender assembly was installed as Preview 53, but the user wanted
  Higgsfield's original visual quality. Its geometry/intermediates remain in
  `work/brand-motion/assembly/` and Git history; its renderer is no longer active.
- Preview 53 installation was verified; automatic launch was blocked by a locked
  phone. The original runtime readiness/reduced-motion work is retained above.

## Previous unified cinematic arrival (Preview 52) — October 12

- Created **Core Awakening** in Higgsfield from the approved VantaHome icon:
  a dimensional purple-glass disassembly/reassembly film. Preferred delivery is
  **12.05 seconds, 1920×1080, 24 fps, H.264/AAC stereo**, approximately 6.1 MB.
- Reusable prompts, job/media IDs, source/output checksums, estimates and review
  limits are in [production metadata](../assets/brand/motion/core-awakening.production.json).
  Master, compatible MP4, hero reference and square study are cached under
  `/Users/nick007/Library/Caches/VantaHome/work/brand-motion/core-awakening/`.
- Reference and sampled motion frames inspected; portable output fully decoded
  without errors. No physical-device playback test. AI motion is a dimensional
  interpretation, not exact editable logo geometry. App runtime and original
  approved icon remained unchanged at that creative milestone. Runtime integration follows.
- Installed the film as one persistent arrival across account preparation,
  membership verification, and the first authorized 3D frame. There is no forced
  movie duration or normal checklist. A readiness-driven 300 ms fade reveals Home;
  retained same-account returns use a still. Recovery appears after 8 seconds or
  immediately on an actual error; verified device controls remain reachable while
  the scene prepares. Login, invitation/setup, and scene failures stay reachable.
- Bundled five local assets (silent H.264 entrance/hold/resolve + exact opening/hold
  posters), **2,284,729 bytes total**, 1024×768/24 fps. No new generation credits.
  Runtime metadata: `assets/brand/motion/arrival.production.json`; reproducible
  processing: `scripts/build-arrival-media.py`. Native expo-video and a browser
  video element pause in the background; reduced motion starts no decoder.
- iOS uses the matching opening frame on brand navy, held by SDK-compatible
  **expo-splash-screen 31.0.13** until the React poster settles, with a bounded
  fallback. Android's OS splash remains its padded icon before the same arrival;
  no Android native/device test. Original app icon untouched.
- Authorization is independent of animation. Account/home/renderer leases reject
  stale ready callbacks; membership loss hides private content immediately.
  Browser content is inert while covered. The scene reports readiness after its
  own completed renderer frame, scoped to the current visual permissions.
- Verification: **83 focused native/arrival tests**, **1,028 scene tests**, native
  and scene TypeScript, scene build, 20 release-asset/Metro tests, native storyboard
  compilation, release asset guards, and diff review pass. Browser checks at
  320×568, 430×932, 768×1024, and 1024×768 confirm contained artwork, no document
  overflow, looping silent media, recovery, reduced-motion stills, and controls
  after the real 3D dashboard reveal. Temporary visual QA entry was removed.
- Full Jest: **2,791 passed / 1 pre-existing failure**. Optional renderer-lab test
  line 202 dispatches `valueChange` to a Pressable migrated to `onPress`; isolated
  unchanged HEAD `5a1e840` reproduces it. A corrected event in the isolated copy
  passes all 11 lab tests; active lab source/test left unchanged.
- Dependency audit is not green: existing compression, node-forge, shell-quote,
  source-map-js, and sprintf-js findings require follow-up. The lockfile addition
  only adds expo-splash-screen; all previously locked package versions are unchanged.
  Local security backport integrity checks pass. Do not claim a clean full verify.
- Preview **52** Release built and installed on the iPhone. Exact preview identity,
  schemes, device-reported **1.0.0 (52)**, profile coverage, strict signature, all five shipped media files,
  and current scene hash/size verified. Production source metadata restored.
  Signing expires **2026-10-19 05:19:39 UTC**. Automatic launch was rejected by
  iOS with a signature/entitlement/developer-trust message despite local strict
  signature/profile checks passing. The user was asked to open Preview manually
  and approve the existing developer profile only if prompted. Launch and physical
  animation smoothness review remain pending; iPad testing remains deferred. Scene **31,796,443 bytes**, SHA256
  `1ba87a3896687f44771b2400939daafc20be4017b1e9fc5b081e96929418f3ab`.
- Evidence under `work/unified-arrival-*`: QA JSON/screenshots, root/focused/scene
  tests, full Jest, type/build/package/install logs. Baseline evidence:
  `work/renderer-baseline-ez8y30fd/{baseline-jest,corrected-event-jest}.log`.

## Verified branch audit and implementation priorities

- Read [Branch implementation audit](BRANCH_IMPLEMENTATION_AUDIT.md) before
  choosing the next implementation. It pins app source **54d5e8a**, all six
  fetched GitHub branch heads, and the four local branches in the original clone.
  Four other remote branches are ancestors; `ios-build-cleanup` alone diverges:
  **17 unique commits / 74 changed paths**. All 17 received a disposition.
- That branch contains useful absent inbox/push, device-health, telemetry and
  advanced routine work. Selectively adapt it; do not merge its older access,
  direct device-state mutation, native configuration or synthetic-history logic.
  The live GitHub default is `main`; this checkout's cached `origin/HEAD` pointing
  at `sprint-two` is stale. Neither default nor branch layout was changed.
- Immediate gaps: reachable notification UI still appends mock events and keeps
  dismissals only in component state. Hosted Verify for **54d5e8a** fails at the
  secret scan on synthetic preview-test assignments; subsequent tests/build were
  skipped. The same redacted scan failure was reproduced October 11. Fix narrow
  fixture/history handling without weakening actual secret checks.
- The SQLite light journal, worker and authenticated HA adapter already exist.
  Remaining hub work is secure provisioning/pairing, trusted host authorization,
  an installed service, physical-device bindings and the app receipt/state path.
  Routines still run only while foregrounded; scenes/routines need household
  definition sync and durable hub execution for everyday multi-user operation.
- Current 3D controls are intentionally simulated. Real-device routes still use
  the legacy detail screen, including air-data fallbacks that need truthful
  missing/stale states. Cameras and assistants have interface/handler foundations,
  not fully verified physical integrations. Device health is useful; geofencing,
  utility tariffs and Filament migration are optional.
- Scope was source/branch/test-assertion review plus current GitHub CI status;
  no new full test run, deployment or hardware verification. Detailed cache:
  `work/branch-audit-2026-10-11.json` and its redacted `*-secret-scan.log`.
  Existing Preview 51 installation evidence below remains historical evidence.

## Environment and confirmed milestones

- Staging Supabase: `dcevusczjtmdpzrxpdou`. Migrations **001–024** applied only here.
  019 adds owner-only interior consent; 020 adds checked Guest deadline changes.
  021 adds Owner-managed, consented property weather configuration.
  022 enforces checked membership, permission and room-delegation mutations.
  023 adds revision-checked sent invitation management; 024 adds private own-session inventory.
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

Use the [audited delivery order](BRANCH_IMPLEMENTATION_AUDIT.md#delivery-order)
for implementation priorities; the physical follow-ups below are a separate list.

1. Review Preview 59's changed native paths: household permission edits/removal,
   account switching during a pending request, backgrounding a moving simulated
   gate, and recovery feedback. Browser/automated coverage is recorded above;
   these interactions have not been physically reviewed on this build.
   Earlier Guest renewal and offline/reconnect with retained door restrictions
   passed by the user's report; do not repeat them without a changed-path reason.
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
