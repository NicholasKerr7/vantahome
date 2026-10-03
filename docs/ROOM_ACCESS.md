# Room access and personal controls

Access combines a current household membership, room scope, and action
permissions. The app filters the experience; Supabase independently authorizes
cloud reads and commands. Migrations 015/016 and the updated invitation function
are deployed to **staging only**. The iPhone has not been rebuilt, and the
existing preview remains a simulation.

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

Local changes re-evaluate the visible scope immediately. A change made on another
device reaches an active app at its next membership refresh, normally within
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

The following checks passed for this change:

| Check | Result |
| --- | --- |
| App Jest | 164 suites, 2,248 tests |
| 3D scene tests | 61 files, 725 tests |
| Bridge / script tests | 127 / 36 tests |
| Local PostgreSQL 17 | Six SQL suites, 323 pgTAP assertions |
| Builds and validation | Web build; app/edge TypeScript; release versions, assets, and auth redirects; tracked/history secret scan |
| Browser | Guest read-only blinds, Tenant controls, permitted toggle, room revocation, Owner controls; mobile invitation without vertical scrolling; private room view on mobile and tablet portrait/landscape |

Database checks cover exact expiry boundaries, own-row/room/device denial, voice
authorization, explicit room assignment, renewal, and model-binding cross-home
rejection and atomic rollback. The schema was also inspected read-only after the
staging rollout: migration history is **001–016**, the new columns/constraints/
indexes are present, RLS remains enabled, anonymous helper execution is denied,
and **home-invite version 17** is active with JWT verification enabled.

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

Staging deployment did not send emails, create accounts/invitations/grants, or
change production. The iPhone build, actual invitation delivery, two-account
end-to-end verification, and physical-device operation remain pending. Before
promoting this work, verify invitations, role changes, expiry, mappings,
foreground/background refresh, and native callback handling with authorized test
accounts. See [Invitation onboarding](INVITATION_ONBOARDING.md) for the full
recorded staging and production state.
