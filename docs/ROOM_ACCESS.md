# Room access and personal controls

Access combines a current household membership, room scope, and action
permissions. The app filters the experience; Supabase independently authorizes
cloud reads and commands. Migrations **001–018** and the preview-aware invitation
function are deployed to **staging only**. Authenticated API verification has
passed with disposable accounts. Preview 36 built successfully and its signature
and native scheme were verified. Installation and real email/code verification
remain pending while the iPhone reconnects. This build includes the authenticated
simulation timer fix and supersedes build 35.

## Defaults

| Role | Room scope | Default controls |
| --- | --- | --- |
| Owner | Whole home | All actions and household administration; cannot be restricted by overrides. |
| Admin | Whole home | All actions initially; owner may restrict them. Can manage ordinary members, not owner, self, or peer admins. |
| Member | Whole home | General devices, appliances, lights, climate, live cameras/history, and routines. No default gate/door opening, cooking/safety changes, alarm actions, camera settings, or invitations. |
| Guest | Explicitly assigned rooms | Device viewing, lights, and climate. Optional expiry. |
| Tenant | Explicitly assigned rooms | Guest controls plus general devices such as TV, fan, and blinds. Permanent until changed or removed. |

**A Member assigned a bedroom still has whole-home room access.** Use Guest or
Tenant for room-limited access. Shared spaces must also be explicitly assigned.
A person can see a device without being allowed to change it; cameras require
separate live-camera permission even inside an assigned room.

People → Members → Action permissions provides **Role**, **Allow**, and **Deny**
for individual action categories. Overrides change actions, not room scope.
Only Owner/Admin plus effective invitation permission may invite people; granting
`member.invite` to another role does not authorize invitations. An Admin cannot
delegate an action permission they do not hold. Only Owner can invite Admins.

## Prepare an authenticated model home

A verified new owner explicitly creates a named home, then chooses **Prepare my 3D
home** for an empty registry. Migration 017 provides an owner-only transaction
that creates **20 spaces and 92 virtual devices**, each with UUID registry IDs and
explicit authored-model bindings. Retrying returns the existing setup receipt;
it neither duplicates the catalog nor restores devices deliberately removed
later. Homes that already contain rooms/devices require deliberate connections
instead of importing over existing data.

Virtual devices carry the immutable `simulation_only` marker. The client maps it
to `simulationOnly`, protects it from transport observations, and blocks physical
command dispatch. A database trigger independently rejects queue commands for
these devices. Setup creates no physical observations, pairings, or live camera
feeds. Native room cards, full controls, and 3D hotspots resolve their explicit
model binding and current room/action access to the account-scoped simulation.

The authenticated setup does not inherit the offline owner's demo state. Each
account/home/member scope keeps its own simulation; changing a virtual light in
one account is not evidence of physical or cross-account device synchronization.

## Configure a person's experience

1. In **People → Invite**, enter the person and role, then choose **Choose room
   access**. Select all permitted rooms. Guest/Tenant invitations cannot use an
   empty selection; no room is chosen automatically.
2. Continue to **Review invitation**. For a Guest, select **1 hour**,
   **24 hours**, **7 days**, or **No expiry**. The duration starts when sent. The recipient sees the fixed deadline before
   accepting; an expired invitation or expired access grant cannot be accepted.
3. In the room collection, an authenticated administrator chooses **Connect to
   3D room** (or **Edit 3D connection**). Select its authored model room, match
   same-kind cloud devices to model positions, and save. Unmapped devices remain
   in their room collection. Names are not used to infer access or bindings.
4. Review **People → Members → Room access / Action permissions**. Room-limited
   users receive the permitted room view, device list, hotspots, and controls.
   Administrative tools and unauthorized cameras are hidden; action permission
   is checked again when a control is used.

Model bindings are unique per home and saved as one transaction. Another room's
or household's device cannot be attached through this operation. Connecting a
model grants no device or room permission and does not activate physical devices.
The 3D preview uses separate simulation state for each account/home/member scope.

## Changes, expiry, and privacy

Room-assignment edits use migration 018's atomic `set_home_room_memberships` RPC
with an explicit home and target person. The server derives their current role;
mixed-home room lists are rejected, and grants in other homes remain intact. The
client shows the new selection after server confirmation and blocks duplicate
taps while saving. Action overrides likewise target the active home and verified
actor explicitly, rather than selecting the account's first membership.

Confirmed local changes re-evaluate the visible scope immediately. A change made
on another device reaches an active app at its next membership refresh, normally within
60 seconds plus network time. Backgrounding invalidates authenticated home access;
returning refreshes membership. A failed refresh closes access. New server reads
and commands use the current policy immediately, without waiting for the UI's
refresh interval.

Temporary Guest access is enforced by server time, including when the app is
closed. The client also checks its cached deadline on use, at expiry, and on
resume. Expired memberships remain visible to administrators for review. A fresh
invitation may deliberately renew an expired Guest; acceptance replaces old room
assignments and clears old action overrides. Tenant access does not expire.

Assigned-room rendering provides **visual privacy in the app**, not confidentiality
of the bundled architectural assets. The complete model ships in the app bundle;
someone inspecting its files can recover that geometry. Confidential floor-plan
assets would require a separate per-user asset delivery design. Live device data
and cloud operations remain protected by server authorization.

## Verification and deployment

The authenticated staging milestone has the following evidence:

| Check | Result |
| --- | --- |
| Full verification checkpoint | Before the final authenticated timer-host mount fix: 172 app suites / 2,400 tests; 61 scene files / 725 tests; 127 bridge tests; 45 script tests |
| Final timer-host fix | 26 AppNavigator/ModelHomeSync tests, app TypeScript, and diff checks passed after the mount change; included in Preview 36 |
| Local PostgreSQL 17 | Eight SQL suites, 369 pgTAP assertions; migrations 001–018 applied to a fresh isolated database |
| Hosted staging API | 32 checks passed using disposable accounts and temporary homes; all created resources removed |
| Validation | App/edge TypeScript, dependency source/attack checks, release assets/version/redirect checks; web build exported to `dist` |
| Browser | Synthetic account sign-in, home creation, 20-space/92-device preparation, saved light state after reload, native-library full controls, gate manual/automatic close, and sign-out passed; 375 × 667 forms visually reviewed without vertical scrolling |
| Native build | Preview 36 Release build passed; intended preview-only native schemes and strict code signature verified; production metadata restored byte-for-byte |
| Native/email pending | Build 36 installation pending; the earlier build 35 attempt returned CoreDevice 4016 while the iPhone was unavailable. Actual delivery, code entry, recovery, and physical iPhone account flow remain pending |

Final integration review found the simulation timer host was mounted only in the
offline demo. It now also mounts for an authenticated home. With the fix, a
signed-in gate closed manually from 100% to 0%, and automatic close progressed
from 29 seconds to 7 seconds to **Closed**. The browser also retained light state
after reload, opened model full controls from the native device library, and
signed out successfully. Its synthetic account and home were removed. These
results are browser evidence; physical-iPhone verification remains pending.

The hosted API sweep verified password authentication, normal owner bootstrap,
model provisioning/idempotency, Guest/Tenant defaults, assigned-room reads,
action/view overrides, room revocation, Guest expiry, foreign-home isolation,
server-authoritative room updates, and simulation-command rejection. It created
no physical commands or observations. One initial request timed out; cleanup
succeeded, and the complete retry passed. Temporary accounts used non-deliverable
addresses; no invitation or recovery email was sent by that sweep.

Local SQL checks additionally cover exact expiry boundaries, own-row/room/device
denial, voice authorization, explicit room assignment, renewal, model-binding
cross-home rejection, and atomic rollback. Prior browser role/layout checks cover
Guest read-only blinds, Tenant controls, room revocation, and private room views
on mobile and tablet. Those were presentation/simulation checks, not the current
build's authenticated physical iPhone verification.

The initial release verification was blocked on 2026-10-03 by two high-severity
upstream advisories with no published patched version:

- `braces@3.0.3`: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), reached through Expo → Metro → metro-file-map → micromatch.
- `node-forge@1.4.0`: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), reached through Expo CLI, also through its code-signing certificates dependency.

The subsequent dependency remediation backports the pinned upstream proposed
fixes, verifies every installed copy by source hash, and runs attack regressions
before assessing the audit. Full `npm run verify` now passes with these local
patches. Raw npm audit still reports the published versions; they have not been
relabeled as official patched releases. See [Dependency security](DEPENDENCY_SECURITY.md)
for provenance, clean-install evidence, limitations, and upstream retirement rules.

Production was not changed. The staging API test accounts and homes have been
removed, and its isolated local database was stopped and removed. Before
promotion, finish native installation and the authorized real-email invitation,
password setup/recovery, account switching, and foreground/background tests.
Physical-device operation still requires a configured hub. See
[Invitation onboarding](INVITATION_ONBOARDING.md) and
[Preview packaging](AUTH_REDIRECTS.md) for configuration and remaining checks.
