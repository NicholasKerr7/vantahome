# Room access and personal controls

Access combines a current household membership, room scope, and action
permissions. The app filters the experience; Supabase independently authorizes
cloud reads and commands. Migrations **001–020** and the preview-aware invitation
function are deployed to **staging only**. Authenticated API verification has
passed with disposable accounts. **Preview 40** is installed and was launched on
the user's iPhone 16 Pro Max on **2026-10-07**; it redesigns the verification/recovery
screen while preserving permission gates. It retains Preview 39's
[Guest access extension/renewal](GUEST_ACCESS_EXTENSIONS.md) and the
property-overview checkpoint below. At the earlier **2026-10-04** checkpoint, Preview **37**
was installed on that phone, with the installed version confirmed
by the device app listing. The user confirmed resolving developer-trust error
10002 and completing the Owner email/code, password, home creation, and 3D model
setup on the physical iPhone. A read-only staging check confirmed the verified
email, recorded sign-in, one owned home, 20 rooms, and 92 simulation-only devices,
with a version-1 setup receipt recording 20/92. The user confirmed sending the
Guest invitation and receiving its email, then completing Guest enrollment and
household acceptance. On the iPhone, only Living room appeared, Pendant light
worked, and Front entry door control was blocked. Staging confirms the accepted
invite, Guest membership, one Living-room grant, 24-hour deadline, and no action
overrides. The user confirmed that fully closing and reopening Preview retained
Guest restrictions; signing back in as Owner restored the full home. Build 37
includes the authenticated simulation timer fix.

## Defaults

| Role | Room scope | Default controls |
| --- | --- | --- |
| Owner | Whole home | All actions and household administration; cannot be restricted by overrides. |
| Admin | Whole home | All actions initially; owner may restrict them. Can manage ordinary members, not owner, self, or peer admins. |
| Member | Whole home | General devices, appliances, lights, climate, live cameras/history, and routines. No default gate/door opening, cooking/safety changes, alarm actions, camera settings, or invitations. |
| Guest | Explicitly assigned rooms | Device viewing, lights, and climate. Optional expiry. |
| Tenant | Explicitly assigned rooms | Guest controls plus general devices such as TV, fan, and blinds. Permanent until changed or removed. |

Room scope in this table governs live information and actions. Current members
also receive a **property overview** of the exterior and grounds. Guest/Tenant
interiors remain limited to their assigned rooms unless the Owner explicitly
shares the interior layout; that visual grant does not expand room/device access.

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
4. Review **People → Members → Rooms & interior layout / Action permissions**.
   Room-limited users receive the property overview and their permitted room
   interiors, device list, hotspots, and controls.
   Administrative tools and unauthorized cameras are hidden; action permission
   is checked again when a control is used.

## Property overview and shared interiors

Guest/Tenant sessions open on the full exterior and landscaped property, with
orbit/zoom and a direct route to their assigned rooms. Unshared interiors are
hidden behind tinted glazing in this exterior presentation. Device hotspots
appear only for separately permitted devices.

The verified homeowner can open **Members → Rooms & interior layout → Interior
layout → Share interior layout** for an accepted Guest or Tenant. This permits a
furnished interior tour and floor navigation. Unassigned rooms are marked
**Layout only**; their live device states, hotspots, controls, occupancy, cameras,
and activity are not shared. Hidden lights, screens, blinds, irrigation, and gate
movement use neutral presentation state rather than the restricted readings.

Migration 019 stores consent on the specific home membership. Only the canonical
home owner may change it through `set_member_interior_layout`; generic membership
writes cannot set the flag, and Admins cannot grant it. A changed membership role,
identity, home, or access deadline resets the consent. Granting expired Guest
access is rejected; revoking an existing consent remains possible. The app shows
the confirmed server snapshot rather than granting visibility optimistically.

Renderer `propertyOverview` and `interiorLayout` grants are independent of
`roomIds`, `deviceIds`, and `controllableDeviceIds`. Sharing a layout neither sets
`fullHome` nor changes device or room row-level security. Revocation on another
device arrives at the normal membership refresh; it is applied atomically when
received. Membership expiry removes both overview and layout access.

Model bindings are unique per home and saved as one transaction. Another room's
or household's device cannot be attached through this operation. Connecting a
model grants no device or room permission and does not activate physical devices.
The 3D preview uses separate simulation state for each account/home/member scope.

## Changes, expiry, and privacy

An Owner or authorized Admin can now select **Extend access** or **Renew access**
on an existing finite Guest's member card. This preserves rooms and action
permissions without another invitation. The reviewed deadline is checked by
the server; Admins cannot prolong powers withheld from themselves. Interior
layout consent resets and remains a separate Owner choice. See
[Guest access extensions](GUEST_ACCESS_EXTENSIONS.md) for the flow and evidence.

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
invitation may still deliberately renew an expired Guest; acceptance replaces old
room assignments and clears old action overrides. Use the member-card renewal to
retain existing assignments and overrides. Tenant access does not expire.

Assigned-room rendering provides **visual privacy in the app**, not confidentiality
of the bundled architectural assets. The complete model ships in the app bundle;
someone inspecting its files can recover that geometry. Confidential floor-plan
assets would require a separate per-user asset delivery design. Live device data
and cloud operations remain protected by server authorization.

## Verification and deployment

### Property overview checkpoint — 2026-10-07

Preview **38** includes exterior access for current members and optional
owner-confirmed interior sharing for Guests/Tenants. Verification completed
before packaging; the signed Release build was installed and launched on October 7.

| Check | Result |
| --- | --- |
| Full `npm run verify` | 173 app suites / 2,464 tests; 62 scene files / 738 tests; 127 bridge tests; 45 script tests; app/edge TypeScript, dependency and release checks passed |
| Fresh PostgreSQL 17 | All 19 migrations; nine SQL suites / 414 assertions passed, including 45 interior-sharing checks; temporary database removed |
| Hosted staging | Migration 019 applied only to staging. Owner share/revoke succeeds; Guest self-grant RPC and direct-column mutation are rejected; the same six devices remain visible |
| Authenticated browser | Owner switch saves; Guest can tour shared furnished floors without private hotspots; revocation returns an open unassigned tour to exterior at the next refresh; assigned Pendant light still works and Front entry door remains blocked; no browser errors |
| Responsive presentation | Reviewed at 375 × 667, 430 × 932, 768 × 1024, and 1024 × 768; no vertical page overflow; corrected the switch track's touch-target sizing |
| Scene packaging | Web and offline native bundles rebuilt; native scene is approximately 28.1 MiB |
| Native packaging | Preview 38 Release build passed; bundle/schemes, device profile coverage and strict signature verified; production metadata restored; device listing confirms installed version 1.0.0 (38), and launch succeeded |
| Cleanup | Disposable QA home, two synthetic accounts, and temporary credential record removed; no real membership consent changed |
| Physical check pending | Owner sharing switch and Guest exterior/interior/revocation flow, retained in installed Preview 40; installation/launch alone does not establish those UI results |

The original 24-hour test Guest grant ended October 5. It was not extended by
this work. The user subsequently confirmed Preview 39 Owner **Renew access**,
Guest return with the existing account, and retained room/control restrictions.
The user also supplied an offline iPhone screenshot showing **Unable to verify
home access**, **Retry**, and **Sign out** with Airplane Mode on and Wi-Fi off,
then confirmed access returned after reconnecting with the door still blocked.
Recovery timing and use of Retry were not specified. Production and physical
iPad testing are unchanged.

### Earlier account and lifecycle checkpoint — 2026-10-04

The earlier authenticated staging milestone has the following evidence:

| Check | Result |
| --- | --- |
| Full verification checkpoint | Before the final authenticated timer-host mount fix: 172 app suites / 2,400 tests; 61 scene files / 725 tests; 127 bridge tests; 45 script tests |
| Final timer-host fix | 26 AppNavigator/ModelHomeSync tests, app TypeScript, and diff checks passed after the mount change; retained in Preview 37 |
| Local PostgreSQL 17 | Eight SQL suites, 369 pgTAP assertions; migrations 001–018 applied to a fresh isolated database |
| Hosted staging API | 32 checks passed using disposable accounts and temporary homes; all created resources removed |
| Validation | App/edge TypeScript, dependency source/attack checks, release assets/version/redirect checks; web build exported to `dist` |
| Browser | Synthetic account sign-in, home creation, 20-space/92-device preparation, saved light state after reload, native-library full controls, gate manual/automatic close, and sign-out passed; 375 × 667 forms visually reviewed without vertical scrolling |
| Native build/install | Preview 37 Release build passed with renewed automatic signing; exact bundle/schemes, profile device coverage, and strict code signature verified. Production metadata restored byte-for-byte; iPhone 16 Pro Max app listing confirms installed build 37 |
| Physical iPhone Owner setup | User confirmed developer trust, app launch, invitation email/code, password setup, home creation, and model preparation. Read-only staging evidence: verified email, recorded sign-in, one owned home, 20 rooms, 92 simulation-only devices, version-1 setup receipt 20/92, no household invitations at that check |
| Physical iPhone Guest access | User confirmed invitation delivery, Owner sign-out, Guest code/password setup and acceptance, Living-room-only visibility, working Pendant light, and blocked Front entry door. Staging confirms verified Guest sign-in, accepted invite, Guest membership, one Living-room grant, 24-hour deadline, and no overrides |
| Physical iPhone session scope | User confirmed that fully closing and reopening Preview retained Guest restrictions, then signing back in with the existing Owner credentials restored the full home |
| Physical iPhone password recovery | User confirmed requesting the Owner reset from Preview, fully closing the app, opening the newest email link to password setup, saving a new password privately, and signing back in with it to the full Owner home; this also covers the recovery cold callback |
| Focused lifecycle/recovery sweep (October 4) | Nine app suites / 111 tests passed, plus app TypeScript and diff checks. Nine added cases cover failed membership refresh and recovery, foreground verification, late responses after backgrounding or a new session, Guest expiry stopping runtimes, and password-update success, retry, and account-change boundaries |
| Native checks pending | Warm recovery, explicit warm/cold invitation links, online foreground/background transitions, and expiry observed at its actual deadline; the later Preview 39 offline/reconnect report is recorded above |

The focused sweep uses controlled network responses and clocks with the real
membership snapshot installer, permission selectors, and app lifecycle host.
It verifies that failed membership checks stop realtime and flow runtimes, a
successful later check restores access, and Guest expiry stops those runtimes
without waiting for the next periodic refresh. These automated checks do not
replace the pending physical-iPhone results. The sweep changes tests and
documentation only; Preview 37 does not need rebuilding for it.

Final integration review found the simulation timer host was mounted only in the
offline demo. It now also mounts for an authenticated home. With the fix, a
signed-in gate closed manually from 100% to 0%, and automatic close progressed
from 29 seconds to 7 seconds to **Closed**. The browser also retained light state
after reload, opened model full controls from the native device library, and
signed out successfully. Its synthetic account and home were removed. These
results are browser evidence. The physical-iPhone Owner onboarding report above
does not establish these separate control and lifecycle checks.

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

Production was not changed. The disposable staging API test accounts and homes have been
removed, and its isolated local database was stopped and removed. Before
promotion, complete warm recovery, explicit invitation callbacks,
foreground/background transitions, network loss, and observed deadline
expiry. SQL/API expiry checks are separate from waiting for a real device session
to reach its deadline.
Physical-device operation still requires a configured hub. See
[Invitation onboarding](INVITATION_ONBOARDING.md) and
[Preview packaging](AUTH_REDIRECTS.md) for configuration and remaining checks.
