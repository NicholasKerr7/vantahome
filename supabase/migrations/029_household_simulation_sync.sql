-- Shared preview state is deliberately separate from physical device_state and
-- command queues. No function in this migration can dispatch hardware commands.

/** Frozen v1 allowlist from deviceCapabilities.getCapabilities and the runtime
 * status catalog. A capability addition needs a reviewed additive migration and
 * parser-parity verification; unknown settings never become an arbitrary JSON bag. */
create function public.household_simulation_schema()
returns jsonb language sql immutable set search_path = '' as $$
  select $schema${
  "ac": {"tempC":[{"type":"range","min":15,"max":28,"step":1}],"mode":[{"type":"enum","values":["cold","fan","dry"]}],"acFanSpeed":[{"type":"range","min":0,"max":100,"step":1}],"lastAction":[{"type":"enum","values":["ac-temperature-up","ac-temperature-down","ac-fan-up","ac-fan-down","ac-preset-normal"]}],"acEcoMode":[{"type":"boolean"},{"type":"enum","values":[false]}],"acTurboMode":[{"type":"boolean"},{"type":"enum","values":[false]}],"acQuietMode":[{"type":"boolean"},{"type":"enum","values":[false]}],"acSwingMode":[{"type":"enum","values":["off","vertical","horizontal","both"]}],"acTargetHumidity":[{"type":"range","min":30,"max":60,"step":1}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "light": {"brightness":[{"type":"range","min":0,"max":100,"step":1},{"type":"enum","values":[60,70,80]}],"color":[{"type":"enum","values":["#FFD166","#A0E9FF","#FF9AA2","#B69CFF","#A5FF9B","#FFFFFF"]}],"lastAction":[{"type":"enum","values":["light-brightness-up","light-brightness-down","light-mode-white","light-mode-color","light-scene-warm","light-scene-cool","light-scene-focus","light-white-2400","light-white-3000","light-white-4000","light-white-5200"]}],"lightColorMode":[{"type":"enum","values":["temperature","color"]}],"lightEffect":[{"type":"enum","values":["none","focus","relax","sunset","party"]}],"colorTempK":[{"type":"range","min":2000,"max":6500,"step":100},{"type":"enum","values":[2400,3000,4000,5200]}],"adaptiveLighting":[{"type":"boolean"}],"motionBoost":[{"type":"boolean"}],"nightShift":[{"type":"boolean"}],"autoOffMin":[{"type":"range","min":0,"max":120,"step":1}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "tv": {"volume":[{"type":"range","min":0,"max":100,"step":1}],"muted":[{"type":"boolean"}],"source":[{"type":"enum","values":["Live TV","Guide","YouTube","Netflix","Settings","Home"]}],"lastAction":[{"type":"enum","values":["tv-volume-up","tv-volume-down","tv-channel-up","tv-channel-down","tv-source-guide","tv-source-youtube","tv-source-netflix","tv-source-settings","tv-remote-up","tv-remote-left","tv-remote-select","tv-remote-right","tv-remote-down","tv-remote-home","tv-remote-back","tv-play-pause","tv-rewind","tv-forward","tv-previous","tv-next"]}],"channel":[{"type":"range","min":1,"max":999,"step":1}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}],"playbackState":[{"type":"enum","values":["stopped","playing","paused"]}],"playbackPositionSec":[{"type":"range","min":0,"max":3600,"step":1}],"trackIndex":[{"type":"range","min":1,"max":99,"step":1}],"remoteFocus":[{"type":"range","min":1,"max":9,"step":1}],"remoteSelection":[{"type":"range","min":0,"max":9,"step":1}],"remoteAction":[{"type":"enum","values":["none","up","down","left","right","select","home","back"]}]},
  "coffee": {"lastAction":[{"type":"enum","values":["coffee-brew","coffee-stop","coffee-cups-up","coffee-cups-down"]}],"coffeeStrength":[{"type":"enum","values":["mild","normal","strong"]}],"coffeeSizeOz":[{"type":"range","min":4,"max":12,"step":1}],"coffeeCupCount":[{"type":"range","min":1,"max":6,"step":1}],"coffeeTempC":[{"type":"range","min":80,"max":98,"step":1}],"coffeeKeepWarmMin":[{"type":"range","min":0,"max":60,"step":1}],"coffeeGrinder":[{"type":"boolean"}],"coffeeMilkFrother":[{"type":"boolean"}],"coffeeAutoBrewTime":[{"type":"enum","values":["06:30","07:00","07:30","08:00"]}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "fridge": {"tempC":[{"type":"range","min":1,"max":8,"step":1}],"lastAction":[{"type":"enum","values":["fridge-temperature-up","fridge-temperature-down","fridge-freezer-up","fridge-freezer-down"]}],"freezerTempC":[{"type":"range","min":-24,"max":-12,"step":1}],"fridgeMode":[{"type":"enum","values":["eco","normal","boost","vacation"]}],"fridgeQuickCool":[{"type":"boolean"}],"fridgeQuickFreeze":[{"type":"boolean"}],"fridgeIceMaker":[{"type":"boolean"}],"fridgeDoorAlarm":[{"type":"boolean"}],"fridgeEnergySaver":[{"type":"boolean"}],"fridgeHumidity":[{"type":"range","min":30,"max":70,"step":1}]},
  "gate": {"openPercent":[{"type":"range","min":0,"max":100,"step":1},{"type":"enum","values":[100,0]}],"lastAction":[{"type":"enum","values":["gate-command-open","gate-command-close","gate-hold-open","gate-release-hold","gate-resume"]}],"gateHoldOpen":[{"type":"boolean"},{"type":"enum","values":[true]}],"gateReleaseHold":[{"type":"enum","values":[true]}],"gateResume":[{"type":"enum","values":[true]}],"autoCloseEnabled":[{"type":"boolean"}],"autoCloseDelaySec":[{"type":"range","min":5,"max":120,"step":1}],"gateVehiclePresent":[{"type":"boolean"}],"gateBeamBlocked":[{"type":"boolean"}],"gateSensorFault":[{"type":"boolean"}],"autoOpenEnabled":[{"type":"boolean"}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}],"gateEmergencyActive":[{"type":"boolean"}],"gateEmergencyHold":[{"type":"boolean"}],"gatePhase":[{"type":"enum","values":["idle","countdown","closing","paused"]}],"gateLastEvent":[{"type":"enum","values":["ready","opened","closing","closed","positioned","held","released","resumed","close-blocked","open-blocked","obstruction-reopened","sensor-fault","restored-paused","emergency-hold"]}],"gateCountdownSec":[{"type":"range","min":0,"max":120,"step":0.001}],"gateCloseTargetPercent":[{"type":"range","min":0,"max":100,"step":0.001}]},
  "garage": {"openPercent":[{"type":"range","min":0,"max":100,"step":1},{"type":"enum","values":[100,0]}],"lastAction":[{"type":"enum","values":["garage-command-open","garage-command-close","garage-position-up","garage-position-down"]}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "fan": {"speed":[{"type":"range","min":0,"max":100,"step":1},{"type":"enum","values":[35,60,90]}],"lastAction":[{"type":"enum","values":["fan-speed-up","fan-speed-down","fan-breeze","fan-standard","fan-turbo"]}],"fanOscillation":[{"type":"boolean"}],"fanDirection":[{"type":"enum","values":["forward","reverse"]}],"fanLightOn":[{"type":"boolean"}],"fanAutoMode":[{"type":"boolean"}],"fanSleepMode":[{"type":"boolean"}],"fanTimerMin":[{"type":"range","min":0,"max":240,"step":1}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "door": {"openPercent":[{"type":"range","min":0,"max":100,"step":1},{"type":"enum","values":[100,0]}],"lastAction":[{"type":"enum","values":["door-command-open","door-command-close","door-position-up","door-position-down"]}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "vacuum": {"lastAction":[{"type":"enum","values":["vacuum-start","vacuum-dock","vacuum-pause","vacuum-suction-up","vacuum-suction-down"]}],"status":[{"type":"enum","values":["cleaning","docked","paused"]}],"vacuumMode":[{"type":"enum","values":["auto","spot","edge","room"]}],"vacuumSuction":[{"type":"range","min":0,"max":100,"step":1}],"vacuumMop":[{"type":"boolean"}],"vacuumQuietMode":[{"type":"boolean"}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "camera": {"armed":[{"type":"boolean"}],"recording":[{"type":"boolean"}],"nightVision":[{"type":"boolean"}],"motionAlerts":[{"type":"boolean"}],"micMuted":[{"type":"boolean"}],"twoWayAudio":[{"type":"boolean"}],"motionSensitivity":[{"type":"range","min":1,"max":10,"step":1}],"lastAction":[{"type":"enum","values":["camera-snapshot","camera-known-visitor","camera-unknown-visitor"]}],"cameraPreviewEvent":[{"type":"enum","values":["Simulated snapshot","Known visitor preview","Unknown visitor preview"]}]},
  "window": {"openPercent":[{"type":"range","min":0,"max":100,"step":1},{"type":"enum","values":[100,0,25]}],"lastAction":[{"type":"enum","values":["window-command-open","window-command-close","window-position-up","window-position-down","window-vent"]}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "stove": {"burnerLevel":[{"type":"range","min":0,"max":10,"step":1}],"stoveMode":[{"type":"enum","values":["simmer","boil","sear","keep-warm"]}],"stoveTimerMin":[{"type":"range","min":0,"max":60,"step":5}],"stoveLock":[{"type":"boolean"}],"lastAction":[{"type":"enum","values":["stove-heat-down","stove-heat-up","stove-timer-down","stove-timer-up"]}]},
  "washer": {"cycle":[{"type":"enum","values":["Normal","Quick","Delicate","Bedding","Eco"]}],"lastAction":[{"type":"enum","values":["washer-start","washer-pause","washer-stop"]}],"laundryActivity":[{"type":"enum","values":["running","paused","stopped","idle"]}],"washTemp":[{"type":"enum","values":["Cold","Warm","Hot"]}],"spinSpeedRpm":[{"type":"enum","values":[800,1000,1200]}],"soilLevel":[{"type":"enum","values":["Light","Normal","Heavy"]}],"loadSize":[{"type":"enum","values":["Small","Medium","Large"]}],"rinseCount":[{"type":"enum","values":[1,2,3]}],"prewash":[{"type":"boolean"}],"steamWash":[{"type":"boolean"}],"sanitizeWash":[{"type":"boolean"}],"smartDispense":[{"type":"boolean"}],"extraSpin":[{"type":"boolean"}],"ecoWash":[{"type":"boolean"}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}],"progress":[{"type":"range","min":0,"max":100,"step":1}],"remainingMin":[{"type":"range","min":0,"max":1440,"step":1}]},
  "dryer": {"cycle":[{"type":"enum","values":["Normal","Quick","Delicate","Bedding","Towels","Air Fluff"]}],"lastAction":[{"type":"enum","values":["dryer-start","dryer-pause","dryer-stop"]}],"laundryActivity":[{"type":"enum","values":["running","paused","stopped","idle"]}],"heatLevel":[{"type":"enum","values":["Low","Med","High"]}],"drynessLevel":[{"type":"enum","values":["Damp","Dry","Extra"]}],"sensorDry":[{"type":"boolean"}],"wrinkleGuard":[{"type":"boolean"}],"steamRefresh":[{"type":"boolean"}],"ecoDry":[{"type":"boolean"}],"airFluff":[{"type":"boolean"}],"coolDown":[{"type":"boolean"}],"antiStatic":[{"type":"boolean"}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}],"progress":[{"type":"range","min":0,"max":100,"step":1}],"remainingMin":[{"type":"range","min":0,"max":1440,"step":1}],"lintFilterOk":[{"type":"boolean"}]},
  "dishwasher": {"cycle":[{"type":"enum","values":["Auto","Normal","Quick","Eco","Intensive","Rinse"]}],"lastAction":[{"type":"enum","values":["dishwasher-start","dishwasher-pause","dishwasher-stop"]}],"dishwasherActivity":[{"type":"enum","values":["running","paused","stopped","idle"]}],"washTemp":[{"type":"enum","values":["Cold","Warm","Hot"]}],"soilLevel":[{"type":"enum","values":["Light","Normal","Heavy"]}],"rinseCount":[{"type":"enum","values":[1,2,3]}],"prewash":[{"type":"boolean"}],"steamWash":[{"type":"boolean"}],"sanitizeWash":[{"type":"boolean"}],"smartDispense":[{"type":"boolean"}],"extraSpin":[{"type":"boolean"}],"ecoWash":[{"type":"boolean"}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}],"progress":[{"type":"range","min":0,"max":100,"step":1}],"remainingMin":[{"type":"range","min":0,"max":1440,"step":1}]},
  "microwave": {"timeRemainingSec":[{"type":"range","min":0,"max":900,"step":30},{"type":"enum","values":[60,0]}],"lastAction":[{"type":"enum","values":["microwave-start","microwave-stop","microwave-power-up","microwave-power-down","microwave-add-30","microwave-add-60","microwave-add-120"]}],"microwavePower":[{"type":"range","min":1,"max":10,"step":1}],"microwaveMode":[{"type":"enum","values":["Reheat","Defrost","Grill","Popcorn"]}]},
  "energy": {"energyBudgetKwh":[{"type":"range","min":50,"max":200,"step":10}],"gridOutageAlerts":[{"type":"boolean"}],"lastAction":[{"type":"enum","values":["energy-outage","energy-restore-grid"]}],"gridAvailable":[{"type":"enum","values":[false,true]}],"sampleChecked":[{"type":"enum","values":[true]}]},
  "water": {"waterLeakAlerts":[{"type":"boolean"}],"waterAutoShutoff":[{"type":"boolean"}],"waterBudgetL":[{"type":"range","min":100,"max":400,"step":20}],"waterPressureLowPsi":[{"type":"range","min":20,"max":60,"step":5}],"waterPressureHighPsi":[{"type":"range","min":60,"max":100,"step":5}],"waterPressureAlerts":[{"type":"boolean"}],"lastAction":[{"type":"enum","values":["water-budget-up","water-budget-down"]}],"sampleChecked":[{"type":"enum","values":[true]}]},
  "water-heater": {"tempC":[{"type":"range","min":40,"max":70,"step":1}],"heaterMode":[{"type":"enum","values":["eco","standard","boost","vacation"]}],"recirculation":[{"type":"boolean"}],"antiLegionella":[{"type":"boolean"}],"heaterScheduleEnabled":[{"type":"boolean"}],"vacationDays":[{"type":"range","min":0,"max":30,"step":1}],"lastAction":[{"type":"enum","values":["water-heater-temperature-up","water-heater-temperature-down"]}],"waterHeaterType":[{"type":"enum","values":["electric-tank","gas-tank","heat-pump","tankless"]}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "air": {"airPurifierMode":[{"type":"enum","values":["auto","manual","sleep","boost"]}],"airPurifierSpeed":[{"type":"range","min":0,"max":100,"step":1}],"airIonizerEnabled":[{"type":"boolean"}],"airAutoVentilation":[{"type":"boolean"}],"airAlertsEnabled":[{"type":"boolean"}],"airAlertAqi":[{"type":"range","min":50,"max":200,"step":1}],"airAlertCo2":[{"type":"range","min":600,"max":2000,"step":1}],"airAlertPm25":[{"type":"range","min":10,"max":120,"step":1}],"airAlertPm10":[{"type":"range","min":20,"max":160,"step":1}],"airAlertVoc":[{"type":"range","min":80,"max":800,"step":1}],"airAlertPollen":[{"type":"range","min":1,"max":5,"step":1}],"sampleChecked":[{"type":"enum","values":[true]}]},
  "sprinkler": {"durationMin":[{"type":"range","min":0,"max":60,"step":1}],"zone":[{"type":"enum","values":["Front Yard","Back Yard","Garden"]}],"isOn":[{"type":"boolean"}],"lastAction":[{"type":"enum","values":["sprinkler-duration-up","sprinkler-duration-down"]}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "speaker": {"volume":[{"type":"range","min":0,"max":100,"step":1}],"muted":[{"type":"boolean"}],"speakerSource":[{"type":"enum","values":["Spotify","AirPlay","Bluetooth","AUX","TV"]}],"speakerPreset":[{"type":"enum","values":["Flat","Warm","Bright","Bass","Vocal"]}],"bass":[{"type":"range","min":0,"max":100,"step":1}],"treble":[{"type":"range","min":0,"max":100,"step":1}],"spatialAudio":[{"type":"boolean"}],"partyMode":[{"type":"boolean"}],"nightMode":[{"type":"boolean"}],"voiceAssistantEnabled":[{"type":"boolean"}],"micEnabled":[{"type":"boolean"}],"shuffle":[{"type":"boolean"}],"repeat":[{"type":"enum","values":["off","all","one"]}],"lastAction":[{"type":"enum","values":["speaker-play-pause","speaker-rewind","speaker-forward","speaker-previous","speaker-next","speaker-volume-up","speaker-volume-down"]}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}],"playbackState":[{"type":"enum","values":["stopped","playing","paused"]}],"playbackPositionSec":[{"type":"range","min":0,"max":3600,"step":1}],"trackIndex":[{"type":"range","min":1,"max":99,"step":1}]},
  "smoke": {"lastAction":[{"type":"enum","values":["smoke-test-alarm","smoke-simulate-co","smoke-silence","smoke-acknowledge","smoke-clear-alarm","smoke-reset"]}],"smokeSensorStatus":[{"type":"enum","values":["ok","warning","error"]}],"smokeDetected":[{"type":"boolean"}],"coDetected":[{"type":"boolean"}],"smokeSilenced":[{"type":"boolean"}],"fireIncidentActive":[{"type":"boolean"}],"fireIncidentAcknowledged":[{"type":"boolean"}],"fireResetVersion":[{"type":"range","min":0,"max":999999,"step":1}],"sampleChecked":[{"type":"enum","values":[true]}]},
  "blinds": {"openPercent":[{"type":"range","min":0,"max":100,"step":1},{"type":"enum","values":[100,0]}],"lastAction":[{"type":"enum","values":["blinds-command-open","blinds-command-close","blinds-position-up","blinds-position-down"]}],"scheduleEnabled":[{"type":"boolean"}],"scheduleHour":[{"type":"range","min":0,"max":23,"step":1}],"scheduleMinute":[{"type":"range","min":0,"max":59,"step":1}],"scheduleDays":[{"type":"enum","values":["daily","weekdays","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday"]}]},
  "generator": {"generatorMode":[{"type":"enum","values":["manual","auto"]}]},
  "battery": {"storageMode":[{"type":"enum","values":["backup","self-use","charge"]}],"reservePercent":[{"type":"range","min":10,"max":100,"step":1}]},
  "solar": {"sampleChecked":[{"type":"enum","values":[true]}]},
  "gas-meter": {"lastAction":[{"type":"enum","values":["gas-meter-use-sample","gas-meter-refill","gas-meter-open-valve","gas-meter-close-valve"]}],"gasValveOpen":[{"type":"boolean"}],"gasBudgetKg":[{"type":"range","min":5,"max":100,"step":1}],"gasRefillAlertPercent":[{"type":"range","min":5,"max":50,"step":1}],"gasUsageAlerts":[{"type":"boolean"}],"gasRefillAlerts":[{"type":"boolean"}],"gasFlowKgH":[{"type":"range","min":0,"max":2,"step":0.01}],"gasTodayKg":[{"type":"range","min":0,"max":1000,"step":0.01}],"gasMonthKg":[{"type":"range","min":0,"max":10000,"step":0.01}],"gasRemainingKg":[{"type":"range","min":0,"max":12.5,"step":0.01}],"gasLastSampleKg":[{"type":"range","min":0,"max":0.25,"step":0.01}],"gasLeakInterlock":[{"type":"boolean"}],"gasLastEvent":[{"type":"enum","values":["ready","usage-sample","usage-blocked","empty-supply","refilled","valve-opened","valve-closed","opening-blocked","auto-shutoff","leak-scenario","clear-scenario","alarm-silenced","self-test"]}],"sampleChecked":[{"type":"enum","values":[true]}]},
  "gas-leak": {"lastAction":[{"type":"enum","values":["gas-leak-self-test","gas-leak-simulate-leak","gas-leak-clear-leak","gas-leak-silence"]}],"gasLeakAlerts":[{"type":"boolean"}],"gasAutoShutoff":[{"type":"boolean"}],"gasLeakDetected":[{"type":"boolean"}],"gasAlarmSilenced":[{"type":"boolean"}],"gasConcentrationPercentLel":[{"type":"range","min":0,"max":100,"step":1}],"gasBatteryPercent":[{"type":"range","min":0,"max":100,"step":1}],"gasTestCount":[{"type":"range","min":0,"max":9999,"step":1}],"gasTestResult":[{"type":"enum","values":["not-run","passed"]}],"gasLastEvent":[{"type":"enum","values":["ready","usage-sample","usage-blocked","empty-supply","refilled","valve-opened","valve-closed","opening-blocked","auto-shutoff","leak-scenario","clear-scenario","alarm-silenced","self-test"]}],"sampleChecked":[{"type":"enum","values":[true]}]}
  }$schema$::jsonb;
$$;

/** Validate the same bounded primitive state accepted by the scene bridge. */
create function public.valid_household_simulation_state(device_kind text, candidate jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  fields jsonb := public.household_simulation_schema() -> device_kind;
  setting record;
  rule jsonb;
  accepted boolean;
  amount numeric;
begin
  if fields is null or jsonb_typeof(candidate) is distinct from 'object'
    or octet_length(candidate::text) > 8192
    or not (candidate ?& array['on','level'])
    or exists (select 1 from jsonb_object_keys(candidate) k where k not in ('on','level','settings'))
    or jsonb_typeof(candidate->'on') is distinct from 'boolean'
    or jsonb_typeof(candidate->'level') is distinct from 'number' then return false; end if;
  amount := (candidate->>'level')::numeric;
  if amount < 0 or amount > 100 then return false; end if;
  if device_kind in ('blinds','gate','garage','window','door')
    and (candidate->>'on')::boolean <> (amount > 0) then return false; end if;
  if device_kind in ('gas-meter','gas-leak') and candidate->'on' <> 'true' then return false; end if;
  if candidate ? 'settings' then
    if jsonb_typeof(candidate->'settings') is distinct from 'object' then return false; end if;
    for setting in select * from jsonb_each(candidate->'settings') loop
      if not (fields ? setting.key) then return false; end if;
      accepted := false;
      for rule in select * from jsonb_array_elements(fields->setting.key) loop
        if rule->>'type' = 'boolean' and jsonb_typeof(setting.value) = 'boolean' then accepted := true;
        elsif rule->>'type' = 'enum' and (rule->'values') @> jsonb_build_array(setting.value) then accepted := true;
        elsif rule->>'type' = 'range' and jsonb_typeof(setting.value) = 'number' then
          amount := setting.value::text::numeric;
          if amount between (rule->>'min')::numeric and (rule->>'max')::numeric
            and mod(amount - (rule->>'min')::numeric,(rule->>'step')::numeric) = 0 then accepted := true; end if;
        end if;
      end loop;
      if not accepted then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;

create table public.household_simulation_homes (
  home_id uuid primary key references public.homes(id) on delete cascade,
  enabled_at timestamptz not null default clock_timestamp()
);
create table public.household_simulation_devices (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null unique references public.devices(id) on delete cascade,
  home_id uuid not null references public.household_simulation_homes(home_id) on delete cascade,
  model_device_id text not null,
  state jsonb not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  unique (home_id,model_device_id)
);
create table public.household_simulation_clocks (
  home_id uuid primary key references public.household_simulation_homes(home_id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  client_id uuid not null,
  user_id uuid not null,
  session_id uuid not null,
  expires_at timestamptz not null,
  last_tick_at timestamptz not null
);
create table public.household_simulation_receipts (
  home_id uuid not null references public.household_simulation_homes(home_id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null,
  payload_hash bytea not null,
  primary key (home_id,request_id)
);
alter table public.household_simulation_homes enable row level security;
alter table public.household_simulation_devices enable row level security;
alter table public.household_simulation_clocks enable row level security;
alter table public.household_simulation_receipts enable row level security;
revoke all on public.household_simulation_homes, public.household_simulation_devices,
  public.household_simulation_clocks, public.household_simulation_receipts from public, anon, authenticated, service_role;
comment on table public.household_simulation_devices is
  'Versioned preview-only values. Registry identity and current permissions are rechecked on every read and atomic write.';
comment on table public.household_simulation_receipts is
  'Private permanent request digests prevent replay after later edits or fixture removal without duplicating saved state.';

/** RLS needs a boolean current-session check, including revoked sessions and
 * Guest deadlines measured after any earlier statement or lock wait. */
create function public.can_read_household_simulation(target_home_id uuid)
returns boolean language sql volatile security definer set search_path = '' set row_security = off as $$
  select auth.role() = 'authenticated' and auth.uid() is not null
    and auth.jwt()->>'client_id' is null
    and coalesce(auth.jwt()->>'is_anonymous','false') = 'false'
    and exists (select 1 from auth.sessions s join auth.users u on u.id = s.user_id
      where s.user_id = auth.uid() and s.id::text = auth.jwt()->>'session_id'
        and (s.not_after is null or s.not_after > clock_timestamp())
        and u.email_confirmed_at is not null and u.is_anonymous is not true and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= clock_timestamp()))
    and exists (select 1 from public.home_members m where m.home_id = target_home_id and m.user_id = auth.uid()
      and (m.access_expires_at is null or m.access_expires_at > clock_timestamp()));
$$;

/** Read filtering uses the current registry, never saved room IDs or a layout grant. */
create function public.can_read_household_simulation_device(target_home_id uuid,target_device_id uuid,target_model_device_id text)
returns boolean language sql volatile security definer set search_path = '' set row_security = off as $$
  select public.can_read_household_simulation(target_home_id) and exists (
    select 1 from public.devices d where d.id = target_device_id and d.home_id = target_home_id
      and d.simulation_only and d.model_device_id = target_model_device_id
      and public.can_perform_device_action(d.id,'device.view')
      and (d.kind <> 'camera' or public.can_perform_device_action(d.id,'camera.live')));
$$;
/** Match the whole-inspector permission boundary used by modelSceneAccess.
 * Opening controls require both their sensitive action and ordinary control. */
create function public.can_control_household_simulation_device(target_device_id uuid)
returns boolean language sql volatile security definer set search_path = '' set row_security = off as $$
  select exists(select 1 from public.devices d where d.id = target_device_id
    and public.can_read_household_simulation_device(d.home_id,d.id,d.model_device_id)
    and public.can_perform_device_action(d.id,case
      when d.kind in ('gas-meter','gas-leak') then 'safety.control'
      else public.permission_for_device_command(d.kind,'toggle','{}'::jsonb) end)
    and (d.kind not in ('door','gate','garage') or public.can_perform_device_action(d.id,'device.control')));
$$;
create policy household_simulation_homes_read on public.household_simulation_homes for select to authenticated
  using (public.can_read_household_simulation(home_id));
create policy household_simulation_devices_read on public.household_simulation_devices for select to authenticated
  using (public.can_read_household_simulation_device(home_id,device_id,model_device_id));
grant select on public.household_simulation_homes, public.household_simulation_devices to authenticated;

/** Lock with all household membership management before checking live authority. */
create function public.require_household_simulation_access(target_home_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.homes where id = target_home_id for update;
  if not found then raise exception 'Household unavailable' using errcode = '42501'; end if;
  perform public.require_ownership_session(false);
  if not public.can_read_household_simulation(target_home_id) then
    raise exception 'Household unavailable' using errcode = '42501';
  end if;
end;
$$;

/** Match normalizeRestoredGateState without advancing elapsed background time. */
create function public.pause_household_simulation_gate(candidate jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare settings jsonb := coalesce(candidate->'settings','{}'::jsonb);
begin
  if settings->>'gatePhase' not in ('countdown','closing') or settings->>'gatePhase' is null then return candidate; end if;
  return candidate || jsonb_build_object('settings',settings || jsonb_build_object(
    'gatePhase','paused','gateCountdownSec',0,'gateCloseTargetPercent',candidate->'level',
    'gateEmergencyHold',coalesce((settings->>'gateEmergencyHold')::boolean,false)
      or coalesce((settings->>'gateEmergencyActive')::boolean,false),'gateLastEvent','restored-paused'));
end;
$$;

/** An expired, revoked or removed clock holder can only stop motion. A read is
 * the recovery commit; failed mutations do not pretend their rolled-back pause persisted. */
create function public.expire_household_simulation_clock(target_home_id uuid)
returns void language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  lease public.household_simulation_clocks%rowtype;
  valid_holder boolean;
begin
  select * into lease from public.household_simulation_clocks where home_id = target_home_id;
  if not found then return; end if;
  select exists (select 1 from auth.sessions s join auth.users u on u.id = s.user_id
    join public.home_members m on m.user_id = u.id and m.home_id = target_home_id
    join public.devices d on d.id = lease.device_id and d.home_id = m.home_id
    where s.id = lease.session_id and s.user_id = lease.user_id
      and (s.not_after is null or s.not_after > clock_timestamp())
      and u.email_confirmed_at is not null and u.is_anonymous is not true and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= clock_timestamp())
      and (m.access_expires_at is null or m.access_expires_at > clock_timestamp())
      and (m.role in ('owner','admin','member') or exists (select 1 from public.room_members r where r.room_id = d.room_id and r.user_id = m.user_id))
      and d.simulation_only and d.model_device_id = 'entry-gate' and d.kind = 'gate'
      and not exists(select 1 from unnest(array['device.view','device.control','garage.open']) p(permission)
        where not case when m.role = 'owner' then true else coalesce((select o.allowed
          from public.member_permission_overrides o where o.home_id = m.home_id
            and o.user_id = m.user_id and o.permission = p.permission),public.role_has_action_permission(m.role,p.permission)) end)
  ) into valid_holder;
  if lease.expires_at <= clock_timestamp() or not valid_holder then
    update public.household_simulation_devices set state = public.pause_household_simulation_gate(state), revision = revision + 1
      where home_id = target_home_id and device_id = lease.device_id
        and state->'settings'->>'gatePhase' in ('countdown','closing');
    delete from public.household_simulation_clocks where home_id = target_home_id;
  end if;
end;
$$;

/** Only currently visible per-device revisions cross the read boundary; there
 * is no global revision/timestamp that could reveal activity in a hidden room. */
create function public.read_household_simulation_snapshot(target_home_id uuid)
returns jsonb language sql volatile security definer set search_path = '' set row_security = off as $$
  select jsonb_build_object('homeId',target_home_id,
    'homeName',(select name from public.homes where id = target_home_id),
    'enabled',exists(select 1 from public.household_simulation_homes where home_id = target_home_id),
    'serverTimeMs',floor(extract(epoch from clock_timestamp())*1000),
    'devices',coalesce((select jsonb_agg(jsonb_build_object('deviceId',s.device_id,'modelDeviceId',s.model_device_id,
      'revision',s.revision,'state',s.state) order by s.model_device_id)
      from public.household_simulation_devices s where s.home_id = target_home_id
        and public.can_read_household_simulation_device(s.home_id,s.device_id,s.model_device_id)),'[]'::jsonb),
    'clock',(select jsonb_build_object('clientId',c.client_id,'expiresAtMs',floor(extract(epoch from c.expires_at)*1000))
      from public.household_simulation_clocks c join public.household_simulation_devices s on s.device_id = c.device_id
      where c.home_id = target_home_id and public.can_read_household_simulation_device(s.home_id,s.device_id,s.model_device_id)));
$$;

/** Fetch one authoritative scoped snapshot, pausing abandoned motion atomically. */
create function public.get_household_simulation(target_home_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_household_simulation_access(target_home_id);
  perform public.expire_household_simulation_clock(target_home_id);
  return public.read_household_simulation_snapshot(target_home_id);
end;
$$;

/** The canonical Owner explicitly seeds every currently bound simulation once.
 * Retrying consent cannot overwrite a household that has already been enabled. */
create function public.enable_household_simulation(target_home_id uuid,request_id uuid,initial_states jsonb)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  candidate public.devices%rowtype;
  receipt public.household_simulation_receipts%rowtype;
  payload_hash bytea;
  device_count integer;
begin
  perform public.require_household_simulation_access(target_home_id);
  if not exists(select 1 from public.homes h join public.home_members m on m.home_id = h.id and m.user_id = h.owner_id
    where h.id = target_home_id and h.owner_id = auth.uid() and m.role = 'owner') then
    raise exception 'Home owner required' using errcode = '42501';
  end if;
  if request_id is null or jsonb_typeof(initial_states) is distinct from 'object'
    or octet_length(initial_states::text) > 131072 then
    raise exception 'Choose a valid saved simulation' using errcode = '22023';
  end if;
  payload_hash := sha256(convert_to(jsonb_build_object('intent','enable','state',initial_states)::text,'UTF8'));
  select * into receipt from public.household_simulation_receipts r
    where r.home_id = target_home_id and r.request_id = enable_household_simulation.request_id;
  if found then
    if receipt.actor_id <> auth.uid() or receipt.payload_hash <> payload_hash then
      raise exception 'Request already belongs to a different update' using errcode = '22023';
    end if;
    perform public.expire_household_simulation_clock(target_home_id);
    return public.read_household_simulation_snapshot(target_home_id) || jsonb_build_object('requestId',request_id,'status','existing');
  end if;
  if exists(select 1 from public.household_simulation_homes where home_id = target_home_id) then
    raise exception 'Household simulation is already enabled' using errcode = 'VH409';
  end if;
  -- Lock the exact existing registry before counting; deletes may not take the home lock.
  perform 1 from public.devices where home_id = target_home_id and simulation_only and model_device_id is not null order by id for update;
  select count(*) into device_count from public.devices
    where home_id = target_home_id and simulation_only and model_device_id is not null;
  if device_count not between 1 and 124 or device_count <> (select count(*) from jsonb_object_keys(initial_states)) then
    raise exception 'Saved simulation must cover the current simulation registry' using errcode = '22023';
  end if;
  insert into public.household_simulation_homes(home_id) values(target_home_id);
  for candidate in select * from public.devices where home_id = target_home_id and simulation_only and model_device_id is not null for update loop
    if not (initial_states ? candidate.model_device_id)
      or not public.valid_household_simulation_state(candidate.kind,initial_states->candidate.model_device_id) then
      raise exception 'Saved simulation contains an unsupported device state' using errcode = '22023';
    end if;
    insert into public.household_simulation_devices(home_id,device_id,model_device_id,revision,state)
      values(target_home_id,candidate.id,candidate.model_device_id,1,
        case when candidate.model_device_id = 'entry-gate' then public.pause_household_simulation_gate(initial_states->candidate.model_device_id)
        else initial_states->candidate.model_device_id end);
  end loop;
  insert into public.household_simulation_receipts(home_id,request_id,actor_id,payload_hash)
    values(target_home_id,request_id,auth.uid(),payload_hash);
  return public.read_household_simulation_snapshot(target_home_id) || jsonb_build_object('requestId',request_id,'status','applied');
end;
$$;

/** Validate one foreground second exactly; elapsed network/background time never
 * causes catch-up, and a client cannot use a tick to alter unrelated settings. */
create function public.next_household_simulation_gate_tick(candidate jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  settings jsonb := coalesce(candidate->'settings','{}'::jsonb);
  remaining numeric;
  position numeric;
  target numeric;
begin
  if settings->>'gatePhase' = 'countdown' then
    remaining := greatest(0,(settings->>'gateCountdownSec')::numeric - 1);
    settings := settings || jsonb_build_object('gateCountdownSec',remaining);
    if remaining = 0 then settings := settings || jsonb_build_object('gatePhase','closing','gateCloseTargetPercent',0,'gateLastEvent','closing'); end if;
  elsif settings->>'gatePhase' = 'closing' then
    target := coalesce((settings->>'gateCloseTargetPercent')::numeric,0);
    position := greatest(target,round((candidate->>'level')::numeric - 25,3));
    candidate := candidate || jsonb_build_object('on',position > 0,'level',position);
    if position = target then settings := settings || jsonb_build_object('gatePhase','idle','gateLastEvent',case when target = 0 then 'closed' else 'positioned' end); end if;
  else return null;
  end if;
  return candidate || jsonb_build_object('settings',settings);
end;
$$;

/** Reject omitted safety inhibitors or direct position jumps that bypass the
 * existing gate reducer. Only explicit stationary release may clear a hold. */
create function public.valid_household_simulation_gate_transition(previous jsonb,candidate jsonb,intent text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  before_settings jsonb := coalesce(previous->'settings','{}'::jsonb);
  after_settings jsonb := coalesce(candidate->'settings','{}'::jsonb);
  field text;
  movement numeric := (candidate->>'level')::numeric - (previous->>'level')::numeric;
begin
  if movement < 0 and intent <> 'tick' then return false; end if;
  foreach field in array array['gateHoldOpen','gateEmergencyHold'] loop
    if before_settings->field = 'true' and after_settings->field is distinct from 'true'
      and (movement <> 0 or after_settings->>'gateLastEvent' is distinct from 'released'
        or before_settings->'gateEmergencyActive' = 'true') then return false; end if;
  end loop;
  if movement <> 0 and exists(select 1 from unnest(array['gateHoldOpen','gateVehiclePresent','gateBeamBlocked',
    'gateSensorFault','gateEmergencyActive','gateEmergencyHold']) k
    where before_settings->k = 'true' and after_settings->k is distinct from 'true') then return false; end if;
  if after_settings->>'gatePhase' in ('closing','countdown') and exists(select 1 from unnest(array['gateHoldOpen',
    'gateVehiclePresent','gateBeamBlocked','gateSensorFault','gateEmergencyActive','gateEmergencyHold']) k
    where after_settings->k = 'true') then return false; end if;
  if movement > 0 and (after_settings->'gateSensorFault' = 'true' or before_settings->'gateSensorFault' = 'true'
    or ((after_settings->'gateVehiclePresent' = 'true' or after_settings->'gateBeamBlocked' = 'true')
      and before_settings->>'gatePhase' is distinct from 'closing')) then return false; end if;
  return true;
end;
$$;

/** Atomically compare and save every device in an authorized simulation command.
 * The caller includes all derived safety changes; one forbidden or stale device
 * rejects the entire transaction. UUID receipts never reapply an old command. */
create function public.patch_household_simulation(target_home_id uuid,request_id uuid,client_id uuid,intent text,changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  change jsonb;
  candidate public.devices%rowtype;
  previous public.household_simulation_devices%rowtype;
  receipt public.household_simulation_receipts%rowtype;
  lease public.household_simulation_clocks%rowtype;
  expected_revision bigint;
  payload_hash bytea;
  checked_at timestamptz;
  gate_changed boolean := false;
  gate_clock_changed boolean := false;
  gate_id uuid;
  gate_state jsonb;
  replay boolean := false;
begin
  perform public.require_household_simulation_access(target_home_id);
  if request_id is null or client_id is null or intent is null or intent not in ('command','tick','pause')
    or jsonb_typeof(changes) is distinct from 'array' or octet_length(changes::text) > 131072 then
    raise exception 'Choose a valid simulation update' using errcode = '22023';
  end if;
  if jsonb_array_length(changes) not between 1 and 124 then
    raise exception 'Choose a valid simulation update' using errcode = '22023';
  end if;
  if not exists(select 1 from public.household_simulation_homes where home_id = target_home_id) then
    raise exception 'Household simulation is not enabled' using errcode = 'VH409';
  end if;
  payload_hash := sha256(convert_to(jsonb_build_object('clientId',client_id,'intent',intent,'changes',changes)::text,'UTF8'));
  select * into receipt from public.household_simulation_receipts r
    where r.home_id = target_home_id and r.request_id = patch_household_simulation.request_id;
  if found then
    if receipt.actor_id <> auth.uid() or receipt.payload_hash <> payload_hash then
      raise exception 'Request already belongs to a different update' using errcode = '22023';
    end if;
    replay := true;
  end if;
  if (select count(distinct item->>'deviceId') from jsonb_array_elements(changes) item) <> jsonb_array_length(changes) then
    raise exception 'Each simulation device may be changed only once' using errcode = '22023';
  end if;
  -- Authorization and current registry checks also apply to exact request replays.
  for change in select * from jsonb_array_elements(changes) loop
    if jsonb_typeof(change) is distinct from 'object'
      or not (change ?& array['deviceId','modelDeviceId','expectedRevision','state'])
      or exists(select 1 from jsonb_object_keys(change) k where k not in ('deviceId','modelDeviceId','expectedRevision','state'))
      or jsonb_typeof(change->'deviceId') is distinct from 'string'
      or (change->>'deviceId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(change->'modelDeviceId') is distinct from 'string'
      or jsonb_typeof(change->'expectedRevision') is distinct from 'number'
      or (change->>'expectedRevision') !~ '^[0-9]{1,16}$' then
      raise exception 'Choose a valid simulation update' using errcode = '22023';
    end if;
    expected_revision := (change->>'expectedRevision')::bigint;
    if expected_revision > 9007199254740990 then raise exception 'Invalid simulation revision' using errcode = '22023'; end if;
    select * into candidate from public.devices d where d.id = (change->>'deviceId')::uuid
      and d.home_id = target_home_id and d.simulation_only and d.model_device_id = change->>'modelDeviceId' for update;
    if not found then raise exception 'Simulation device unavailable' using errcode = '42501'; end if;
    if not public.can_control_household_simulation_device(candidate.id) then
      raise exception 'Simulation device control unavailable' using errcode = '42501';
    end if;
    if not public.valid_household_simulation_state(candidate.kind,change->'state') then
      raise exception 'Unsupported simulation device state' using errcode = '22023';
    end if;
  end loop;
  perform public.expire_household_simulation_clock(target_home_id);
  if replay then
    return public.read_household_simulation_snapshot(target_home_id) || jsonb_build_object('requestId',request_id,'status','existing');
  end if;
  select * into lease from public.household_simulation_clocks where home_id = target_home_id;
  checked_at := clock_timestamp();
  if intent in ('tick','pause') then
    if jsonb_array_length(changes) <> 1 or changes->0->>'modelDeviceId' <> 'entry-gate'
      or lease.client_id is distinct from client_id or lease.user_id is distinct from auth.uid()
      or lease.session_id::text is distinct from auth.jwt()->>'session_id' or lease.expires_at <= checked_at then
      raise exception 'Simulation clock is no longer owned by this client' using errcode = 'VH409';
    end if;
    if intent = 'tick' and checked_at < lease.last_tick_at + interval '1 second' then
      raise exception 'Simulation clock tick arrived too soon' using errcode = 'VH429';
    end if;
  end if;
  for change in select * from jsonb_array_elements(changes) loop
    select * into previous from public.household_simulation_devices s where s.device_id = (change->>'deviceId')::uuid;
    expected_revision := (change->>'expectedRevision')::bigint;
    if (not found and (expected_revision <> 0 or intent <> 'command'))
      or (found and (previous.home_id <> target_home_id or previous.model_device_id <> change->>'modelDeviceId'
        or previous.revision <> expected_revision)) then
      raise exception 'Simulation changed; refresh before trying again' using errcode = 'VH409';
    end if;
    if change->>'modelDeviceId' = 'entry-gate' then
      gate_changed := true;
      gate_id := (change->>'deviceId')::uuid;
      gate_state := change->'state';
      -- Preferences do not renew or steal a peer's running clock. A movement
      -- command starts a lease only when it changes the movement projection.
      gate_clock_changed := intent in ('tick','pause') or previous.state is null
        or previous.state->'level' is distinct from gate_state->'level'
        or previous.state->'settings'->'gatePhase' is distinct from gate_state->'settings'->'gatePhase'
        or previous.state->'settings'->'gateCloseTargetPercent' is distinct from gate_state->'settings'->'gateCloseTargetPercent'
        or previous.state->'settings'->'gateCountdownSec' is distinct from gate_state->'settings'->'gateCountdownSec';
      if intent = 'command' and previous.state->'settings'->>'gatePhase' = 'countdown'
        and gate_state->'settings'->>'gatePhase' = 'countdown'
        and (gate_state->'settings'->>'gateCountdownSec')::numeric
          < (previous.state->'settings'->>'gateCountdownSec')::numeric then
        raise exception 'Only the active clock may advance a countdown' using errcode = 'VH409';
      end if;
      if previous.state is null and gate_state->'settings'->>'gatePhase' in ('closing','countdown') then
        raise exception 'Initialize a stopped gate before starting motion' using errcode = '22023';
      end if;
      if previous.state is not null and not public.valid_household_simulation_gate_transition(previous.state,gate_state,intent) then
        raise exception 'Simulation gate safety changed; refresh before trying again' using errcode = 'VH409';
      end if;
      if intent = 'tick' and gate_state is distinct from public.next_household_simulation_gate_tick(previous.state) then
        raise exception 'Invalid simulation clock step' using errcode = '22023';
      elsif intent = 'pause' and gate_state is distinct from public.pause_household_simulation_gate(previous.state) then
        raise exception 'Invalid simulation pause' using errcode = '22023';
      end if;
    elsif intent <> 'command' then
      raise exception 'Simulation clock may only advance its gate' using errcode = '22023';
    end if;
    insert into public.household_simulation_devices(home_id,device_id,model_device_id,state,revision)
      values(target_home_id,(change->>'deviceId')::uuid,change->>'modelDeviceId',change->'state',expected_revision+1)
      on conflict(device_id) do update set state = excluded.state, revision = excluded.revision;
  end loop;
  if gate_changed and gate_clock_changed then
    if gate_state->'settings'->>'gatePhase' in ('countdown','closing') then
      insert into public.household_simulation_clocks(home_id,device_id,client_id,user_id,session_id,expires_at,last_tick_at)
        values(target_home_id,gate_id,client_id,auth.uid(),(auth.jwt()->>'session_id')::uuid,checked_at + interval '5 seconds',checked_at)
        on conflict(home_id) do update set device_id = excluded.device_id, client_id = excluded.client_id,
          user_id = excluded.user_id, session_id = excluded.session_id, expires_at = excluded.expires_at,last_tick_at = excluded.last_tick_at;
    else delete from public.household_simulation_clocks where home_id = target_home_id;
    end if;
  end if;
  insert into public.household_simulation_receipts(home_id,request_id,actor_id,payload_hash)
    values(target_home_id,request_id,auth.uid(),payload_hash);
  return public.read_household_simulation_snapshot(target_home_id) || jsonb_build_object('requestId',request_id,'status','applied');
end;
$$;

/** Rebinding a registry identity invalidates its old preview state. Deletions
 * already cascade; neither lifecycle path can make old receipts recreate it. */
create function public.invalidate_household_simulation_binding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.home_id,old.model_device_id,old.kind,old.simulation_only)
    is distinct from (new.home_id,new.model_device_id,new.kind,new.simulation_only) then
    delete from public.household_simulation_clocks where device_id = old.id;
    delete from public.household_simulation_devices where device_id = old.id;
  end if;
  return null;
end;
$$;
create trigger devices_invalidate_household_simulation after update of home_id,model_device_id,kind,simulation_only on public.devices
for each row execute function public.invalidate_household_simulation_binding();

revoke all on function public.household_simulation_schema(),public.valid_household_simulation_state(text,jsonb),
  public.can_read_household_simulation(uuid),public.can_read_household_simulation_device(uuid,uuid,text),
  public.can_control_household_simulation_device(uuid),public.require_household_simulation_access(uuid),public.pause_household_simulation_gate(jsonb),
  public.next_household_simulation_gate_tick(jsonb),public.valid_household_simulation_gate_transition(jsonb,jsonb,text),
  public.expire_household_simulation_clock(uuid),public.read_household_simulation_snapshot(uuid),
  public.get_household_simulation(uuid),public.enable_household_simulation(uuid,uuid,jsonb),
  public.patch_household_simulation(uuid,uuid,uuid,text,jsonb),public.invalidate_household_simulation_binding()
  from public,anon,authenticated,service_role;
grant execute on function public.can_read_household_simulation(uuid),public.can_read_household_simulation_device(uuid,uuid,text),
  public.get_household_simulation(uuid),public.enable_household_simulation(uuid,uuid,jsonb),
  public.patch_household_simulation(uuid,uuid,uuid,text,jsonb) to authenticated;

-- Default replica identity exposes only an opaque row UUID for deletion events;
-- old hidden-room state must never be published through REPLICA IDENTITY FULL.
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'household_simulation_devices') then
    alter publication supabase_realtime add table public.household_simulation_devices;
  end if;
end;
$$;
