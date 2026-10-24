# VantaHome camera experience

Research baseline · October 20, 2026 · Source baseline: `410f768`

Simulation implementation update · October 23, 2026

Build one **Camera Center** within the existing Cameras destination: a camera
wall for awareness, a focused viewer for watching and talking, and an activity
timeline for finding what happened. Keep VISION as the camera's controls console.
The 3D house remains Home; its camera hotspots lead into this same experience.

The user subsequently authorized the simulation Camera Center. Its first slice is
implemented: **Cameras / Activity**, a phone hero and momentum camera strip,
portrait/landscape tablet overview, optional paged wall, focused viewer, scoped
favorites, VISION Controls, and Locate back to the existing 3D hotspot. Watch is
available from camera hotspots and VISION. No second property renderer is mounted.

The preview uses existing bundled generated illustrations, identified as visual
references, not property-camera footage. Activity projects the last saved sample
event per camera; no photo, video, capture timestamp or recording is fabricated.
Camera.live, camera.history, camera.manage, current household/room grants and
protected access stay separate. Account/session/scope changes retire the view;
Guest expiry updates without an unrelated event, and background removes content.
Favorites persist locally per account/home/member with ordered writes and retry.

Authorized configured physical cameras keep their existing viewer, including in
a mixed catalog. No live feed, authenticated media session, microphone/talk,
recording timeline, export, hardware pilot or permission expansion was added.
Those portions of the original plan below remain future work. See the
[working context](WORKING_CONTEXT.md) for build and acceptance evidence.

## Playback foundations from the research baseline

| Path | Current capability |
| --- | --- |
| More → House → Cameras | Overview of authorized cameras, with All cameras / Powered on / Armed filters. Pages contain one camera on phones, two on tablet portrait and three on tablet landscape. |
| Cameras → Go live / Try live | Explicit playback request for a configured stream URL; Stop live / Stop all release players. |
| Cameras → Expand | Single-camera viewer; Controls opens device details. |
| Home hotspot or Devices → modeled camera | VISION simulation controls for Entry, Driveway and Terrace. Architectural sample artwork, arming, night/alert preferences and a sample snapshot event; no actual image capture or live player. |

The existing `expo-video` player starts muted, checks player readiness and first
frame, supports retry, and releases playback on background/unmount. These are
foundations for media playback, not evidence of connected property cameras.
There is no hub or verified real feed yet.

Source anchors: [menu](../src/features/home-shell/homeDestinations.ts),
[overview](../src/screens/CamerasScreen.tsx),
[viewer](../src/screens/CameraViewerScreen.tsx),
[player](../src/components/LiveVideoPlayer.tsx),
[VISION](../src/features/three-d-home/CameraController.tsx),
[simulation routing](../src/features/three-d-home/simulationDeviceBindings.ts).

## Where people should go

Keep **More → House → Cameras** as the complete destination. Do not add a sixth
bottom-navigation tab or another permanent Home header row. A camera hotspot
should offer **Watch** and **Controls**, with Watch opening that camera directly
when viewing is authorized. Devices should offer the same actions. Include
**All cameras** in the focused viewer so the overview is always one action away.

Camera Center needs only two main sections: **Live** and **Activity**. Privacy,
recording policy and connection management belong in camera settings; VISION
contains everyday controls. All routes use the same camera identity and state.
Back returns to the originating room, device or camera wall without restarting
the home launch animation.

```text
3D camera hotspot ── Watch ────────┐
Devices → Camera ── Watch ────────┤
                                ▼
More → House → Cameras     Focused camera
        │                 Watch · Talk · Snapshot
        ├─ Live wall ◄─── All cameras
        └─ Activity ──── Recorded event
                                │
                             Controls
                                ▼
                         VISION → More settings
```

In simulation, show **Demo preview** and **Sample activity** explicitly. A
generated image or rendered camera viewpoint must never carry a Live badge.
When hardware is unconfigured, show **Camera not connected** with setup available
to authorized managers; do not endlessly attempt an invented URL.

## Visual direction

Use a quiet, near-black viewing surface with the existing violet palette in
navigation, a restrained selected-camera edge and tactile VISION controls.
The video itself keeps its natural colours. Avoid tinted footage, decorative
scan lines, animated lens overlays, huge glowing frames and text across faces.

A camera tile contains the full image, its name, source timestamp and a truthful
state. Use an aspect-preserving fit by default; explicit digital zoom may crop,
with a visible reset action. Preserve portrait doorbell and panoramic aspect
ratios rather than forcing every source into a cropped 16:9 image.

The signature interaction is **camera to place**: from the viewer, tap Locate to
return to the corresponding 3D hotspot. Later, an optional field-of-view wedge
can show calibrated mounting direction and lens angle. Until those values are
measured, label it approximate; the modeled camera position cannot prove real
coverage or the absence of blind spots. Do not keep a second 3D scene running
beside video just to animate this transition.

Use short transitions that preserve the player's session where appropriate,
and a static change under reduced motion. No idle camera tour, automatic audio
or full-screen takeover during ordinary activity. Keep the selected camera
stable while new events appear in a separate strip.

## Layout by viewport

| Viewport | Live layout | Interaction |
| --- | --- | --- |
| iPhone / Android portrait | One generous selected feed, then a horizontal strip of other cameras and recent events. A Wall switch shows a compact overview when desired. | Swipe the thumbnail strip with momentum; tap to select. One active video by default. Keep controls within thumb reach. |
| Small phone / larger text | Prioritize the feed and essential Watch / Talk / Controls actions. Activity and advanced settings occupy their own views. | Never shrink labels or touch targets to force a fit. A contained accessibility scroll is preferable to clipping if enlarged text requires it. |
| Tablet portrait | For the current three cameras, one wide feed above two smaller tiles. Use a two-column wall for larger collections, up to four visible tiles. | Tap a tile for focus. Additional cameras use horizontal pages. |
| Tablet landscape / desktop tablet preview | One large selected feed with two smaller feeds beside it for this three-camera property; optional equal-sized wall. | Activity sits in a bounded side rail or its own tab. No whole-page vertical scrolling. |

Regular supported sizes should fit without vertical page scrolling. Use smooth
horizontal scrolling, touch momentum, reduced overscroll, page indicators and
accessible camera selection; do not add arrow clutter. Avoid stealing pinch/pan
gestures inside zoomed footage. Test controls at minimum 44pt on iOS and 48dp on
Android, safe areas, keyboard focus, screen readers and reduced motion.

Tablet layout concept:

```text
 CAMERAS                 Live  /  Activity          Settings
 ┌──────────────────────────────────┬──────────────────┐
 │                                  │ Driveway         │
 │ Entry camera                     │ [feed / snapshot]│
 │ [large, unobstructed footage]     ├──────────────────┤
 │                                  │ Terrace          │
 │                                  │ [feed / snapshot]│
 └──────────────────────────────────┴──────────────────┘
 Sound       Talk       Snapshot       Controls       Expand
 Recent activity: [event + time]  [event + time]  [event + time]
```

This is a layout proposal, not a screenshot of implemented functionality.

## Features worth building

### First camera-viewing release

- **Focused viewing and a camera wall:** favourites/order saved per account and
  home. Offer Auto / Data saver / High quality. Full-screen viewing keeps phone
  portrait support and does not require rotating the device.
- **Truthful connection feedback:** show Connecting, Playing, Reconnecting,
  Last snapshot, Not connected, Unavailable or Privacy as appropriate. A stream
  must continue advancing before it can claim live playback; initial readiness
  alone does not detect a later frozen image. Show delay only when timing data
  supports it. A timeout means unavailable, not proof the camera is powered off.
- **Sound and talk:** muted by default, one audible camera at a time. Request the
  phone microphone only when Talk is used. Provide push-to-talk plus an accessible
  start/stop alternative with a visible timer and bounded timeout. Stop sending
  audio on release, interruption, navigation, permission loss or backgrounding.
  Enable this only after the specific camera's audio path is verified.
- **Real snapshots:** explicit capture, completion/error feedback and protected
  access. Saving outside the app is a separate export action. Preserve the current
  sample-event wording until actual capture exists.
- **Controls without clutter:** VISION remains one tap away. Keep arming, power,
  recording, microphone, night settings and alerts distinct. Show requested versus
  confirmed changes; arming is not proof of recording or stream availability.

### Once recording and event services exist

- **Activity timeline:** camera/date/type filters, thumbnail scrubbing, short
  event previews, recording gaps and a prominent Return to live. Show the
  property's timezone, including America/Jamaica for the current home; identify
  any device-time display separately. Preserve event time when switching cameras.
- **Useful notifications:** group related detections, apply quiet hours and
  cooldowns, and support snoozing a camera's notifications without disarming it.
  Doorbell calls can be prominent when supported; routine movement should not
  interrupt the whole app. Private images on lock screens require explicit opt-in.
- **Recording controls:** per-camera retention, actual available history and disk
  health. Distinguish recording disabled, missing footage, expired footage and
  permission denied. Exports have a separate lifetime and deletion policy.
- **Zones:** separate activity zones, nuisance-motion exclusions and privacy
  masks. Verify masking at the camera/recorder before recording, thumbnails,
  playback or exports; a cosmetic UI overlay is insufficient.
- **Camera health:** last successful contact, stream/recorder faults, clock drift,
  storage failures and tamper/obstruction events when the provider supports them.
  Avoid a reassuring “All secure” label derived merely from camera power.

Frigate documents grouped review events, filters and per-user reviewed status;
reviewing does not delete footage. This supports an event-first Activity view
without conflating it with the recording archive.
[Frigate Review](https://docs.frigate.video/usage/review/)

UniFi distinguishes detection/exclusion zones from privacy zones that black out
recorded regions. VantaHome should preserve that distinction in plain language.
[UniFi camera zones](https://help.ui.com/hc/en-us/articles/360056987954-UniFi-Protect-Manage-Camera-Zones)

### Later, only where useful

PTZ presets, doorbell answering and floodlights should appear only for hardware
that supports them. Digital image panning must not be presented as moving a lens.
Synchronized multi-camera playback needs timestamp alignment and explicit gaps.
Picture-in-picture needs permission-loss and background-policy verification.

An assistant could eventually answer “What happened at the gate?” from authorized,
timestamped events and link directly to evidence. Start with local event labels;
do not send private frames to OpenAI or another cloud service by default. Natural
language summaries must not invent identities or activity. Facial recognition,
plate recognition, cloud visual analysis and autonomous security actions stay
out of the first release. None is necessary for an excellent camera experience.

## Privacy and authorization

Preserve current room/device scope and `camera.live`, `camera.history` and
`camera.manage`. In the current role defaults, Members may view live/history but
cannot manage; Guests/Tenants have no camera permission. Shared property layout
never grants camera access. Changes require deliberate household policy, not
navigation convenience. See [permissions](../src/security/permissions.ts) and
[protected access](../src/security/useProtectedAccess.ts).

Define separate authorization for exporting footage and transmitting audio before
adding those actions; they are not automatically implied by permission to watch.
Check every thumbnail, stream, clip, event, search result and export at the server,
not just the list screen. Remove private media immediately on account/home change,
access expiry or revocation; late callbacks cannot repopulate it.

Default private thumbnails to memory-only handling with account/home isolation.
Clear player frames, in-flight requests and caches on sign-out or scope loss.
Protect the app-switcher preview. If protected offline downloads are introduced,
give them explicit expiry, encrypted storage and a separate threat review. A
shared device must not display the previous person's camera image.

Privacy mode needs an explicit definition: whether viewing, recording and audio
are actually disabled, and whether hardware shutter state is observable. Report
pending/unconfirmed privacy changes honestly. Powering off the UI, disarming or
muting alerts is not equivalent to physically disabling the camera.

Gate camera viewing must remain separate from gate authority and safety. A
future gate action needs its own authorization, deliberate confirmation and
observed state. Vision, visitor recognition or absence of detected people cannot
replace gate safety sensors or prove it is safe to close. The legacy recognition
callbacks need review before any real camera/entry integration.

## Best-fit technical direction for the planned NUC

Use **VantaHome for the experience, Frigate for local recording/events, go2rtc for
media distribution and Home Assistant for household integration**. This is the
preferred direction to validate against the eventual camera models and exact NUC
15 configuration; it is not a guarantee that every camera or codec will work.

Keep media delivery separate from the 3D renderer and the normal device-command
path. Display native video in a dedicated screen instead of decoding multiple
feeds into Three.js textures. Reuse existing navigation, identities and protected
access, while adding a camera-media service that supplies short-lived, narrowly
authorized sessions. Raw camera passwords and administrator credentials stay on
the hub/server, outside client state, logs, scene messages and persisted catalogs.

Frigate's go2rtc restream can share a camera connection between consumers rather
than opening a new camera connection for every app.
[Frigate restreaming](https://docs.frigate.video/configuration/restream/)

Home Assistant supplies a go2rtc WebRTC proxy. Frigate's browser player uses MSE
and can use WebRTC, including for two-way talk. These capabilities do not establish
compatibility with VantaHome's native `expo-video` player. Prototype authenticated
WebRTC for low-latency viewing/talk and suitable HLS playback/fallback on actual
iPhone, iPad and Android hardware before selecting a native media dependency.
[Home Assistant go2rtc](https://www.home-assistant.io/integrations/go2rtc/),
[Frigate live playback](https://docs.frigate.video/configuration/live/)

Start with one active phone stream and a provisional ceiling of four visible
tablet streams; measure before raising it. Use lower-resolution substreams for
wall tiles and higher quality for the selected feed. An explicitly selected Live
session stays live; periodic stills in an economical overview carry snapshot
timestamps. Battery cameras need a deliberate wake path, not constant polling.
Suspend hidden players and the obscured 3D render; stop audio on backgrounding.

Frigate documents idle snapshots that switch to streaming on activity. UniFi
uses lower-quality streams for multiview and higher quality for focused viewing.
These are useful patterns, not measured VantaHome performance results.
[Frigate smart streaming](https://docs.frigate.video/configuration/live/),
[UniFi third-party streams](https://help.ui.com/hc/en-us/articles/26301104828439-Third-Party-Cameras-in-UniFi-Protect)

Use a capability inventory: local stream access, main/substream codecs, snapshot,
audio receive/transmit, PTZ, recording, events, privacy and health. Record verified
capabilities by model/firmware; an ONVIF label does not promise all features.
Confirm Intel acceleration, storage endurance/capacity and concurrent workload on
the chosen NUC. Frigate recommends compatible codecs and multiple substreams;
recordings support per-camera retention.
[Frigate hardware](https://docs.frigate.video/frigate/hardware/),
[Frigate recording](https://docs.frigate.video/configuration/record/)

Camera setup should follow **Connect hub → Discover cameras → Match to property
→ Set privacy/access → Test view**. Match a discovered camera to the existing
Entry, Driveway or Terrace fixture, or create a new positioned fixture through
the established device flow. Persist a stable provider/camera identity separately
from its changing network address and media session. Reconnection must not create
duplicate devices or erase placement. Preview exactly who can view before saving;
adding a camera to a visible room must not silently grant it to Guests/Tenants.

Use authenticated backend paths throughout. Frigate's authenticated port enforces
roles; its internal unauthenticated port bypasses them. Its standard viewer role
can see every camera, whereas custom roles can restrict cameras. Those roles also
bundle viewing/history/export capabilities, so they cannot alone represent all
VantaHome distinctions. Missing/deleted mappings must fail closed, never fall back
to broad viewer access. Test this at every media endpoint.
[Frigate authentication](https://docs.frigate.video/configuration/authentication/)

Protect the separate go2rtc endpoints too: its documentation warns that default
LAN exposure permits viewing without authorization. Use private API/RTSP bindings
and firewall rules, with authorized signaling and media delivery. Frigate's HTTP
login does not secure a separately exposed stream service. Expiry/revocation must
terminate established viewing and talk sessions at the server, not merely hide
the player or refuse the next request.
[go2rtc security](https://github.com/AlexxIT/go2rtc#security)

For a later private remote pilot, prefer a VPN and separately validate the actual
media path, including reconnects and any relay. Home Assistant documents Cloud
and VPN access, but Cloud access to Home Assistant alone does not prove remote
Frigate media works. Avoid publicly exposed camera/RTSP administration ports.
Do not claim end-to-end encryption without verifying the complete media route.
[Home Assistant remote access](https://www.home-assistant.io/docs/configuration/remote/)

Internet failure and local-network failure are different. An authorized local
hub could keep viewing/recording available when the internet is down, but that
requires a reviewed local authorization and expiry policy. The current app's
fail-closed household verification must not be bypassed by cached camera grants.

## Concrete gaps to address before real footage

| Finding at the source baseline | Next action |
| --- | --- |
| Menu says “Views & recordings,” but the current viewer has no archive/timeline. | Match copy to available capability in the first camera UX task; add Activity only with clearly labeled samples or real archive data. |
| Static stream URI groundwork; no authenticated media-session provisioning/expiry/revocation service. | Design session issuance, renewal, scope checks and shutdown across all media endpoints before a hardware trial. |
| `CameraThumbnail` uses `memory-disk` caching. | Establish private media isolation/purge rules and verify them across accounts; stripping persisted URLs alone does not remove downloaded images. |
| Foreground remount can resume player playback. | Reauthorize/renew, respect route focus and stop stale callbacks; exercise background, expired access and network changes. |
| Existing playback readiness is not a continuous freshness check. | Detect stalls and distinguish playing, delayed, snapshot and unavailable without fabricating device health. |
| Legacy recognition callbacks can update presence/request gate opening. | Separate recognition, household presence and entry actions before connecting real recognition events. |

Additional source anchors: [thumbnail cache](../src/components/CameraThumbnail.tsx),
[legacy camera details and callbacks](../src/screens/DeviceDetailScreen.tsx),
[status interpretation](../src/features/cameras/cameraStatus.ts).
These are implementation gaps and readiness risks, not observed private-feed leaks.

## Delivery sequence and acceptance

1. **Design implementation, when requested:** evolve the existing Cameras screen,
   connect Watch / Controls / All cameras navigation and build simulation states
   with unmistakable sample labels. Preserve VISION and current permissions.
2. **One real camera pilot, after hub and camera selection:** define camera scope,
   authenticated sessions, cache policy and native transport; prove viewing,
   reconnect, revocation and audio where supported. This requires a camera-specific
   pilot decision and does not expand the existing supervised light pilot.
3. **Camera wall and recording:** validate all three property cameras, bounded
   streaming, Activity, storage/retention, playback and protected exports.
4. **Advanced features:** capability-gated PTZ/doorbell actions, synchronized
   review and optional evidence-linked assistant summaries after the basics pass.

Acceptance must cover phone portrait, tablet portrait/landscape and desktop tablet
preview; no ordinary vertical page scroll, no clipped controls and reduced motion.
Physical iPad testing remains deferred until the user resumes it. A provisional
warm-LAN first-frame target of two seconds is a measurement goal, not a promise;
record cold start and remote latency separately. Run sustained one-stream and
tablet-wall tests for heat, battery, memory, network changes and recovery before
claiming smooth performance.

Verify Owner/Member/Guest, cross-home/account changes, live-only access, revocation
during viewing/talk/export, stale thumbnails and expired sessions. Test storage
full/disconnected, missing segments, camera clock drift, muted audio, unsupported
features and recorder restart. Reopening should retain harmless preferences but
never revive an old media credential or the previous user's image.

When implementation resumes, read this brief and the maintained backlog first.
Recheck vendor/version compatibility then; no new dependency or device purchase
was selected or installed by this research task.
