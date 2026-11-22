# Property electrical system planning

Research and owner dossier completed November 22, 2026. This is a conceptual
property electrical brief, not a construction design or authorization to connect
hardware. No application behavior, equipment, deployments or permissions changed.

## Deliverables and continuity

The private owner dossier is 27 pages, with original vector illustrations, two
architectural reference extracts, 24 linked primary sources and 12 commissioning
scenarios. It covers solar, storage, JPS, generator support, distribution, outage
recovery, equipment siting, load measurement and future VantaHome integration.

Final PDF and editable Markdown:

`/Users/nick007/Documents/Codex/2026-09-25/plugin-creator-users-nick007-codex-skills-2/output/pdf/VantaHome_Property_Electrical_System.{pdf,md}`

Cached copies, authoring content, reproducible document builder and verification:

`/Users/nick007/Library/Caches/VantaHome/work/electrical-system-dossier/`

The private dossier contains the owner's supplied plan extracts and property
reference. Keep those files outside the tracked app and shipped assets. Reuse the
local research rather than rediscovering it; recheck volatile authority rules,
equipment approvals and tariffs before procurement.

## Design direction

- Target approximately 99% annual solar-origin energy; distinguish grid imports,
  generator energy, battery charging origin, losses and curtailment. This is an
  objective to model, not a measured result or a promised system capacity.
- Prefer generator-compatible storage and inverter/charger equipment with a
  documented solar recovery path, physical essential/managed circuit groups,
  local autonomous controls and an engineered maintenance bypass.
- Retain the far southwest energy-area preference as a siting candidate. The
  battery/electrical enclosure and outdoor generator need coordinated, separately
  safe arrangements; the simulation shed is not an approved installation detail.
- Require demonstrated depleted-battery recovery and single-component failure
  behavior. Parallel inverter capacity does not automatically provide redundancy.
- No final module count, inverter rating, battery capacity, generator rating,
  conductor size, breaker size or equipment model is selected without the survey.

## Jamaica findings that affect procurement

- [JPS electrical safety](https://www.jpsco.com/jps-electrical-safety/) specifies
  50 Hz compatibility. Verify actual service voltage, phase and capacity rather
  than assuming a North American 60 Hz arrangement.
- The [currently linked Ministry instructions](https://www.mset.gov.jm/wp-content/uploads/2019/06/FINAL-NETBILLING-APPLICATION-INSTRUCTION-SHEET.pdf)
  state a 10 kW residential net-billing limit. Clarify DC array, inverter and export
  capacity treatment in writing. Announced programme changes are not treated as
  enacted replacement limits, and zero export is not assumed to exempt approval.
- Check the exact model and conditions through the
  [BSJ equipment directory](https://www.bsj.org.jm/consumer-information/), plus
  manufacturer frequency, battery/BMS and generator compatibility.
- The [2020 electrical work regulations](https://jamger.gov.jm/wp-content/uploads/2021/10/The-Electricity-Electrical-Work-Registration-and-Licensing-Regulations-2020.pdf)
  require professional electrical engineering certification for main cable rated
  70 A or higher, inspector approval and independent inspection. Confirm current
  requirements with the responsible professionals.

## Remaining work and application boundary

Next physical-project step: commission the load/site/service survey and Jamaican
electrical engineer, then resolve the Ministry/JPS route before procurement.
The dossier includes a measurement schedule and commissioning acceptance brief.

Future software work requires supported physical adapters, observed telemetry,
timestamps, stale-state handling, bounded commands and confirmed outcomes.
Electrical protection and generator sequencing must remain independent of AI,
the phone, household authentication and internet availability.

Current energy consoles remain independent simulation samples. Battery reserve
and generator mode are saved preferences; they do not implement real charging,
automatic dispatch or backup transfer. Existing hub and other deferrals remain.

## Verification

Reviewed all 27 rendered pages, corrected diagram spacing and charge/discharge
direction, checked page bounds, source links, PDF bookmarks and example arithmetic.
The document is not an engineering certification. No app tests or native rebuild
were necessary because this milestone changes documentation only.
