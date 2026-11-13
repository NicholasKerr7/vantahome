# VantaHome Arrival: cinematic account access

Research and proposed design, November 13, 2026. **Not implemented.**

The user requested research before execution: an immersive cinematic gate and
credential panel for login, recovery, invitations, ownership transfer and related
access states. This document records the recommended design and its boundaries.
No app code, account behavior, media, provider settings or native package changed
during this research. New media generation and implementation await the next phase.

## Design decision

Make entering VantaHome feel like arriving at a beautifully designed private
residence. Use one architectural environment and a stable, tactile access panel
throughout the journey. Its lighting and gate position respond to actual account
state. The panel always uses real native controls.

The signature moment is a thin violet seam crossing the gate, a restrained light
confirmation and the gate separating to reveal a warm entrance beyond. It occurs
only after authentication **and current home admission** succeed. This is a visual
metaphor: it must never send a command to the property's gate or any other device.

Before identity verification, show a generic VantaHome entrance: no real address,
household name, floor plan, occupants, camera feeds, device state or weather pin.
After verified access, the actual home name and permitted destination can appear.
The visual should not imply that guests acquire additional rooms or controls.

## Art direction

- Architecture: wide graphite sliding gate, carefully proportioned stone piers,
  narrow brushed-metal details and a small illuminated VantaHome crest.
- Setting: blue-hour tropical garden, warm indirect path lighting, restrained
  reflections and a soft distant residence silhouette. Keep the camera steady
  while people read or type. No permanent rain, storm or live-weather request.
- Palette: preserve the established purple identity, including accent `#B46BFF`
  and readable accent text `#DFC4FF`; use deeper rendered shadows and warm stone
  within the artwork. Do not globally replace the dashboard palette.
- Panel: a dark, softly opaque surface with a fine illuminated edge, recessed
  fields, generous spacing, clear labels and one dominant action. Reflections
  belong in the artwork, not over text. Avoid full-screen neon outlines and
  stacked glass cards.
- Typography: short editorial headings, existing app typefaces and sentence-case
  actions. Use a quiet status line such as “Verifying home access…” rather than
  fake security telemetry, invented progress percentages or biometric scan claims.
- Signature detail: the existing crest is etched into the entrance totem. A brief
  edge-light response connects the on-screen action to the architecture. Do not
  distort or regenerate the master brand mark.
- Sound: silent by default. Optional haptic confirmation can follow existing
  preferences; no automatic voice announcement of account or household details.

## Storyboard and truthful states

| Stage | Visual treatment | Panel and behavior |
| --- | --- | --- |
| First signed-out arrival | Closed gate, one brief light sweep, settled camera | “Welcome to VantaHome.” Sign in and Accept invitation remain easy to find; Forgot password stays near the password field. Inputs work immediately. |
| Credentials submitted | Small totem light response; gate stays closed | Real checking state, guarded submission and inline errors. No named-property recognition based only on an entered email. |
| Additional verification | Same stable entrance and focused panel | Existing MFA/recent-auth requirements remain explicit. Code autofill/paste and recovery navigation stay available. |
| Invitation code verified / credential setup | Focused credential panel | A newly enrolled invitee completes required password setup before household review. Identity verification alone never opens the home. |
| Credentials ready / invitation review | Invitation card enters the panel | Show the verified invitation's home, role, room scope and expiry. Explicit Accept/Decline remains separate from identity verification and password setup. |
| Home access confirmed | Violet seam resolves; gate begins to separate | Welcome text may identify the permitted home. Hand off to the existing readiness coordinator without another mandatory trailer. |
| 3D still preparing | Calm open entrance or matching still | Verified controls remain available through the existing escape path. Do not imply 3D readiness until the renderer reports it. |
| Forgot password | Quiet closed entrance; a small message indicator | Neutral email response, resend/retry/back states, then the existing verified reset flow. “Email sent” is not “Access granted.” |
| Password reset | Focused credential panel | Preserve correct account/session binding, confirmation and completion behavior. Password completion alone never opens a home. |
| Offline / unverified / expired | Stationary entrance with a clear status | Show expiry only when established by the invitation/access record; otherwise show unable to verify. Retain Retry, Sign out and independent account security where available. Never infer expiry from network failure or imply access can be granted offline. |
| Ownership handover | Same materials, more restrained authenticated review | Show exact property, current owner, verified recipient and consequences. Separate offer, pending, recipient decision, cancellation, expiry and confirmed completion. No theatrical transfer on button press. |
| Returning verified session | Matching still or short dissolve | Resume without replaying the gate introduction on every Home-tab return. Current access checks still apply. |

Ownership transfer belongs under authenticated household management. It is not a
public sign-in tab. Existing behavior requires an offer to an accepted Admin or
Member, separate acceptance by the exact recipient and a 24-hour offer expiry.
Sending and accepting require password authentication within five minutes and
AAL2 when a verified MFA factor is enrolled. Read/cancel/decline still require a
current valid session but do not impose that recent-password requirement.
The former Owner becomes Admin after confirmed acceptance. Preserve server
enforcement, cancellation, private-state clearing and ambiguous-result recovery.
Hosted two-user acceptance remains pending independently of this design.

Public signup and Apple/Google buttons remain configuration-driven. This redesign
does not introduce public registration, new providers, passkeys, biometric login
or a new identity service. Those require a separate product and security decision.

## Motion and layout

Timing below is a design target, not a measured implementation result:

- Initial decorative arrival: approximately 1.0–1.4 seconds, then settle. Never
  delay form mounting, autofill, navigation or submission for it.
- Typing: freeze environmental motion; keep focus and text stationary. Stop any
  introductory movement immediately if the person interacts.
- Confirmed admission: approximately 0.6–0.9 seconds of interruptible gate/light
  motion, overlapping readiness work. No extra minimum loading duration.
- Reduced motion: still gate states and short dissolves; no push-in, parallax,
  zoom or repetitive glow. Start still until the system preference is known.
- Background, covered navigation and sign-out: stop media/animation immediately;
  invalidate private content synchronously, without waiting for a closing film.
- Default idle treatment is a settled image, not an endless loop. Any optional
  future continuing ambient motion must have a pause control as well as respect
  reduced motion. Repeated short loops still count as continuing movement.

Phone portrait uses an entrance hero above a reachable lower credential panel.
On a large iPhone the architectural opening remains visible; with the keyboard
open the art yields space to the fields and primary action. Tablet portrait has
a wider, calmer composition; tablet landscape uses the entrance on the left and
a bounded panel on the right. Desktop remains the supported tablet-style preview.

Normal supported layouts should fit without vertical page scrolling. Small
screens, enlarged text and the keyboard retain a contained, accessible scroll
fallback with touch momentum and reduced overscroll. Never shrink text or clip
recovery/error actions just to claim zero scrolling. Target at least 44 logical
pixels for actions, persistent field labels, visible focus, screen-reader status
announcements, password-manager/OTP autofill and unrestricted paste. Move focus
deliberately between steps, not when decorative media changes.

## Tool and rendering plan

Use a lightweight hybrid of rendered artwork and native UI. Do not mount the
full Three.js house before authentication just to draw this entrance. The current
offline scene bundle is approximately 32.3 MB before runtime decoded geometry;
it serves the signed-in property experience, not the credential form.

| Tool / existing capability | Role in the proposed work |
| --- | --- |
| Blender | Build an exact, editable generic gate and render matching camera/lighting plates, masks and controlled opening references. Test compositing perspective and occlusion before committing to an animation format. |
| Higgsfield Cinema Studio | Explore cinematic look, atmospheric treatment and optional short film variants from approved non-private references. Never generate credential text or decide application state. |
| Existing SVG + native animation | Crest, fine light accents, exact state transitions and composited gate movement when the rendered layers permit it. Use the current motion policy and styling system. |
| Existing `expo-video` / `ArrivalFilm` | Optional bundled, silent film with matching poster and graceful decode failure. One active player; no streaming requirement or overlapping players. |
| Existing auth and home-access hooks | Continue to own identity, invitation, recovery, membership, transfer and error handling. Presentation reflects these results; it does not duplicate authority. |

Preferred gate technique: a fixed camera with independently rendered sliding
gate layers, appropriate masks/shadows and native translation. Validate that this
looks physically convincing on phone/tablet. If it does not, use a short matched
opening clip after confirmed admission, with an immediate still fallback. Avoid
a long image sequence or a new runtime 3D engine just for the opening.

Higgsfield's live read-only catalog on November 13 exposes
`cinematic_studio_video_4_0`, including reference images, start/end frames, portrait
and landscape ratios, silent output and 4–30-second source durations. Its minimum
source duration is **not** an app loading-time requirement: select/retime a short
usable interval offline. Recheck constraints and cost before any future generation.
No model call, upload, costed estimate or generation job was submitted here.

Candidate package budget: at most 3 MiB for runtime entrance media, one active
decoder, posters available without network access and 30 fps source films.
These are starting targets to validate on hardware, not performance guarantees.
Native controls must remain responsive even if every decorative asset fails.
Avoid adding libraries unless a measured need survives reuse of the current stack.

Keep source artwork, scene file, camera/lights, generation provenance, brand
references and optimized exports traceable. Check usage rights before shipping;
a generation record establishes provenance, not a rights grant. Production
prompts and references must not contain account data or private property details.

## Current implementation seams checked

| Existing source | Reuse / boundary |
| --- | --- |
| `src/features/auth-entry/AuthEntryFrame.tsx` | Shared native fields/actions, labeled inputs, password reveal, keyboard avoidance and scroll fallback; replace the visual frame. |
| `src/screens/AuthScreen.tsx`, `src/features/auth-entry/useAuthEntry.ts` | Login/invite/recovery/configured signup/provider decisions, validation and submission ownership. |
| `src/screens/PasswordRecoveryScreen.tsx`, `src/services/invitationPasswordSetup.ts`, `src/services/passwordRecoverySetup.ts` | Preserve separate credential completion records and captured session identity. |
| `src/services/authFlow.ts` | Preserve expiry, device-initiated recovery/OAuth correlation, PKCE and verification boundaries. |
| `src/features/home-access/HomeAccessScreen.tsx`, `src/features/home-access/useHomeAccess.ts` | Explicit household acceptance/creation, scope display and uncertain-result recovery. |
| `src/features/ownership-transfer/`, `src/features/household/ownershipTransferAccess.ts` | Authenticated offer/review/decision with server-backed authority; no public handover shortcut. |
| `src/features/arrival/CinematicArrival.tsx`, `src/features/arrival/ArrivalContext.tsx` | Current account/home-scoped readiness, 300 ms reveal, 8-second useful recovery threshold and no film-duration wait. Extend this coordinator instead of stacking loaders. |
| `src/features/arrival/ArrivalFilm.tsx`, `src/features/arrival/ArrivalFilm.web.tsx` | Silent local media, first-frame gating, still fallback, serialized native replacement and background pause. |
| `src/components/useDecorativeMotion.ts`, `src/components/CinematicSurface.tsx` | Existing motion preferences and reusable purple atmosphere. |
| `src/features/home-access/PropertyArrival.tsx`, `src/app/useWarmHomeRetention.ts` | Local renderer recovery and bounded Home retention; no replay of first-launch choreography on ordinary tab returns. |
| `assets/brand/motion/arrival.production.json`, `docs/RELEASE_ASSETS.md` | Existing four runtime arrival assets total 1,360,293 bytes; two silent two-second clips, matching posters and recorded export checks. OS splash remains platform-constrained. |

Do not promise identical cinematic OS launch screens on iOS and Android. Preserve
platform splash requirements and make the transition into this in-app entrance
match cleanly. The full design targets the in-app access experience.

## Execution sequence after design review

1. Produce one strong phone/tablet art direction and a four-frame storyboard:
   closed entrance, verification, admitted entrance and ownership review. Validate
   legibility, keyboard crop, exact crest and generic-property privacy before film.
2. Build the reusable presentation frame around existing native inputs. First
   demonstrate sign-in, neutral recovery and blocked/offline states with controlled
   local presentation fixtures; do not alter real authority to preview states.
3. Add the short deterministic gate/light transitions and integrate the existing
   arrival coordinator. Prove interruption, missing-media fallback and rapid
   return behavior before expanding to the rest of the account journeys.
4. Apply the same language to invitation/password completion, household admission,
   MFA/recent-auth and authenticated ownership handover. Keep real decisions and
   consequences clear at every step.
5. Verify staging flows, responsive/a11y cases and lifecycle behavior; then build
   and test on iPhone. Physical iPad remains deferred until requested; browser
   tablet checks do not substitute for physical iPad or Android acceptance.

Acceptance must cover keyboard/large text, password and OTP autofill/paste,
invalid/expired/replayed codes, neutral recovery messages, offline recovery,
double taps, interrupted acceptance, account switching, guest expiry/revocation,
MFA/recent-auth, transfer cancel/expire/accept races, and immediate privacy shielding.
Also verify media failure, reduced motion, background/resume, Home-tab return,
slow 3D readiness, no unintended device commands, no extra loading sequence and
the current in-app controls fallback. Measure cold/warm startup and repeated
entries on hardware; visual beauty alone is not a performance result.

## Research sources and limits

- [Apple: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
  supports purposeful, optional, brief and interruptible feedback. This informed
  the short admission transition and fast returning-session path.
- [W3C: Accessible Authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum)
  supports password managers and copy/paste. Keep real fields and whole-code entry
  rather than a cinematic puzzle or individually restrictive code boxes.
- [W3C: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
  explains controls for continuing automatic motion beside other content. This
  informed the settled idle image and optional-motion rule.
- [OWASP: Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
  supports neutral account-existence feedback, expiring single-use recovery and
  no account mutation before valid verification. Presentation must preserve this;
  this research is not a certification of every current recovery implementation.
- [OWASP: Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
  informs generic error handling and reauthentication for sensitive operations.
- [Higgsfield: Cinema Studio 4.0 guide](https://higgsfield.ai/blog/cinema-studio-4-0-complete-guide)
  and the live read-only model catalog establish current reference-based creative
  controls. Exact repeatable gate geometry remains an implementation requirement,
  not something a generative model is assumed to guarantee.
- [Expo: Video](https://docs.expo.dev/versions/latest/sdk/video/)
  describes cross-platform video and player lifecycle. The SDK 54 documentation
  URL redirected to current SDK 58 docs during research. Implementation must use
  the installed SDK 54 / `expo-video ~3.0.16` types and existing verified adapter;
  this plan does not assume newer APIs or authorize an SDK upgrade.

Source and lifecycle inspection are complete for this design pass. No fresh
physical-device benchmarks, visual prototype, generated artwork, email delivery,
live ownership handover or end-to-end auth test was performed. Any newly discovered
behavior defect during execution should be recorded separately from visual work.
