# VantaHome implementation backlog

Maintained October 29, 2026. This is the current delivery queue, not a claim that
every undiscovered defect has been found. Start with [working context](WORKING_CONTEXT.md)
for current build/deployment evidence. Preserve the purple 3D-first design and
simulation-only staging scope. Recheck volatile external state before changing it.

## Latest delivery

| Work | State | Acceptance boundary |
| --- | --- | --- |
| Coffee console | Preview 99 built and verified; installation pending | Shared sculpted espresso machine SVG and accepted-state steam in Home/Devices; independent strength, size and atomic cup-count preferences, explicit Brew/Stop and all extras under More. No timer, consumption, live temperature or real brewing. Shared motion hook preserves irrigation and stops when reduced/backgrounded/covered. 70 renderer + 50 native tests, app/scene types/build, 11 standalone + six native-source + five actual Home profiles pass, including bidirectional state, reload and fresh native disk-session retention. Fixed height-constrained artwork sizing; ordinary viewports do not scroll, tiny/large-text fallback remains. Signed staging package/exact 32,265,219-byte scene verified; production metadata restored. Installation and physical acceptance pending. |
| Refrigerator console | Preview 98 built and verified; installation pending | Shared pearl-metal French-door SVG, independent fridge/freezer target steppers, C/F presentation, Normal/Eco/Boost/Vacation and quick preferences in Home/Devices; all extras remain under More. Atomic steps preserve power/settings; malformed explicit targets remain unavailable. No live temperature/cooling claims or new dependency/animation loop. 50 renderer + 60 native tests, app/scene types/build, 11 standalone + six native-source + five actual Home profiles pass. Bidirectional state agreement, reload and fresh native disk-session retention verified. Regular viewports have no vertical overflow; small-screen/large-text fallback retained. Signed staging package and exact 32,249,927-byte scene verified; production metadata restored. Preview 97 remains installed; installation and physical checks pending. |
| Air quality console | Preview 97 installed; manual launch confirmation pending | Shared ceramic SVG sensor and recessed AQI display in Home/Devices; fixed PM2.5/CO₂/VOC/humidity samples, sample acknowledgement, saved alerts and AQI presets, all extras under More. Six saved-limit comparisons match existing strict-greater-than reports; alerts-off and partial missing data cannot conceal a known exceedance. No live sensor/purifier/history claims. Five missing host preference projections fixed. 69 renderer + 88 native tests, app/scene types/build, 11 standalone + six native-source + five actual Home browser profiles, bidirectional state and reload pass. Measured-height sizing fixes short-phone overflow; tiny/large-text contained fallback retained. Signed staging package/exact 32,233,386-byte scene verified, signing renewed through November 3, and production metadata restored. Reverified and updated in place October 27; Apple inventory confirms 1.0.0 (97). Automatic launch was denied by iOS with a signing/trust message; manual opening/profile approval requested. Manual launch confirmation and physical acceptance pending. |
| Irrigation console | Included in installed Preview 97; physical acceptance pending | Shared sculpted sprinkler SVG and accepted-power spray in Home/Devices, Start/Stop, existing zone/duration preferences, guarded five-minute steps and 5/15/30 presets; all advanced controls retained. Preferences never create a timer, automatic stop or active-zone mapping. Motion stops when reduced, covered/backgrounded or unmounted. 58 renderer + 83 native tests, app/scene types/build, 11 standalone + five native-source + five actual Home layout profiles, reload retention and bidirectional Home/Devices agreement pass. Short-phone overflow corrected through stage-based artwork sizing; tiny/large-text contained fallback retained. Signed staging package and exact 32,218,552-byte scene verified; production metadata restored. Included in Preview 97 installed in place October 27 with renewed signing. Manual launch confirmation and irrigation physical acceptance remain pending. |
| Energy equipment SVG artwork | Preview 95 installed and launched; physical acceptance pending | Four consoles redesigned and checked sequentially against the fan/laundry/vacuum presentation. Larger three-module solar array, ceramic battery tower, substantial generator and circular home instrument share lightweight typed SVG geometry with metallic/radial materials and device-local indicators. Centered artwork and compact readout rows use available space; small-screen contained fallback retained. No new network/dependency/animation loops or control changes. 46 renderer + 23 native tests, app/scene types/build, 20 embedded + 20 native-source browser layout cases and signed staging package pass. Reverified and updated in place October 26; an interrupted transfer resolved on one retry. Launch succeeded; Apple inventory confirms 1.0.0 (95), superseding 92. All-four artwork/fit/More acceptance requested. |
| End scene and reviewed restoration | Included in installed Preview 95; physical acceptance pending | Dashboard and Scenes End open a guarded review. Restore eligible previous comfort settings or keep current settings; later edits and sensitive controls stay unchanged. Latest-run receipt survives reopening in the same member/home, shares canonical atomic persistence, and never crosses renderer messages. Stale/unauthorized/canceled reviews cannot mutate; disk retry does not replay restoration. Native default materialization regression fixed. 223 host + 43 renderer tests, app/scene types/builds, ten review and five dashboard browser sizes, cancel/restore/keep/reload pass. Signed staging package/exact scene verified; production metadata restored. Included in installed Preview 95; physical restoration/Keep/reopening checks remain pending. |
| Camera Center | Preview 92 iPhone layout/navigation accepted; persistence pending | Cameras / Sample Activity, cinematic reference imagery, responsive focus/wall, scoped durable favorites, Watch, VISION Controls and Locate use existing camera identities. Current membership/room/protected access and timed Guest expiry enforced; mixed physical catalogs retain authorized configured viewers. 174 host + 52 scene tests, app/scene types/builds, ten Center and five VISION browser profiles pass. Favorite/event reload and full Controls/Activity/3D navigation verified with zero browser errors. Signed staging package, restored source metadata and exact 32,193,340-byte scene reverified. Updated in place and launched on October 24; Apple inventory confirms 1.0.0 (92). User confirms smooth camera scrolling, comfortable fit without vertical scrolling, Expand/All cameras, Controls and Locate/hotspot/Watch. User deferred the physical favorite/Night-preference reopening check for later. Simulation only; no connected media, recording or talk. See handoff. |
| Spatial Ask, isolated scene preview and foreground voice | Preview 91 installed and launched; physical checks underway | Room-aware permitted context, exact before/after card and display-only Current/Proposed/Exit preserve canonical state and camera; existing Review → Create → separate Run retained. Native five-minute opt-in Home-only phone speech recognition and synthetic system replies; no background wake engine, Realtime audio or command tool. 277 host tests/20 suites and 1,649 scene tests/131 suites pass; seven panel profiles and seven actual scene profiles checked. Original server model/schema unchanged; no paid requests or deployments during implementation. Signature/exact scene reverified and updated in place; Apple inventory confirms 1.0.0 (91). First room/preview/no-change check requested; physical permissions/audio/accuracy and complete acceptance remain pending. |
| Camera VISION console | Preview 90 installed and launched; physical acceptance pending | Architectural sample monitor in Home/Devices, guarded Arm/Disarm, Night/Alerts preferences and simulated snapshot; all advanced camera controls retained under More. Arming remains independent of host power; sample events never open gates, change presence or capture media. Canonical Demo and authenticated simulation routing added; real camera/protected access preserved. 200 focused tests, TypeScript, scene builds and bounded review pass. Eleven embedded and six native profiles fit regular sizes with ≥44px targets; tiny embedded fallback retained. Home/Devices agreement, reload persistence, More/Back and zero browser errors verified. Signed staging package/exact scene verified (32,180,310 bytes); production metadata restored and QA excluded. Installed and launched; Apple inventory confirms 1.0.0 (90). Physical camera acceptance remains pending. See handoff. |
| Door, garage and window consoles | Preview 89 installed and launched; physical acceptance pending | Distinct hinged entry, roller shutter and awning window artwork in Home/Devices, guarded Open/Close, atomic ±5% and window Vent25. Canonical saved position and all More controls retained; unknown state remains neutral with explicit recovery. Short lifecycle/reduced-motion-aware transitions, no motor/lock/sensor claims or permission expansion. 271 distinct focused tests, TypeScript, scene builds and bounded review pass. Thirteen embedded and five native profiles per fixture fit regular sizes with ≥44px targets; tiny contained fallback retained. Bidirectional Home/Devices reload retention and zero browser errors verified. Signed staging package/exact scene verified (32,163,524 bytes); production metadata restored. Package reverified and installed at the user’s request; launch succeeded and Apple inventory confirms 1.0.0 (89). Physical acceptance remains pending. See handoff. |
| Dishwasher wash console | Included in installed Preview 89; physical acceptance pending | Distinct glass chamber/racks and motion-aware spray preview in Home/Devices. Guarded Start/Resume/Pause/Stop, six programs, temperature and Dry Boost; all existing extras retained under More. Durable activity preserves legacy Pause through edits; time/progress stay fixed samples. 294 focused tests, TypeScript, scene builds and bounded review pass. Thirteen embedded and five native profiles fit regular sizes with ≥44px targets; tiny contained fallback retained. Advanced-page retention, Home/Devices agreement, bidirectional reload retention and zero browser errors verified. Signed staging package and exact scene verified (32,147,185 bytes); production metadata restored. Included in installed Preview 89; physical acceptance remains pending. See handoff. |
| Washer and dryer laundry consoles | Included in installed Preview 89; physical acceptance pending | Sculpted Home/Devices consoles reflect the authored dryer-above-washer arrangement while keeping controls and saved state independent. Guarded Start/Resume/Pause/Stop, program, temperature/spin and heat/dryness; More retains advanced settings. Durable activity preserves legacy pauses through edits; fixed time/progress samples remain explicit. Shared rotor respects visibility and reduced motion. 306 focused tests, TypeScript, scene builds and bounded review pass. Thirteen embedded and five native profiles per machine checked; regular sizes fit with ≥44px targets, tiny fallback retained. Home/Devices agreement, reload retention, More/Back and zero browser errors verified. Signed staging package and exact scene verified (32,130,770 bytes); production metadata restored. Included in installed Preview 89; physical acceptance remains pending. See handoff. |
| Fan airflow console | Included in installed Preview 89; physical acceptance pending | Sculpted Home/Devices AIRFLOW console for three ceiling fans and seven extractors. Power-preserving speed steps/presets, direction and Sleep share the property's rotor semantics; effective Sleep cap of 35% remains distinct from saved speed. Phase-preserving compositor/native-driver motion stops when hidden, off/zero or reduced motion is enabled. More retains saved-only extras. 174 focused tests, TypeScript, scene builds and bounded review pass. Thirteen embedded and five native profiles checked; regular sizes fit with ≥44px targets, tiny fallback retained. More/Back, Home/Devices agreement and reload retention verified; final browser errors zero after SVG compatibility fix. Signed staging package and exact scene verified (32,111,070 bytes); production metadata restored. Included in installed Preview 89; physical fan acceptance remains pending. See handoff. |
| Speaker audio console | Included in installed Preview 89; physical acceptance pending | Sculpted Home/Devices AUDIO console with guarded power, playback, bounded sample tracks, relative volume, mute and saved source/sound preferences. Shared status respects power, mute and zero volume; no stream or provider connection. More retains advanced controls. 163 focused tests, TypeScript, scene builds and bounded review pass. Thirteen embedded and five native profiles checked; regular sizes fit with ≥44px targets, tiny embedded fallback retained. Home/Devices agreement, More/Back and reload retention verified; final browser errors zero. Signed staging package and exact scene verified (32,096,522 bytes); production metadata restored. Included in installed Preview 89; speaker/vacuum physical acceptance remains pending. See handoff. |
| Robot vacuum console | Included in installed Preview 89; physical acceptance pending | Sculpted Home/Devices console with guarded Start/Pause/Resume/Dock, bounded relative suction and saved mode/Mop/Quiet preferences. Shared activity fixes paused/docked summaries; samples and maintenance remain truthful. 149 focused tests, TypeScript, scene builds and bounded review pass. Thirteen embedded and five native profiles checked; regular sizes fit with ≥44px targets, tiny embedded fallback retained. More/Back, Home/Devices agreement and reload retention verified; final browser errors zero. Signed staging package and exact scene verified (32,080,275 bytes); production metadata restored. Included in installed Preview 89; physical vacuum tests remain pending. See handoff. |
| Water heater and meter consoles | Preview 83 installed; iPhone interaction accepted | Sculpted Home/Devices controls retain guarded local state, bounded relative target/budget actions, profile C/F and advanced controls. Heater settings preserve power and do not imply measured heat; meter sample checks preserve readings. Budget/alerts retain existing simulated condition reports; no connected valve or new engine. 231 distinct focused tests, app/scene TypeScript and scene builds pass. Ten embedded and five native profiles per console fit with ≥44px targets; tiny embedded 320×568 keeps an internal fallback. Reload retention, Home/Devices agreement and More/Back verified; final browser errors zero. Package/signature/staging/scene checks pass (32,064,613 bytes); production metadata restored. Installed; Apple inventory confirms 1.0.0 (83). iOS initially rejected automatic launch with a developer trust/security message, but the user confirmed manual launch works; no rebuild needed. User accepted smooth interaction and comfortable fit for both consoles; physical Home/Devices agreement and reopening persistence remain pending. See handoff. |
| Entry gate console | Preview 82 installed; planned iPhone checks accepted | Home/Devices consoles project the existing entry gate only, with a single sliding leaf following accepted position and no independent clock or idle loop. Existing guarded Open/Close/Hold/Release/Resume only; no Stop, pedestrian command, engine or hardware expansion. Safety, paused restoration, countdown, holds, reload agreement and More/Back verified. 98 web/shared + 121 native tests (219 distinct), TypeScript, scene web/native builds and review pass. Fourteen embedded and five native profiles fit with ≥44px targets; 320×568 retains a 146px internal fallback with zero page overflow. Final fresh browser errors are zero. Build/signature/staging/asset/scene checks pass (32,044,461 bytes); production metadata restored. Package reverified; installation and launch succeeded after USB reconnect, and Apple inventory confirms 1.0.0 (82), superseding Preview 81. The earlier CoreDevice 4016 connection failure is resolved. User accepted iPhone fit, animation, Open/Close, Hold/Release and More/Back, then confirmed Home/Devices agreement, hold retention after full app restart and successful Release/Close. Broader safety scenarios are not implied; energy acceptance remains pending. See handoff. |
| Energy consoles | Preview 81 installed and launched; physical acceptance pending | Four selected-device Home/Devices consoles use code/SVG artwork without idle loops or invented combined flow. Battery power preserves charge/reserve/mode; reserve/storage and generator start mode remain saved preferences only. Current view grants intersect library scope for selected controls and fallback room/search/favorite results, including edit-footer removal. 113 web/shared + 106 native tests (219 distinct), TypeScript and scene web/native builds pass. Eleven embedded profiles and five native profiles fit with ≥44px controls; 320×568 keeps a 147px internal fallback with zero page overflow. Home/Devices state, More/Back focus, reload, isolated meter outage/restore, explicit generator Start/Stop and unchanged solar sample verified; final browser errors are zero. Final package signing/staging/scene hash and size (32,030,057 bytes) verified; production metadata restored. Installed and launched; Apple inventory confirms 1.0.0 (81). Physical energy acceptance remains pending. See handoff. |
| Tactile lighting controller | Preview 80 user accepted | User accepted the overall lighting experience; individual unreported physical scenarios are not claimed separately. Sculpted Home/Devices controls share power-preserving dimming, white/color presets and effect-aware appearance; More retains advanced settings. Fixed saved Color mode overwritten by unchanged temperature-only host records. 172 distinct focused tests, TypeScript, web/native scene builds and review pass. Eleven embedded profiles and five native-component browser profiles fit with targets ≥44px; tiny 320×568 keeps internal fallback. Off/on-at-zero, effects, Home/Devices agreement and reload retention verified; final fresh browser has zero errors. Signature/staging/scene hash and size (32,011,709 bytes) verified; Apple inventory confirms 1.0.0 (80). No transport or permission expansion. See handoff. |
| Smart blinds controller | Preview 79 user accepted | User says the blinds work great; individual unreported physical scenarios are not claimed separately. Sculpted Home/Devices controllers share saved position, geometry, bounded ±5% actions and presets; More preserves advanced controls. 61 scene + 49 native tests, TypeScript and web/native scene builds pass. Embedded responsive boundaries, interaction, reload retention and Home/Devices synchronization verified. No ordinary scrolling at 13 tested phone/tablet/boundary profiles; 320×568 retains accessible internal fallback. Five native-component browser profiles fit. Final fresh browser run has no errors. Signature/staging/scene hash and size (31,997,819 bytes) verified; Apple inventory confirmed 1.0.0 (79), since superseded by Preview 80. No hub, motor or permission expansion. See handoff. |
| Dashboard shell focus outline | Preview 78 user accepted | User confirmed the reported outline fix works. One CSS rule removes the whole-property-panel outline while retaining the focus-return target and interactive outlines. Ten existing tests, scene TypeScript/builds and package verification passed. No separate physical keyboard skip-link acceptance is claimed. No logic/layout/state/security change. See handoff. |
| Centered climate layout in embedded Home | Preview 77 installed and launched; physical acceptance pending | CSS-only padding and tiered layout retain a centered 208px ring in embedded Home; middle tier ≤536px, compact only ≤500px. Actual Expo host 440×860 (96px native safe-area allowance) yields iframe 440×723, 560.75px stage, 531px console and 208px ring without overflow; all 14 targets ≥44px. Boundary and other phone/tablet profiles passed. At host 320×568, the existing 103px internal stage overflow remains as an accessible scroll fallback; no page overflow. Eight panel tests, scene TypeScript and web/native builds passed; power/target and More/Back focus passed, zero errors, CSS review no findings. Preview 77 signature/staging/scene hash and size (31,986,079 bytes) passed; production metadata restored. Apple inventory confirms 1.0.0 (77). Physical acceptance remains pending; logic, authorization and persistence unchanged. See handoff. |
| Climate controller spacing | Preview 76 superseded by Preview 77 centered layout | Responds to the user's crowded orb/buttons and caption report. Web CSS adds 15px regular / 8px compact face-to-key clearance, preserves 44px keys and centers the caption at 9px / 8px; no state or native changes. Eight existing panel tests, scene TypeScript and web/native builds passed. The 11-profile standalone scene App browser sweep passed its target/overlap/overflow/caption and 23→24→23 checks with zero console errors, but missed embedded native chrome; see Preview 77 correction. Signature, staging and packaged scene hash/size (31,985,826 bytes) verified; production metadata restored. Apple inventory confirmed 1.0.0 (76) at that milestone; Preview 77 is now installed. Physical climate acceptance remains pending. Prior 212-test feature evidence is separate. See handoff. |
| Climate controller | Preview 75 installed and launched; iPhone acceptance pending | Shared controller in Home and native Devices, with advanced controls under More. Relative temperature/fan actions preserve power and existing guarded local persistence; C/F preference is scoped presentation over canonical Celsius. 147 scene + 48 native + 17 host tests (212 distinct), final app TypeScript and scene web/native builds passed. Eleven standalone scene App browser viewports passed, all 14 controls ≥44px with no overlap/overflow, reduced motion, focus, state changes and reload retention verified. Preview signature, identity, staging configuration, climate/TV markers and packaged scene hash/size (31,985,650 bytes; 30.5 MiB) passed; production metadata restored. Existing package reverified, installed and launched at the user's request; Apple inventory confirms 1.0.0 (75). Physical climate acceptance remains pending; simulation-only, no hub or expanded permissions. See handoff. |
| Tactile TV remote | Preview 74 installed; planned iPhone acceptance complete | Code-rendered remote in Home hotspot and native Devices controls; More retains advanced pages. Shared bounded Back and relative-volume actions use existing guarded local persistence. 134 scene + 31 native tests, app/scene TypeScript, scene build and ten actual App browser viewports passed; 21 keys ≥44px, no overlap/overflow, reload retention and focus verified. Signature, staging identity and bundled scene checks passed. Apple app inventory confirms 1.0.0 (74). User confirms comfortable Home remote interaction, matching source/volume/paused state through Devices, and retention after fully closing/reopening. No new dependency, renderer, permission or provider control. See handoff. |
| Arrow-free dashboard scenes and quieter Home return | Preview 73 installed; physical Home-return checks accepted | Full-width momentum scrolling, keyboard/focus recovery, no scene arrows. Initial launch film no longer replays for same-session renderer recovery after the 45-second retention budget; membership shielding remains. 75 scene + 137 native/root tests, eight browser viewport checks. User confirmed both 5-second and 60-second foreground tab returns without launch replay, with usable navigation; before/after app PID unchanged. Physical swipe feel remains unreported. See handoff. |
| Vanta home assistant | Preview 71 bounded Owner, Guest and Member checks accepted | Two real staging answers independently verified (HTTP 200, 6.4/12.1 s). Owner scene flow, Guest room/draft restrictions and account-switch cleanup, plus actual Member manual/AI scene creation, explicit Run and local restart retention passed by user report. Broader role/override configurations and quality/cost remain follow-up. No key expansion or new native build was needed. See handoff. |
| Actual card scrolling | Installed in Preview 69 | Supersedes rejected Preview 68 footer rails: cards themselves scroll horizontally with momentum; arrows move the same surface. No vertical page scrolling or gesture-triggered actions. See handoff for installation and physical acceptance. |
| Cleaner hotspot controls | Complete in Preview 67 | Decorative identity photos removed from quick/full hotspot headers; card artwork elsewhere remains. |
| Saved-device editing | Complete in Preview 66 source/staging | Rename, compatible room move and 3D reposition preserve device identity/settings. Revision conflicts and durable retries prevent stale overwrite or resurrection. See handoff for native/physical status. |
| Durable Add device and 3D placement | Complete in Preview 65 source/staging | Eight supported templates, furnished placement editor, authoritative registration/removal, restart-safe retry receipts, scoped runtime catalog. See handoff for native install and physical verification. |
| Smooth gate closing | Complete in Preview 64 source | Steady travel between one-second simulation samples; pause/interlock guards and covered-view synchronization. Native install status is in the handoff. |
| Official geography and directional weather | Complete in Preview 63 source | NLA frontage calibration, Owner-confirmed property weather pin, shared true-bearing wind/rain/plants, stable orbit compass. See handoff for map limits and install status. |
| Property compass, road markings and triangle cleanup | Complete in Preview 62 source | Original plan calibration superseded by Preview 63; unchanged property/camera placement; bounded compass, one road-paint mesh, 96 defective triangles removed. See handoff for installation and survey limits. |
| Account recovery and independent security access | Complete in Preview 61 source | Security remains reachable without a home; reviewed verified-email recovery; persistent credential completion; captured-token password mutation; home authority/runtime gate. See handoff for native installation and remaining physical/email checks. |
| Sent invitations | Complete in Preview 60 source/staging | Authorized household list, explicit pending/expired state, scoped cancellation, accept/reissue races, no implied account deletion or membership removal. See current handoff for native installation status. |
| Account sessions | Complete in Preview 60 source/staging | Private current-account inventory, deliberate other-session sign-out, exact token binding, truthful acknowledgement and token-expiry limits, native/web recovery. Physical interaction review remains separate. |
| Latest reliability audit | Complete in Preview 59 / `5ff96ad` | All 11 confirmed groups addressed; evidence in [deep rescan](DEEP_RELIABILITY_RESCAN.md). This does not replace an independent release review. |

## Most recent adjacent findings

**Coffee recipes and motion reuse:** the existing coffee power state represents
an explicit brewing preview, while recipe and schedule fields are saved
preferences. Cup steps must preserve activity and reject malformed counts. Fixed
reservoir samples come from the catalog and must not be written as editable
telemetry. The existing irrigation pulse is now reusable across both surfaces,
with lifecycle/reduced-motion tests and no new timer. Home/Devices and fresh disk
retention pass; actual brewing, scheduling and automatic completion remain outside
this simulation scope. Physical recipe/Stop/More/reopening acceptance is pending.

**Refrigerator targets and operation semantics:** existing refrigerator fields are
saved configuration, including target temperatures and quick modes. The new
relative commands preserve accepted power and both compartments independently;
malformed explicit targets disable relative adjustments rather than turning them
into plausible readings. All existing host projection fields were already present.
C/F conversion is presentation only; no cooling engine or live telemetry is added.
Fresh native disk-session retention and actual Home/Devices agreement are verified;
physical appliance behavior remains outside this simulation scope.

**Air preference projection and incomplete readings:** five existing saved air
preferences were missing from the host projection allowlist; the new round-trip
coverage verifies them alongside canonical readings. This did not change current
condition reports, which already read canonical simulation directly. Known
exceedances remain visible with alerts disabled and when another sample is absent;
unknown data cannot be substituted with a clear/zero reading. There is no live
sensor connection or physical purifier behavior. Signed-package and physical
acceptance boundaries are tracked in the handoff.

**Irrigation duration and host sizing:** malformed duration values cannot be
incremented into plausible saved preferences; explicit choices recover them.
Accepted power remains independent of zone, duration and zero-minute settings.
Actual Home iframe checks found and fixed a 12px short-phone overflow missed by
standalone sizing; this is why controller QA includes the host's header/navigation
space. No countdown, automatic stop, weather skip, soil/flow telemetry or physical
zone delivery exists. Those require a separate simulator/driver design and are
not inferred from saved preferences. Current evidence is bounded; physical iPhone
acceptance remains pending.

**Camera Center integration:** fixed duplicate navigation stacks, mixed physical /
simulation viewer routing and legacy fallback on unverified/expired access.
Protected content now remounts after camera-scope changes and actual background;
biometric inactive transitions only hide it. Guest expiry runs without another
store update. Favorites never overwrite corrupt/failed reads with defaults and
cannot be changed by stale callbacks. The small native VISION Watch-row overflow
was corrected. Relevant tests/browser evidence is in the handoff; real-media
session/cache/revocation remains unimplemented, not certified by simulation QA.


**AI preview and voice boundaries:** scene preview is an ephemeral derived rendering
layer, never a saved device transaction. The renderer rejects stale baselines,
unsupported comfort fields, denied grants and sensitive devices, and blocks both
ordinary controls and the embedded saved-scene Run transport during comparison.
Selected-room reporting omits labels/readings and returns null for layout-only
rooms. Account/home/grant/room changes retire request, preview and speech context.
The five-minute voice window requires explicit opt-in and cannot restart itself;
phone speech services may process audio. Session identity and serialized native
cleanup prevent late transcripts or spoken replies from reviving ended consent.
Physical permission, audio/interruption, accuracy and energy behavior still need
an actual-device check. Browser/unit evidence is not native microphone acceptance.

**Dependency patch follow-through:** Vite 7.3.7, Vitest/mocker 4.1.12 and
ip-address 10.7.4 resolve the newly reported findings. `security:dependencies`
passes (`work/ai-phase-one-dependencies.log`); existing braces/node-forge local
backports still pass hashes and attack regressions, although registry metadata
continues to list their versions. npm 11.17.0 resolved npm 10's optional-peer
Arborist error without a major application runtime upgrade.

**Camera simulation and privacy boundaries:** canonical simulation `on` is arming;
host camera power remains independent. Camera controls now share validated
presentation and retain all existing saved-only preferences. The sample monitor
and preview events do not represent footage, face detection, recording or audio.
Actual feed routes and camera permission guards remain unchanged. Future work
requires scoped, expiring feed provisioning and real playback/recording state;
never introduce reusable stream URLs or automatic gate actions via this console.
Native switch Space-key handling was added and tested during review. Physical
camera-console fit/touch/persistence acceptance remains pending.

**Resolved opening-position consistency:** door/garage/window consoles and status
read canonical position instead of stale power or last-command text. Unknown
position omits the moving leaf, disables relative changes and prevents NaN
sliders in both main and More views. Explicit targets recover valid state;
unknown-to-known recovery snaps instead of replaying a fabricated closed pose.
Shared persistence, projection, revoked grants and fire/gate isolation are tested.

These three fixtures have no lock state, obstruction sensor, ongoing motor timer
or auto-close engine. Future hardware controls must derive supported mechanisms,
locking/interlocks and observed positions from the actual devices through the
existing authorized transport; do not copy gate safety semantics onto them.
Preview 89 is installed and launched; physical acceptance remains pending.

**Resolved dishwasher pause consistency:** generic Idle previously hid accepted
Pause after last-action feedback was cleared. The validated activity field now
survives preferences, quick-level edits, native projection and stored restoration,
with power authoritative. Existing Dry Boost remains mapped to `extraSpin`;
renaming its storage key would lose saved preferences. All legacy modes remain
reachable through More. Native root-local gradient definitions and web artwork
aspect ratio were corrected before packaging.

The wash chamber and spray arm are decorative local previews. They do not claim
live water flow, rack occupancy, physical door position or a measured wash phase.
Samples do not advance, and program/temperature/drying/soil/rinse/schedule controls
remain saved preferences. Future hardware work needs appliance capability and
remote-start/door-interlock telemetry through the existing guarded transport path.
The dishwasher console is installed in Preview 89; physical acceptance remains pending.

**Resolved laundry pause persistence:** older washer/dryer activity relied on
last-action feedback, which preference edits clear. A validated activity field
now survives shared storage and native projection; legacy Pause is promoted
before settings or quick-level edits clear feedback. Power stays authoritative.
Tests cover malformed samples, isolated washer/dryer mutations, read-only and
revoked grants, lifecycle cleanup and preserved advanced controls. The stack
indicator describes authored geometry only; it does not share partner telemetry,
grant control or certify hardware compatibility.

Laundry program, temperature/spin, heat/dryness and schedules remain saved
preferences. Start/Pause/Stop control a local visual preview; no cycle timer,
physical remote-start interlock, temperature telemetry or completion engine was
added. Future hardware integration must derive supported programs, door locks
and remote-start availability from the actual appliance/hub capabilities.
The laundry consoles are installed in Preview 89; physical laundry acceptance
and earlier water persistence remain pending.

**Fan saved speed and effective preview:** Sleep already caps rotor speed at 35%
without changing the setpoint. The new console shows both values and keeps Sleep
enabled when a speed preset is selected. Unlike older More actions that power on,
the console's presets only change speed. Shared status now distinguishes zero
speed from running, and guarded relative actions read the latest state. Phase
preservation, motion lifecycle, access revocation and advanced-control retention
have focused regression coverage. No new motor, oscillation or lamp capability
was invented; Auto, timer and schedules remain saved preferences.

**Resolved speaker status consistency:** remembered transport feedback could
contradict current mute, zero volume or playback state. The shared projection
now serves both consoles and generic summaries; power remains authoritative.
Off pauses playback and powering on does not resume it. Invalid track/playback
samples remain unavailable; malformed volume recovers through the existing
schema before relative steps. Tests cover bounds, rapid taps, power retention,
read-only controls and revoked access. TV behavior is unchanged.

Speaker source, sound/EQ, spatial/party/night, assistant and schedule settings
remain saved preferences. Playback and numbered tracks are a silent simulation,
without a provider connection, real music metadata or advancing progress. Future
audio transport needs actual provider/hub capability and existing authorization
boundaries. Preview 85 is built, but the user's Install later choice still applies;
speaker and vacuum physical tests and water persistence remain separate.

**Resolved vacuum activity consistency:** generic Running/Idle summaries could
lose Paused/Docked after a preference edit. The shared power-authoritative
projection now also serves advanced Activity and both consoles. Maintenance
warnings use one shared precedence/threshold policy. Tests cover contradictory
saved values, malformed samples, action bounds, rapid relative taps and access
revocation. These are bounded fixes, not an exhaustive device audit.

Vacuum modes, suction, Mop, Quiet and schedules remain saved preferences. Only
Start/Pause/Dock change activity; no route, coverage, battery consumption or
scheduled cleaning engine is implied. A future live map needs actual vendor/hub
telemetry and the existing transport/review gates. Preview 84 installation is
explicitly deferred by the user; water persistence and energy physical acceptance
remain pending separately.

**Water state and reporting boundaries:** heater targets/modes are configuration
only, but water usage budget and alert preferences already drive local condition
reports. Keep that distinction: marking the new budget step actions
configuration-only would misrepresent existing behavior. Regression coverage
verifies budget alerts over unchanged samples and suppresses missing snapshots.
Sample acknowledgement does not override detected/unknown leak status. Relative
actions resolve against the latest reducer state, preserving rapid taps and
off-state settings; More retains heater type, schedules, sanitize, thresholds
and automatic-shutoff preferences. No new live device transport was added.

**Gate action and state boundaries:** the existing engine has no Stop or
pedestrian command. The new console uses only existing guarded actions and is
limited to `entry-gate`, whose clock is currently hardcoded. Artwork follows the
accepted single sliding leaf position; it never extrapolates toward a target.
Resume auto-close is shown only for the fully open, paused timer-rearm case.
Beam/sensor/vehicle safety, active emergency and hold guards remain authoritative.
Review removed duplicate web/native live announcements and fixed SVG gradient units
for vertical pickets. No engine, hardware or permission expansion was added.

Gate browser checks verified blocked controls, paused full-open restoration,
a fresh countdown after Resume, persistent holds, Home/Devices agreement and
manual closing through 100% → 75% → 0%. The final test state is closed, unheld,
beam clear and auto-close Off. All 219 distinct focused tests pass; fourteen
embedded and five native profiles fit, with a 146px internal fallback only at
the tested tiny embedded host and zero page overflow. Final browser errors are
zero. Preview 82 passed package checks again and is installed and launched;
Apple inventory confirms 1.0.0 (82), superseding Preview 81. The USB reconnect
resolved the earlier unavailable-device installation failure (CoreDevice 4016);
see the handoff receipts. User accepted the iPhone Open/Close, Hold/Release,
More/Back, smooth animation and comfortable fit without clipping. User also
confirmed matching open/held state with Close disabled through Home and Devices,
hold retention after full app restart and successful Release hold → Close.
Planned iPhone checks are accepted; broader safety scenarios, automatic-close
recovery and real hardware are not implied.
Energy Preview 81 physical acceptance is still pending: requesting the next
controller did not constitute acceptance.

**Resolved energy visibility defect:** a stale selected identity and library list
could project plausible sample defaults after its scene view grant was revoked.
Selected controls and fallback browser rooms/search/favorites now share the
intersection of current device/room grants and supplied library IDs. Rejected
selection also restores the library heading and hides edit/remove affordances.
Regression cases preserve read-only controls and optional-access compatibility;
deferred commands still use the existing live authority guard. This bounded fix
does not constitute an exhaustive security audit.

Energy samples remain selected-device readings: meter and solar values are
independent, battery charge is not editable, and reserve/storage/generator Auto
preferences do not become charging or automatic-start behavior. Browser tests
verified battery power retention, isolated meter outage/restore, generator
explicit Start/Stop and unchanged solar. All 219 distinct focused tests pass.
Native regular spacing was tightened by one point after actual-height checks;
tiny embedded 320×568 retains its 147px internal fallback with no page overflow.
Final Preview 81 packaging passed and the app was installed/launched, since
superseded by Preview 82; physical energy acceptance remains pending. Use the
handoff receipts for the final build.

**Resolved lighting persistence defect:** unchanged host temperature defaults no
longer replace an explicit saved Color mode. Real temperature edits still select
white, and legacy temperature-only records still infer white. Three new regression
cases and all 37 mapping tests pass. Browser reload retained Color/Rose/65% and the
separate 3000K white choice. Shared effects, solar streetlight rules, fire overrides,
runtime device IDs and revoked authority were checked; no new bypass was added.
Existing adaptive lighting/motion/night/auto-off preferences do not become a
hub-backed automation engine through this controller. The user accepted the
overall Preview 80 lighting experience; unreported individual physical scenarios
are not implied. Climate acceptance, hub/sync and physical iPad work remain separate.

The blinds controller uses the shared guarded state and existing cache formats,
including relative actions evaluated against current state. Review caught two
responsive fit bands; measured 540px/500px thresholds resolve them. RN-web omits
`accessibilityState.checked`, so the new preset radios also explicitly expose
`aria-checked`. These fixes do not change room grants or persistence authority.
The 320×568 host needs an internal scroll fallback; do not claim every viewport
is scroll-free. The user has accepted the overall blinds experience; physical
climate acceptance remains pending.

**P2 adjacent accessibility follow-up (source-confirmed pattern, UI check pending):**
native TV source and climate mode/preset/swing radios use the same
`accessibilityState.checked`-only pattern that RN-web omitted for blinds. Check
their web DOM/announcements and add the explicit cross-platform `aria-checked`
alias with native state retained. This is about the native components rendered
on web; do not infer broken iPhone VoiceOver behavior. Blinds is fixed and verified.

The user accepted the Preview 78 dashboard shell outline fix. Interactive focus
outlines and stable focus return remain; a separate physical keyboard skip-link
test was not reported. Existing deferrals remain.

Preview 76's standalone scene App browser sweep missed the native chrome that
reduces available height in embedded Home. The centered-layout correction uses
actual Expo embedded measurements, retains the 208px ring through the middle
tier and moves compact layout to ≤500px stage height. Host 440×860 and boundary
profiles pass; the smallest 320×568 host keeps its existing 103px internal scroll
fallback with no page overflow. Avoid claiming all profiles are scroll-free.
Eight panel tests, scene TypeScript/builds, interactions and focused CSS review
passed. Preview 77 built, passed package verification and installed/launched;
Apple inventory confirms 1.0.0 (77). Physical acceptance remains pending. State, authorization and persistence are unchanged. New
`climate-centered` evidence is separate from the earlier spacing sweep and the
original 212-test feature verification; see the handoff.

Climate temperature and fan keys now reduce current shared state, preserving
rapid presses and off-state power. Manual fan changes clear conflicting presets;
Normal clears all preset flags in one action, while older saved conflicts use the
same conservative priority as the scene airflow. The C/F presentation bridge
covers delayed preference hydration and account recovery without changing stored
Celsius targets or device authority. Browser reload retained 25°C, Dry, fan 70%,
Horizontal and Quiet; current hydration, scope/membership and save-recovery guards
remain in force. These focused checks do not replace physical climate acceptance
or independent security review; no room-temperature reading or real AC control
is implied. Preview 75 is package-verified, installed and launched; physical
acceptance remains pending. Evidence is linked in the handoff.

TV remote volume keys now dispatch relative actions against current shared state,
avoiding lost presses from a stale displayed value. Back has bounded sample-menu
semantics and persisted allowlisting. Existing hydration, access revocation and
save recovery remain in force; no remote-specific state store or permission grant
was introduced. The Home remote physical fit/interaction check passed by user
report on Preview 74, including repeated volume presses and More/Back. The user
also confirmed matching source, volume and paused state through Devices and after
fully closing/reopening the app. The planned iPhone checklist is complete by user
report; iPad/Android physical testing and real TV integration remain separate.

The reported Home "restart" was clarified as the launch animation followed by
Home. The confirmed source cause was renderer retention expiry feeding an ordinary
reload into the initial arrival film. Preview 73 separates initial admission from
later renderer loading, preserves memory release and access shielding, and covers
error/retry plus stale callbacks across account/home changes. The existing
background membership policy may still remount navigation; no process crash was
established. Preview 73 is now installed and launched at the user's request. The
user confirmed 5-second and 60-second foreground tab returns without launch replay,
with navigation working; before/after inventories showed the same app PID. This
bounded Home-return acceptance is complete; physical swipe review remains unreported.

The reported missing Member scene-creation option was clarified on October 17:
the user was still signed in as Guest. Its hidden creation tools are expected;
Member has scene authority by default, subject to explicit overrides. No defect
or permission expansion was established. The user then confirmed the Guest's
comfort-only scene request produced no review button, saved scene or light change;
the unassigned-bedroom question reported the room was not listed. The mixed
scene/door request reported scene drafting unavailable, and returning to Owner
restored Owner options with Guest answer/draft cleared. This bounded Guest checklist
is complete by user report; the separate Member checklist also passed as recorded below.
These are user-operated checks, not independent inspection of
provider answers or mixed-prompt device state; see HOME_CONCIERGE.md.

The physical Send test exposed insufficient operational diagnostics: all provider
HTTP failures became the same unavailable outcome. Fixed, bounded categories now
distinguish quota, permission, model, request, service and transport failures without
retaining provider messages, questions or keys. Public errors remain compatible
with Preview 71. The user resolved the empty API balance privately; two live
`answered` operations now corroborate their success report. Availability still
only checks configuration presence. The user subsequently confirmed the one-light
scene through Review/Create/Run. The bounded Guest acceptance is recorded above;
broader permission configurations and scene quality remain separate follow-up work.

The first physical AI connection check exposed a gap hidden by the ready-simulation
test fixture: signed-in accounts enable a transport setting with an empty endpoint,
which the assistant incorrectly treated as a configured live hub. The corrected
guard, endpoint-sensitive cancellation and actual local snapshot retry now have
real hook/client/session/persistence coverage. Generic HTTP 503 failures no longer
claim a missing key. Persistence write errors that retain unsaved in-memory edits
remain separate from read recovery; do not reset that data to make AI available.

The assistant review fixed imported scene settings expanding into unrelated editor
defaults, old tokens erasing newer reviews, pre-aborted promise rejections,
foreground availability recovery and compact keyboard/tap layout. Scope/Guest
expiry and delayed responses are covered. Local context uses current simulation
readings, not stale device registry power flags. This does not constitute an
independent security review or live-provider acceptance. See [assistant design](HOME_CONCIERGE.md).

The Preview 65 Add-device work replaces the previous local-only add path. Tests
cover uncertain saves, double submission, restart, stale account callbacks,
direct-table authority, revoked membership, removal and room binding. Standalone
TV geometry and its SQL footprint now agree. Preview 66 delivers
server-backed rename/reposition/move with optimistic revisions and exact retry
receipts. Additional fixture templates and exact furniture collision checks remain
follow-up opportunities. Household registry
placement persistence is delivered; shared simulation control-state sync remains
deferred. See the handoff for verified evidence, not a claim of exhaustive review.

Preview 66's bounded edit review also fixed missing-catalog crashes in open guest
controls, a browser-only import in the native bridge, stale edit callbacks crossing
household scope, pre-write cancellation locking the draft, removed-device recovery,
and duplicate inspector/removal keys. Tests preserve same-ID lamp, fan, AC, speaker,
TV and air-sensor settings across metadata edits and cold restart. Old-room guest
commands, including queued commands, fail after a move. Physical rename/move/reopen
acceptance is the remaining feature check; no shared control-state sync is implied.

The Preview 61 review closed recovery continuity after restart, mutable-session
password targeting, stale sign-out callbacks, overlapping credential tasks and
rapid background/resume session loading. Home admission now waits for all current
credential tasks and fresh membership; a cached or stale response cannot reopen it.
See the handoff for evidence and boundaries. No new schema or production changes.

The Preview 62 geometry pass preserved vertex/material/transform data and fixed
an export-order dependency: gas fixture preservation hashes must be established
after baseline triangle cleanup. Browser checks also caught and removed an initial
compass DOM-root teardown race. The final 21-capture sweep had no browser errors.

**Resolved in Preview 63 source:** compass and all wind/rain/plant renderers now
share an official-map true-north basis and meteorological "from" semantics.
Additional confirmed findings were fixed: main rain lacked time-dependent sideways
travel, and mixing finite-world and directional compass projections caused label
jumps at close zoom. Reduced motion, wind-path roof clearance, resource ownership,
native worklet isolation and per-household weather configuration were reviewed.
Official map alignment is not a certified survey; regional weather still cannot
represent every on-site gust. The Owner confirmed saving the official parcel pin.
See the handoff for build/install evidence and remaining physical review.

The Preview 64 manual-close report identified a confirmed presentation-cadence
mismatch: exponential easing made the gate surge at each one-second safety sample.
Constant-speed confirmed-sample animation resolves it. Adjacent rapid reversal,
pause/fault, partial target, obstruction reopening, reduced motion, scope revocation
and full-controls reveal were covered. Simulator/permission behavior is unchanged;
optional renderer labs were not changed because the report concerns the main scene.

## Next implementation priorities

**Immediate AI phase-one acceptance:** Preview 91 is installed and launched on the
iPhone 16 Pro Max; Apple inventory confirms build 91. The first Living room / light
preview / unchanged-state check is awaiting the user's observation. Test restricted-room
isolation; exact before/after values; Preview → Current / Proposed → Exit with no
saved-state changes; Review → Create without execution; and explicit Run with
Home/Devices agreement and restart retention. Check preview expiry, account/grant
changes and background recovery. On iPhone, separately check microphone/speech
permission allow/deny, opt-in wake phrase recognition, manual dictation/Hear,
synthetic reply audio, interruptions, Stop, the five-minute deadline and leaving
Home/locking the phone. No background listening or autonomous commands are intended.
Finish the dependency review above before claiming release readiness. Android and
physical iPad tests remain deferred; do not repeat already accepted older scene
flows without a relevant change.

**Gate acceptance completed:** on installed Preview 82, the user confirmed fit,
smooth animation, Open/Close, Hold/Release and More/Back, followed by Home/Devices
agreement with Close disabled while held, hold retention after full app restart,
and successful Release hold → Close. No further repetition of those checks is
needed without a change or regression. Broader safety scenarios and automatic-close
recovery remain separate physical follow-ups; preserve simulation-only commands
and paused restart behavior, with no inferred real gate or motor success.

**Immediate energy follow-up:** on installed Preview 82, open Energy pavilion
and check each energy device's full controls. Verify battery power/reserve/storage,
generator explicit Start/Stop, meter outage/restore, and More/Back. Confirm
Home/Devices settings agreement and retention after reopening. Browser/shared-state
checks already pass; physical fit/touch acceptance remains pending.

The user has accepted the overall blinds Preview 79 and lighting Preview 80
experiences and the dashboard shell fix. Individual unreported physical scenarios
remain unverified rather than being silently marked complete.

**Immediate climate follow-up:** collect the centered layout, spacing and caption
fit on the iPhone running installed Preview 77 with native chrome. Follow with full interaction, matching Home/Devices
settings and close/reopen retention, including remembered settings while powered
off. Physical layout and controller acceptance remain pending; iPad testing,
hub execution and household sync remain explicitly deferred.

**Member scene acceptance completed:** the separately invited account showed Member
and Create scene, saved a manual scene without running it, applied 30% on explicit
Run and retained its one-light scene/settings after restart. AI Review → Create
then saved Member calm without changing the light from 30%, and explicit Run
applied 20%. All outcomes are by user confirmation; Guest was preserved. See
HOME_CONCIERGE.md for the bounded evidence and untested override configurations.

Initial live assistant acceptance is complete: real authenticated answers pass,
one small scene passed Review scene, Create and explicit Run scene on the iPhone,
and the bounded Guest checklist is complete by user report. Broader role/override
configurations remain distinct follow-up work beyond the completed Member checklist.
Record actual quality, latency and cost without treating two requests as a benchmark.
Do not treat the availability response as a provider health test. Never read or store the key in
chat, repository, screenshots or evidence. See the handoff for prepared tabs/state.

1. **Account lifecycle:** safe email changes, account deletion with ownership/data
   dependencies, ownership transfer, and optional whole-app biometric lock.
   Establish recent server-verified authentication for high-impact operations;
   sensitive-action local biometrics already exist and must not be confused with
   whole-app locking or server authorization.
   Dependencies confirmed in the current source: email changes require a dedicated
   account-bound PKCE intent and hosted dual-mailbox confirmation checks; refresh
   JWT email claims and invitation lists only after confirmation. Deleting an Auth
   owner currently cascades through `homes.owner_id` (`001_init.sql`), so ownership
   transfer and data-dependency review must precede any account-deletion endpoint.
   Whole-app locking needs one native gate for UI, runtimes and commands plus
   enrollment/storage recovery and real biometric tests; a visual overlay alone
   is insufficient. Do not reuse simulation-skipped action confirmation as a lock.
2. **Session revocation enforcement:** assess session-aware checks throughout the
   database/API authorization paths before promising immediate revocation.
   Supabase sign-out prevents future refresh; existing JWT access can last until
   expiry. Inventory can show only stored sign-ins, not online physical devices.
   Current own-session access must remain usable without granting household access.
3. **Performance:** finish controlled full-scene frame-rate and static-versus-tour
   energy measurements, then optimize measured bottlenecks. The earlier 100%-brightness
   whole-device estimate is not an app-only battery result. See
   [physical baseline](PHYSICAL_PERFORMANCE_BASELINE.md).
4. **Native release evidence:** smoke-test changed Preview paths, establish Android
   native/device coverage, and production signing/store build workflows. Complete
   an independent security review before public/customer release.

## Explicitly deferred

- **Further AI scope:** the authorized October 22 phase-one source now includes
  room-aware Ask, exact before/after values, isolated scene preview and bounded
  foreground phone voice. Packaging/physical acceptance are still pending as above.
  The [AI experience roadmap](AI_EXPERIENCE_ROADMAP.md) retains later proposals for
  grounded explanations/preferences, routine drafts, measured energy/water and
  home care, richer conversational audio and bounded hub policies. No multi-turn
  refinement, new telemetry/manual/history adapter, OpenAI Realtime audio, routine
  generation or autonomous operation is implied by the first slice. New data needs
  explicit scope, authorization and quality evidence.
- Hub pairing, real-device bindings/observations and durable app-closed routines:
  no hub yet; NUC 15 is the intended direction. Reuse the existing SQLite worker
  foundation rather than recreating it. Respect the supervised one-light pilot.
- Household scene/routine/profile sync. Current personal data and definitions
  remain local; generic peer identity is not completed profile sync.
- Physical iPad testing, at the user's request. Responsive browser evidence is
  still required for tablet portrait and landscape.

## Integration work after the foundations

- Remote push with tested closed-app delivery, preferences and quiet hours.
- **Authenticated camera media:** the simulation Camera Center slice from the
  [camera plan](CAMERA_EXPERIENCE_DESIGN.md) is implemented; native interaction
  acceptance is pending. Before real footage, resolve media-session provisioning/expiry/revocation,
  thumbnail cache isolation, resume/freshness, the missing recordings timeline
  and legacy recognition/entry coupling. Validate native playback and exact
  Frigate/go2rtc/hub compatibility in a separately scoped camera pilot.
- Assistant commands confirmed by actual observed device state.
- Shared backup/restore and event retention design alongside household sync.

## Useful opportunities, not confirmed defects

- **Device Health:** one view for stale telemetry, low batteries, connectivity
  and maintenance. Never infer offline from a powered-off device or invent history.
- **Richer Routines:** open-for-duration and conditional branches in the canonical
  editor/executor, with restart/DST policy decided before durable hub execution.

## Discovery discipline

For each milestone, trace UI → service → authorization/storage → response → UI.
Check account changes, permission loss, stale callbacks, offline recovery,
concurrent edits, background/resume, malformed data and responsive accessibility
where relevant. Add a regression for each demonstrated correctness/security bug.
Move completed work out of the active queue with evidence, and retain a concise
next action for open work. Broader audit passes should have a defined scope;
passing tests never establishes that no further vulnerability exists.
