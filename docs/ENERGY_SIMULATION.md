# Coordinated property energy simulation

Implemented November 27, 2026. Simulation only: no inverter, generator, transfer
switch, JPS connection or physical device command is connected.

## Use it

Open **Energy pavilion → Home energy controller → Full controls → Power flow →
Start energy simulation**. The equipment console remains beside the Power flow
view. The solar, battery and generator consoles read the same model.

- Choose Day or Night through the existing time controls, or leave automatic
  property time enabled. Daylight production is a fixed illustrative sample,
  **not** an irradiance forecast or measured production.
- Use Simulate outage, then Restore grid. JPS remains isolated for 15 simulated
  foreground seconds. Previously deferred comfort loads return at 25 seconds,
  flexible loads at 35 seconds. Already supplied backup loads keep operating.
- Battery Self-Use supplies demand before JPS down to the configured reserve.
  This is the default for an unconfigured coordinated demonstration; explicitly
  saved Backup or Charge preferences win. Outages allow discharge to the sample
  emergency floor. Solar surplus charges storage, then is curtailed; no export.
- Auto generator starts on low stored energy and unmet solar demand. Start,
  warm-up, running, minimum run, cooldown and depleted-fuel failure are distinct.
  A manual exercise while JPS is healthy consumes simulated fuel but remains
  electrically isolated. Release manual start removes the manual request;
  Auto can still run when backup is needed.
- Pause/Resume retains charge, fuel and totals. Pausing returns ordinary device
  previews to their requested state. Time while backgrounded is never replayed.

## Demonstration assumptions

12 kW solar, 24 kWh battery, 8 kW inverter, 5 kW battery transfer, 6 kW generator
and 12 kW JPS import are **illustrative**, lossless model limits, not equipment
recommendations or the final design in the electrical dossier. Appliance demand
is a deterministic sample based on kind and requested operation. Real losses,
compressor duty, starting currents, per-phase constraints, weather-derived PV,
protection coordination and certified transfer behavior are outside this model.

The flow conserves instantaneous power and accumulated energy; storage and fuel
are finite. Essential, comfort and flexible loads are admitted as complete loads,
with stable priority ordering. Unserved demand stays explicit. Preview alarms,
latched emergency lighting, opening positions/holds and independent solar poles
are protected presentation semantics, not claims of infinite physical backup.

Cumulative counters represent this simulation run. Existing advanced daily
history remains labelled sample data. Instantaneous advanced power/SOC/fuel
readings agree with the linked consoles. The annual 99% solar objective is not
represented as a fixed instantaneous percentage or a verified result.

## State, authority and lifecycle

- `energySimulation.ts` is the pure shared model. It changes no requested device
  state. 3D supply effects are projected copies, preserving settings for recovery.
- An optional validated `energy` field joins the existing scoped persisted
  snapshot. Legacy caches remain valid; starting is explicit. Native Home,
  Devices and the embedded scene share one canonical persistence record.
- The existing single foreground owner advances energy in five-second batches,
  internally integrated in steps of at most one second. No panel owns a clock.
  Native automatic day/night uses verified property coordinates independently
  of the mounted 3D renderer. Missing location pauses automatic simulation;
  explicit Day/Night scenarios remain available.
- Full-home visibility and all four source-control grants are required to start
  or pause the model. The host normalizes start/pause requests and will not accept
  invented charge, fuel, elapsed time or totals from a frame. Room-limited viewers
  receive only their visible paused-device IDs, never whole-property totals.
- Scene previews remain display-only. Evaluating a proposed scene cannot consume
  its proposed energy or save it. Current canonical operation may continue while
  a proposal is displayed; Run remains the only scene execution action.
- Shared household authority suspends local energy. Migration 029's tick lease
  is gate-specific. No energy tick is disguised as a shared command, and no
  offline fallback bypasses a shared home's authority.

## Verified / remaining

Verified: model conservation/bounds, reserve and generator behavior, staged JPS
recovery including brief outage commands, requested-state preservation, strict
parsing, account/room scoping, shared-mode rejection, owner-client notifications,
foreground lifecycle, property clock across tabs, cold persistence and existing
scene/household integrations. App/scene tests and TypeScript pass. Browser checks
cover six phone/tablet sizes for the flow plus all four native console layouts,
44-point targets, More/Back and no ordinary page overflow. The smallest viewport
retains the existing contained accessibility scroll fallback.

Next: package/install and accept on iPhone; iPad physical acceptance remains
explicitly deferred. Shared energy needs a separate server-owned model/revision
and step policy, not the gate lease. Actual telemetry/adapters await selected
hardware, qualified electrical design and the existing Jamaican approval gates.
No production deployment or physical dispatch is part of this implementation.
