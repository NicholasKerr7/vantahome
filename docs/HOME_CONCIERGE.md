# Vanta home assistant

Updated October 22, 2026. The authorized first slice from the
[AI experience roadmap](AI_EXPERIENCE_ROADMAP.md) is now implemented: room-aware
Ask, exact before/after values, an isolated 3D scene preview and bounded foreground
phone voice. Later roadmap features remain proposals. Preview 91 is installed and
launched on the iPhone 16 Pro Max; Apple inventory confirms build 91. Physical
room/preview/voice acceptance is underway, with no results recorded yet.

Implemented October 16, 2026. Simulation first, staging only. Initially delivered
without a provider connection; the user subsequently authorized activation and
privately saved a dedicated OpenAI staging key. Secret-name presence is verified.
The initial Preview 71 physical retry exposed an empty API credit balance. The user
added credit privately and confirmed live answers work. Staging logs independently
verify two HTTP 200 `answered` operations (6.4 and 12.1 seconds), including response
validation and the final access check. No key expansion or new native build was
needed. The user also confirmed a scene for the Living room Pendant light, on at
30%, through Review scene, Create and explicit Run scene; creation did not execute
the scene. The bounded Guest and actual Member live checklists below are complete
by user report; broader permission configurations and answer quality/cost remain
follow-up.

The first iPhone connection check exposed a client guard that rejected the signed-in
no-hub default. Preview 71 allows that saved simulation while keeping configured
WebSocket/MQTT transport excluded. Check connection also rehydrates failed local
reads without overwriting saved settings; temporary server failures use distinct
copy. Real simulation-bridge integration tests cover these boundaries.

## Experience

The dashboard's existing microphone opens **Home intelligence**. **Ask** shows an
on-device brief of permitted comfort rooms, lights and climate controls. **Controls**
retains the existing explicit typed/spoken simulation commands. No second dashboard
button or background listener was introduced. Ask now defaults to a validated
selected room when available; its scope picker can return to permitted rooms.
Shared layout alone supplies neither private readings nor assistant context.

Once connected, Ask supports a home brief, comfort-scene drafts and suggestions
about simulated settings. Prompt chips fill a question; **Send** submits typed
questions and ordinary dictation. Phone speech recognition uses the existing
native speech service and its permissions, independently of OpenAI. The separate
opt-in hands-free window below may submit a wake-prefixed question to Ask.

One short answer is held in memory. A scene suggestion opens the existing editor
for review, adjustment and saving; **Run remains a separate action**. Imported
settings stay exact: a brightness-only draft does not acquire power, and a TV power
draft does not acquire channel or volume defaults. Newly selected devices use the
ordinary editor. This version does not generate routines or perform autonomous
commands.

### Exact changes and isolated 3D preview

A proposal shows each explicit before/after value from its captured scoped context.
Changing relevant settings makes the proposal stale rather than silently replacing
its baseline. **Preview in 3D** checks current context, automation permission and
per-device control grants, then sends only bounded comfort values and exact
baselines to the renderer. Sensitive devices remain excluded.

The renderer creates detached display copies. **Preview · no device changes**,
Current / Proposed and Exit remain visible; camera/model position is preserved.
Canonical device state, persistence, command transport and saved scenes are not
written. Ordinary hotspots/controllers and saved-scene Run remain unavailable while
previewing. Expiry (at most 60 seconds), access/scope changes, suspension and incoming
affected-device values clear the preview. Exit returns to the retained assistant
proposal; preview does not consume the one-use Review token. Review → Create saves
without execution, and **Run scene remains separate**. Conversational draft
refinement and new telemetry/history/manual sources are not included.

### Optional foreground phone voice

An explicit **Enable** starts up to five minutes of listening on foreground Home.
Say “Hey VantaHome” or “Vanta”, then a question. Only a question following an accepted wake phrase
enters Ask with the selected room's permitted settings; it never enters
the direct Controls executor. Ambient transcripts are ephemeral. The phone's
speech service may process audio; this is not an on-device-only privacy promise,
a background wake-word engine or an OpenAI Realtime/cloud-audio connection.

Replies use a synthetic system voice through `expo-speech`; **Hear answer** is
also available manually. Ordinary tap-to-dictate and typed Send remain available.
Listening pauses during generation and spoken output. Stop, the fixed five-minute
deadline, leaving Home, background/lock, account/home/grant/room changes and unmount
retire the session. Session tokens, microphone ownership, bounded retries and
serialized native teardown prevent old transcripts, queued questions or TTS
callbacks from restarting ended consent. Preview stops the voice session.
Physical speech permission, audio routing/interruption, recognition accuracy and
heat/battery acceptance remain pending; web keeps the text route.

The panel is loaded on demand. It uses existing purple tokens, cinematic artwork
and reduced-motion-aware decoration. A bounded internal scroll area retains touch
momentum without scrolling the dashboard; the composer and Done remain outside
that area. Enlarged text, compact screens and the existing native keyboard-avoidance
wrapper are preserved.

## Data and authority

- Only verified current household sessions and saved/saving simulation snapshots
  are eligible. Local briefs are deterministic; they are not presented as AI output.
- Supported kinds: lights, AC, fans, blinds, TVs and speakers. Opening windows,
  cameras, locks, gates, alarms, cooking and other safety/security devices are excluded.
- Client projection intersects registry bindings, room visibility and control
  permissions with the active simulation. Saved custom fixtures retain registry IDs.
- Questions and permitted simulation values go to the staging function. The server
  authenticates the captured user JWT and reads labels/permissions through caller RLS.
  OpenAI receives the question, permitted room/device names, IDs and comfort values.
  Account profiles, coordinates, weather, cameras, occupancy and history are not
  automatically included. Anything the user types is part of their question.
- Scene drafting requires current automation management and individual control
  grants. Structured output is validated at the provider, server, client and review
  boundaries. The model has no tools or command endpoint.
- Account/home/grant/catalog/room-scope changes, backgrounding, cancellation and unmount abort
  requests and discard late results. Snapshot/review freshness is 60 seconds; Guest
  deadlines are also enforced. Foregrounding refreshes availability.
- Review uses an opaque one-use in-memory token. Unmatched old tokens cannot erase
  a newer review. Drafts are never placed in navigation history or persisted before
  the user saves. Existing scene mutation/execution checks remain in force.

## Server configuration

`supabase/functions/home-concierge` is JWT-protected and uses the existing persistent
edge rate limiter. Availability checks never call the model. Without a provider key,
availability is false and Ask is disabled with a clear explanation.

The implementation calls the fixed OpenAI Responses HTTPS endpoint, with no
redirects, tools, background execution or stored response (`store: false`). The
default model is `gpt-6.1-sol`, low reasoning, strict JSON schema and a bounded output
budget. `store: false` is not a claim of zero provider retention; confirm the account's
current data policies when connecting it.

Limits: 600 question characters, 128 context devices, 32 validated actions (the
prompt prefers eight), 24 KiB request body, 64 KiB provider envelope, 20-second
provider deadline and 25-second client deadline. Requests are capped at eight per
minute and 60 per day per actor, plus 600 per day for the staging server. Availability
checks allow 30 per minute. Limit failures fail closed. Logs contain the existing
operational metadata, never questions, answers or credentials.
Provider failures add only a locally allowlisted category and bounded HTTP status
to that metadata. At most 4 KiB of an error response is inspected for exact known
codes; arbitrary messages, codes, parameters and identifiers are discarded. The
client continues to receive the existing safe error contract.

`OPENAI_API_KEY` is now present in this staging project's server secrets after the
user's private setup. Verify API billing and an appropriate account budget. An optional
`HOME_CONCIERGE_MODEL` secret overrides the default. Never use `EXPO_PUBLIC_*` for
provider credentials. Recheck the model's current structured-output compatibility
and limits before changing it. Then use **Check connection** and run a small
authorized live test: grounded answer, scoped scene review, explicit Save, explicit
Run, failure recovery and Guest room limits. Production remains outside this setup.

## Verification boundary

### Phase-one source and browser verification — October 22

- **277 tests across 20 host/assistant/voice suites** pass; receipt:
  `work/ai-phase-one-jest.log`. Scoped projection, captured before-values, stale
  request/review rejection, voice consent/session lifecycle and host integration
  use controlled fixtures; this is not physical microphone or model-quality evidence.
- **1,649 tests across all 131 scene suites** pass (`work/ai-phase-one-scene-tests-final.log`). They cover strict protocol/source
  validation, current/proposed derivation, zero canonical writes/subscriber calls,
  blocked controller and saved-scene Run paths, replay rejection, expiry,
  suspension/access/affected-state clearing and selected-room privacy. Scene
  TypeScript and diff checks pass.
- Seven assistant panel profiles/states pass with no errors
  (`work/ai-panel-browser.json`). Seven actual 3D App phone/tablet profiles pass
  (`work/concierge-scene-preview-browser.json`): no overflow, controls ≥44px,
  Current/Proposed/Exit, exact camera pose and canonical state unchanged, no storage
  writes or device patch/Run messages, and no application errors. Evidence images
  use `work/concierge-preview-*-{current,proposed}.png`. Test browsers/owned servers
  were closed and no scene repository fixture remains.
- Preview **91 is built and signed**. Exact scene bytes/hash, staging identity,
  release assets/version/redirects and source metadata restoration pass; receipt
  `work/preview91-verification.json`. Installation and full physical acceptance
  remain pending. Preview **90** is
  the last recorded installed build. Next physical checks cover room restrictions,
  exact proposal/preview comparisons, no-write Exit, save-without-run, separate Run
  and persistence, plus speech permission allow/deny, accuracy, synthetic audio,
  interruptions, Stop/deadline and route/background/lock cleanup. Android and
  physical iPad testing remain deferred.
- The existing server model/schema, text API and authorization are unchanged.
  No paid model requests, deployments or credentials were changed for this slice.
  Dependency verification passes with Vite 7.3.7, Vitest/mocker 4.1.12 and
  ip-address 10.7.4. Existing braces/node-forge backports remain locally verified;
  registry audit metadata still reports those patched versions. Receipt:
  `work/ai-phase-one-dependencies.log`.


### Guest live acceptance — October 16–17

The current test uses the existing Living room-only Guest without adding grants.
Default Guest permissions allow viewing devices and light/climate controls, but
not `automation.manage` or general device control. A permitted fan/speaker may be
described without becoming controllable. Shared property layout is not an AI grant.

**This bounded live checklist is complete by user report.** It covers the tested
Guest configuration in Preview 71, not every role, grant combination or model answer.

**October 17 role clarification:** the user reported no Create/Add scene option,
then confirmed they were still signed in as Guest, not Member. The absent creation
tools match Guest's default permissions. Member receives `automation.manage` by
default in both client and server rules, subject to explicit overrides and current
access verification. No permission changes or runtime fix were needed. This checks
the Guest UI restriction; it does not replace the AI scene-denial test below or
constitute a physical Member-login acceptance test.

1. **Passed by user confirmation:** switch Owner → Guest; no previous Owner answer;
   Home brief uses only permitted Living room simulation devices.
2. **Passed by user report, October 17:** the question about primary-bedroom lights
   returned that the primary bedroom was not listed. This records the reported
   unavailable-room response; the full provider answer was not independently inspected.
3. **Passed by user confirmation, October 17:** the comfort-only Living room scene
   request was unavailable. The user explicitly confirmed no Review scene button,
   new saved scene or light change. This isolates the Guest's lack of automation
   management without relying on a door refusal.
4. **Passed by user report, October 17:** the mixed Living room dimming/front-door
   request returned that scene drafting was unavailable. Full output and device
   state for this prompt were not independently inspected. Ask has no control
   tools for any role; this report is not a physical-door execution test.
5. **Passed by user confirmation, October 17:** returning to Owner restored the
   Owner options and cleared the Guest answer and draft. No additional model
   request was needed for this account-switch check.

The focused automated run passed 134 tests across eight suites. These include
client projection, current grants, shared-layout isolation, lifecycle/expiry,
one-use review handoff, response validation and server reauthorization. Handler
tests mock the database reader; they are not a substitute for the real Guest
session or an independent security review. No private credentials are needed in
chat, no live membership/grant mutation was performed, and no code changed.

### Actual Member live acceptance — completed October 17

The user chose a separate Member test account and supplied its invitation address
in chat. Preserve the existing Guest account, room grants and deadline. The Owner
was asked to use account → Household → Invite, name **Test Member**, role **Member**,
then **Review access → Whole-home room access → Invite person**. The user confirmed
the invitation was sent and its email arrived, then confirmed the new account
shows Member and exposes Create scene. These are user-operated iPhone results.

**This bounded Member checklist is complete by user confirmation.** It tests the
separate Member account with its default permissions, not every override or role.

1. **Passed by user confirmation:** the new account explicitly shows **Member**,
   and Scenes exposes **Create scene** (a plus icon on compact screens).
2. **Passed by user confirmation:** **Member evening** saved for the Living room
   Pendant light, On at 30%, while the light stayed off. Creating did not run it.
3. **Passed by user confirmation:** explicit **Run scene** set the Pendant light to
   On at 30%; the scene's one-light settings and the light state survived fully
   closing and reopening the app. This tests local account/device persistence,
   not household scene sync.
4. **Passed by user confirmation:** Ask drafted **Member calm** for only the Living
   room Pendant light On at 20%. Review → Create saved without changing the light
   from 30%; explicit Run then set it to 20%. The user confirmed the complete
   requested flow. Provider output and device state were not independently inspected.

Explicit `automation.manage` denial remains a required boundary, covered by the
existing retained-review test; it was not changed or retested on this live Member.

The app has no existing-member role-change UI. Sending an invitation to an active
Guest does not convert it. A fresh separate Member should inherit scene permission
without overrides; adding an Allow override to Guest would not test the Member role.

Automated preparation passed **40 tests / 3 suites**, adding explicit Member
coverage for AI draft saving and manual Create → reopen → Run request. These use
the actual editor/store with a verified-membership fixture; execution is mocked,
and remounting retains the same store. They do not prove live authentication,
cold-start persistence or physical simulation changes. Evidence:
`work/concierge-member-scene-tests.log`. The existing collection suite still emits
reduced-motion async `act` warnings; no application code was changed.

### Existing evidence

Contract, projection, lifecycle, transport, provider, server permissions and actual
scene-editor integration have automated coverage. Browser tests use the real
presentation with explicit simulation/answer fixtures and do not call a model.
The maintained working context records final counts, native install and evidence.

Initial staging deployment verified the active JWT-protected function and HTTP 401
for an unauthenticated request. The later activation check verified only the secret's
name, without reading its value. Those checks alone did not test real answers;
the later physical acceptance and two `answered` operations do. No answer content
was inspected or retained during log verification. The one-light physical scene
review/create/run check also passed by user confirmation. The bounded Guest cases
and Member cases above are complete by user report. Broader role/override combinations,
dictation/keyboard feel, answer quality/latency/cost,
Android hardware and deferred physical iPad testing remain distinct acceptance work.
