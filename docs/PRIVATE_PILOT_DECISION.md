# Decision: private-home pilot before independent review

Approved by the project owner: **2026-09-26**.
Status: **roadmap exception approved; hardware testing is not yet authorized or ready**.

## Decision and limits

Independent review is deferred for a narrowly scoped, owner-only, supervised
one-bulb pilot. It remains **outstanding**, not passed or replaced by internal
testing. It is still required before any public or customer-facing alpha, beta,
commercial pilot, or production release, whether paid or free. Sprint 2's
release gate remains open.

This explicitly supersedes the previous requirement to obtain independent
review before any physical integration work. It changes that sequencing only
for the private scope below; all applicable technical, native, authorization,
and evidence requirements remain. Historical test results are not upgraded by
this decision. No software guardrail or runtime mode is changed. A private pilot
is an authorization scope, not an existing runtime mode or configuration switch.

Lack of independent assessment leaves additional uncertainty about undiscovered
defects. Passing internal tests reduces neither that uncertainty to zero nor
the need for review before others rely on VantaHome. Each proposed physical
test still needs an explicit owner go/no-go decision after the prerequisites,
remaining risks, exact setup, and stop procedure are presented.

## Private scope

- One owner, one private home, and the existing Hue bulb; explicit on/off only
  initially. No guests, customers, shared pilot builds, or outside-household use.
- Supervised, manually initiated tests while the owner can observe the bulb
  and stop the test. This is not approval for unattended or everyday operation.
- Authenticated local control only. No public command endpoint, remote relay,
  port forwarding, tunnel, or new VantaHome Alexa/Google linking for the pilot.
  Any required cloud identity dependency must be explicitly approved and
  cannot become an alternate path to actuate the bulb.
- No camera feeds, locks, doors, garages, cooking equipment, gas/LPG, safety
  devices, or unattended scenes/automations in the pilot. Existing screens and
  features stay intact; the eventual pilot control boundary must enforce scope.
- Preserve working Alexa/Hue control. No reset, re-pairing, migration, purchase,
  paid hosting, or household configuration change is authorized by this decision.
  A proposed pairing change needs separate approval and a recovery plan.

## Readiness gates before the first bulb command

Every item below is **pending verification for the actual pilot build and
environment**. Existing unit tests or historical staging results alone do not
check these boxes.

- [ ] Approve a supported hardware/integration path and any budget separately.
  There is currently no approved Home Assistant host or VantaHome control path.
  Keep Docker off and the storage-constrained development Mac out of the
  always-on hub plan.
- [ ] Implement and test the real bridge: authenticated pairing/session,
  action-level authorization, secure credential storage, stable discovery,
  and an allowlist for the single bound light and explicit power commands.
  Do not use demo/development transports or mock fallback to bypass these gates.
- [ ] Implement the transactional durable journal/dispatcher and authenticated
  adapter. Verify commit failure, real process restart, expiry, replay/conflict
  rejection, revocation, disconnect, and late results with fault injection.
  The current in-memory reference model is not sufficient.
- [ ] Verify truthful observations and uncertainty handling with synthetic
  adapter tests first. Service acceptance, `state_observed`, and physical
  evidence must remain distinct; no fabricated completion or automatic replay
  of an ambiguous command is permitted.
- [ ] Verify the intended private environment, credential separation, network
  exposure, and exclusion of VantaHome cloud/voice/automation command paths from
  pilot actuation. The existing independent Alexa/Hue setup remains untouched.
  Do not repoint the phone, deploy to the active backend, or mix real household
  data with disposable test fixtures without separate approval.
- [ ] Run the repository verification, dependency audit, web build, and secret
  scan for the selected source revision. Review applicable mobile controls
  using [OWASP MASVS](https://mas.owasp.org/MASVS/) and test procedures from
  [OWASP MASTG](https://mas.owasp.org/MASTG/), alongside the project
  [threat model](./THREAT_MODEL.md) for API, database, and bridge boundaries.
  Record evidence and gaps; do not claim OWASP certification or an external audit.
- [ ] Verify the exact native test build on the intended phone/tablet without
  actuating hardware: sign-in/recovery, account isolation, secure storage,
  background/resume, permissions, reachable controls, and truthful status.
  Preserve portrait-only phones and both tablet orientations where used.
- [ ] Resolve all known critical/high findings affecting the pilot. Document
  lower-severity findings, mitigations, and explicit owner decisions privately;
  lack of a finding or an untested path is not evidence of safety.
- [ ] Present the pinned source/build, approved environment and device binding,
  test sequence, expected observations, time window, and stop/recovery steps.
  Obtain explicit owner approval for that supervised session before connecting
  the bridge or issuing any bulb command.

## Session evidence and stop conditions

First validate manual on/off and externally changed state, then separately
approved app/hub restart and internet-loss cases. Observe the bulb directly;
record mismatches and unknown outcomes instead of treating service completion
as proof. Do not change the working Alexa pairing merely to run a test.

Stop on unintended or duplicate actuation, wrong-device targeting, permission
failure, credential exposure, persistent state mismatch, unexpected network
exposure, or loss of supervision. Stop the dispatcher and disconnect/revoke its
integration access as appropriate; do not replay uncertain work. Keep a manual
way to power the bulb off available. Investigate, remediate, and repeat preflight
with fresh approval before resuming.

At session end, stop pilot actuation and remove temporary access. Record the
source/build, test date, expected/observed outcome, failures, and cleanup. Keep
credentials, household identifiers, and detailed security findings private;
only sanitized evidence belongs in the repository. A successful session does
not expand scope or close the independent-review gate.

## Roadmap and reconsideration

1. Continue Docker-free bridge implementation and synthetic/failure testing.
2. Complete the readiness checklist and separately approve the hardware path.
3. Run explicitly approved, supervised one-light sessions and fix their findings.
4. Before public/customer use, obtain independent review of the actual release
   candidate, including newly implemented bridge/pairing/credential boundaries,
   remediate and retest findings, and complete the other release gates.

Any expansion of users, devices, operations, network exposure, unattended use,
or purpose requires a new explicit decision. This exception does not apply by
default to that expansion. The owner can withdraw it at any time. Review plans
remain prepared, but this decision does not authorize outreach, spending,
reviewer access, environment provisioning, or deployment.
