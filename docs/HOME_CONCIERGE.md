# Vanta home assistant

Implemented October 16, 2026. Simulation first, staging only. Initially delivered
without a provider connection; the user subsequently authorized activation and
privately saved a dedicated OpenAI staging key. Secret-name presence is verified.
API billing/model access and a real authenticated answer still require verification.

## Experience

The dashboard's existing microphone opens **Home intelligence**. **Ask** shows an
on-device brief of permitted comfort rooms, lights and climate controls. **Controls**
retains the existing explicit typed/spoken simulation commands. No second dashboard
button or background listener was introduced.

Once connected, Ask supports a home brief, comfort-scene drafts and suggestions
about simulated settings. Prompt chips fill a question; only **Send** sends it.
Dictation fills the composer and also requires Send. Phone speech recognition uses
the existing native speech service and its permissions, independently of OpenAI.

One short answer is held in memory. A scene suggestion opens the existing editor
for review, adjustment and saving; **Run remains a separate action**. Imported
settings stay exact: a brightness-only draft does not acquire power, and a TV power
draft does not acquire channel or volume defaults. Newly selected devices use the
ordinary editor. This version does not generate routines or perform autonomous
commands.

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
- Account/home/grant/catalog changes, backgrounding, cancellation and unmount abort
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

`OPENAI_API_KEY` is now present in this staging project's server secrets after the
user's private setup. Verify API billing and an appropriate account budget. An optional
`HOME_CONCIERGE_MODEL` secret overrides the default. Never use `EXPO_PUBLIC_*` for
provider credentials. Recheck the model's current structured-output compatibility
and limits before changing it. Then use **Check connection** and run a small
authorized live test: grounded answer, scoped scene review, explicit Save, explicit
Run, failure recovery and Guest room limits. Production remains outside this setup.

## Verification boundary

Contract, projection, lifecycle, transport, provider, server permissions and actual
scene-editor integration have automated coverage. Browser tests use the real
presentation with explicit simulation/answer fixtures and do not call a model.
The maintained working context records final counts, native install and evidence.

Initial staging deployment verified the active JWT-protected function and HTTP 401
for an unauthenticated request. The later activation check verified only the secret's
name, without reading its value. Neither is a real authenticated model answer test.
Physical dictation/keyboard feel, live answer quality/latency/cost,
Android hardware and deferred physical iPad testing remain distinct acceptance work.
