# Interactive architectural doors

Delivered November 28, 2026. Simulation only; Three.js remains the main renderer.

## What changed

The original front entry had a device control, while 27 other door openings were
fixed architectural panels. Those measured openings now have independent devices:
room and bathroom doors, paired terrace/balcony doors, folding closets and storage
doors. The catalog contains 20 spaces and 119 authored devices, with the existing
allowance of 32 household-added fixtures. Open passages are not converted to doors.

Existing opening controls provide Open, Close, partial position and More settings.
Accepted positions/settings are canonical simulation data shared by Home and
Devices and persisted by the existing account/home-scoped save path. No actual
motor, lock, door contact or obstruction sensor is inferred from this simulation.

## Geometry and rendering

- `packages/home-scene/src/room-doors.json` records each source object's bounds,
  floor-local origin, yaw, dimensions, hinge, swing, mechanism, room and identity.
  `roomDoors.ts` exposes the typed catalog and bounded angles.
- `scene/roomDoorGeometry.ts` composes unit-box instances into walnut leaves,
  slim frames and handles. Double leaves swing symmetrically; folding leaves
  counter-rotate at their panel joint. Complete views retain full height;
  cutaway views stop at the existing 0.78 m wall cut.
- `scene/RoomDoors.tsx` uses one frame callback and at most four material batches.
  Only changing poses upload matrices. Hidden documents stop, reduced motion
  applies the target directly, and a saved position initializes before painting.
  Ordinary host access snapshots retain the meshes; grant changes reset pose
  history so a formerly authorized position cannot remain visible.
- `roomDoorPresentation.ts` hides exactly the original `ground--teak` and
  `upper--teak` batches. Asset tests prove their vertices belong to the 27 source
  openings; furniture, cabinetry and other wood geometry remain intact.

The Northeast suite doorway was overlapped by the original hallway return.
`scripts/repair-room-doorway.mjs` moves precisely 60 end-cap/bevel vertices of that
wall back to its x=9.5 m junction. The existing asset pipeline applies this
idempotent repair before appending/revalidating the gas fixtures. A changed export
with an unexpected affected vertex count fails for review. Ground/exterior GLB
sizes remain 4,719,576 and 10,253,100 bytes respectively.

The external Blender master was inspected, not overwritten. Its source inventory
and sampled leaf/architecture/furniture sweep audit are cached in
`work/room-door-inventory.json` and `work/room-door-sweep-audit.json`. All 27 chosen
hinges passed that sampled audit after the wall repair. It does not certify real
hinges, simultaneous adjacent openings or physical building clearance.

## Permissions and catalog upgrades

Only trusted interior architectural simulation bindings use `device.control`.
The six exterior entries still require entry-security permission. Physical
devices, the original front door, gate and garage keep their existing rules.
Room grants are checked independently. Shared layout can display closed doors
but never another room's live position or controls. Existing voice restrictions
on directly commanding doors are unchanged.

Migration `030_model_room_doors.sql` upgrades prepared version-1 model homes:

1. Lock the home and add only missing canonical doors in existing canonical rooms.
2. Preserve all existing devices, names, settings, permissions and deletions.
3. Seed only newly added doors, closed, if shared simulation is already enabled.
4. Record version 2 once so retries cannot resurrect subsequently deleted doors.
5. Retain the original Owner/empty-home setup checks behind the updated setup RPC.
6. Increase bounded shared batches to 151 while retaining existing payload guards.

Private catalog/append helpers are not callable by ordinary clients. Server
authorization also validates each door's canonical room binding. The local demo
upgrade is distinct from authenticated setup; its persistence format version
remains 1. Deploy future catalog upgrades before clients that require their new
receipt; older clients need an update to use new authored identities.

Staging migration 030 is deployed and reverified: one prepared home upgraded,
27 doors present, no pending version-1 homes, no existing rows or grants changed.
There are currently no enabled shared homes in that project. Local SQL fixtures
verify the shared upgrade, scoped commands, mixed-command rejection, deletion
preservation, retry behavior and 151-device maximum. Production is unchanged.

## Evidence and remaining acceptance

- Broad scene run: 2,028 tests; final focused scene run: 74 tests.
- Final focused native run: 152 tests, including scope, setup, catalog, storage,
  opening controls and shared transport. Existing physical-command denial tests
  also cover the new simulation identities.
- Database: 30 migrations and 1,015 assertions across 20 suites passed.
- Assets: 12 tests, including source-panel coverage, clear doorway raycasts and
  idempotent rebuilding. TypeScript and offline/native scene build passed.
- Browser: all 27 Open/Close controls, six embedded layouts and 15 native
  console/layout cases. More/Back, reload retention, 44px targets and zero page
  overflow verified; smallest screens retain the accessible contained fallback.
- Live renderer samples show intermediate opening positions, smooth reversal,
  stable mesh identity on ordinary host snapshots and at most four draw batches.
  Browser runs reported no application errors. Evidence uses `work/room-door-*`.

Preview 117 is packaged, signed and verified with the exact 32,404,526-byte scene
(`77d695b2f5065d6a3fed60fca1e6cb681ee4e9aec3a18bf4bb132d206ed449a3`).
It has not been installed; Preview 116 is the last confirmed phone installation.
The offline scene remains below the existing 32 MiB budget. No new dependency,
provider connection or real-device command is introduced.

After installing 117, open a suite door, a folding closet and an exterior pair.
Try Open, Close and a partial position, compare the same device through Devices,
then fully reopen after the save acknowledgement. With a room-assigned account,
verify that its interior door is controllable and exterior entries still follow
the separate security grant. Physical iPhone acceptance is pending; optional
Filament lab geometry parity and actual hardware operation remain future work.

## Future edits

Keep the room-door catalog, authored device manifest and server upgrade catalog
in agreement. Never rename IDs to move geometry or reset existing saved state.
For changed floor-plan exports, remeasure origins/bounds and review hinge sweeps,
the doorway repair and private-room clipping before rebuilding. Run the geometry,
catalog parity, authorization, storage and SQL migration checks. A changed
authenticated catalog needs an additive migration, not a client-side reseed.
