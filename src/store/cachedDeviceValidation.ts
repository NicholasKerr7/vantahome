import type { Device } from "./useHomeStore";
import { GAS_EVENTS } from "../../packages/home-scene/src/gasSimulation";

type Predicate = (value: unknown) => boolean;

/** Only records may hold structured cache values. */
export function cacheRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Reject nonfinite numeric values before they can enter controls or formatting. */
export function cacheNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Reject malformed UTF-16 identifiers before URI-backed routine identities can throw. */
export function cacheReference(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  // Use the same encoding boundary as routineId; valid surrogate pairs remain unchanged.
  try { encodeURIComponent(value); return true; }
  catch { return false; }
}

/** Validate optional device scalars using the same shape as persisted scene patches. */
const scalarFields = {
  boolean: [
    "simulationOnly", "isOn", "adaptiveLighting", "motionBoost", "nightShift", "autoOpenEnabled",
    "muted", "fanOscillation", "fanAutoMode", "fanLightOn", "fanSleepMode", "vacuumMop",
    "vacuumQuietMode", "vacuumBinFull", "vacuumBrushDirty", "armed", "recording", "nightVision",
    "motionAlerts", "micMuted", "twoWayAudio", "stoveLock", "prewash", "steamWash",
    "sanitizeWash", "smartDispense", "extraSpin", "ecoWash", "sensorDry", "wrinkleGuard",
    "steamRefresh", "ecoDry", "airFluff", "coolDown", "lintFilterOk", "antiStatic",
    "fridgeDoorOpen", "fridgeDoorAlarm", "fridgeIceMaker", "fridgeQuickCool", "fridgeQuickFreeze", "fridgeEnergySaver",
    "gridAvailable", "gridOutageAlerts", "waterLeakDetected", "waterLeakAlerts", "waterPressureAlerts", "waterAutoShutoff",
    "gasValveOpen", "gasUsageAlerts", "gasRefillAlerts", "gasRefillDue", "gasBudgetExceeded", "gasLeakInterlock",
    "gasLeakAlerts", "gasAutoShutoff", "gasLeakDetected", "gasAlarmSilenced", "spatialAudio", "partyMode",
    "nightMode", "micEnabled", "voiceAssistantEnabled", "shuffle", "recirculation", "antiLegionella",
    "heaterScheduleEnabled", "airAlertsEnabled", "airIonizerEnabled", "airAutoVentilation", "acEcoMode", "acTurboMode",
    "acQuietMode", "coffeeGrinder", "coffeeMilkFrother", "coffeeDescaleNeeded", "coDetected", "smokeSilenced",
    "smokeDetected",
  ] satisfies readonly (keyof Device)[],
  number: [
    "observedAt", "tempC", "brightness", "volume", "colorTempK", "autoOffMin",
    "channel", "speed", "fanTimerMin", "openPercent", "battery", "vacuumSuction",
    "vacuumFilterLife", "vacuumAreaM2", "vacuumRuntimeMin", "motionSensitivity", "lastSeenAt", "burnerLevel",
    "stoveTimerMin", "progress", "spinSpeedRpm", "remainingMin", "timeRemainingSec", "microwavePower",
    "freezerTempC", "fridgeFilterLife", "fridgeHumidity", "powerW", "energyTodayKwh", "energyPeakW",
    "energyMonthKwh", "energyCostToday", "energyBudgetKwh", "solarW", "solarTodayKwh", "gridTodayKwh",
    "waterLpm", "waterTodayL", "waterPressurePsi", "waterPressureLowPsi", "waterPressureHighPsi", "waterTempC",
    "waterBudgetL", "gasBudgetKg", "gasRefillAlertPercent", "gasFlowKgH", "gasTodayKg", "gasMonthKg",
    "gasRemainingKg", "gasCapacityKg", "gasRemainingPercent", "gasConcentrationPercentLel", "gasBatteryPercent", "gasTestCount",
    "gasLastSampleKg", "bass", "treble", "trackDurationSec", "trackProgressSec", "vacationDays",
    "airQualityIndex", "humidity", "airPm25", "airPm10", "airCo2", "airVoc",
    "airFormaldehyde", "airPollen", "airQualityConfidence", "airOutdoorAqi", "airOutdoorPm25", "airOutdoorCo2",
    "airOutdoorVoc", "airOutdoorHumidity", "airOutdoorTempC", "airAlertAqi", "airAlertCo2", "airAlertVoc",
    "airAlertPm25", "airAlertPm10", "airAlertPollen", "airPurifierSpeed", "airFilterLife", "airFilterDaysLeft",
    "airLastUpdatedAt", "acFanSpeed", "acTargetHumidity", "acFilterLife", "coffeeSizeOz", "coffeeTempC",
    "coffeeKeepWarmMin", "coffeeCupCount", "coffeeWaterLevel", "coffeeBeanLevel", "coPpm", "smokePpm",
    "smokeBattery", "smokeLastTestAt", "smokeLastAlarmAt", "durationMin",
  ] satisfies readonly (keyof Device)[],
  string: [
    "id", "name", "roomId", "color", "source", "stackId",
    "openLastActor", "streamUrl", "thumbnailUrl", "lastThumbnailUrl", "cycle", "trackTitle",
    "trackArtist", "trackAlbum", "airSensorLabel", "coffeeAutoBrewTime", "zone",
  ] satisfies readonly (keyof Device)[],
};

const enumFields: Partial<Record<keyof Device, readonly unknown[]>> = {
  kind: ["ac", "light", "tv", "coffee", "fridge", "gate", "garage", "fan", "door", "vacuum", "camera", "window", "stove", "washer", "dryer", "dishwasher", "microwave", "energy", "water", "gas-meter", "gas-leak", "water-heater", "air", "sprinkler", "speaker", "smoke", "blinds", "solar", "battery", "generator"],
  mode: ["cold", "fan", "dry"],
  lightEffect: ["focus", "relax", "sunset", "party"],
  stackPosition: ["top", "bottom"],
  fanDirection: ["forward", "reverse"],
  status: ["docked", "cleaning", "paused"],
  vacuumMode: ["auto", "spot", "edge", "room"],
  stoveMode: ["simmer", "boil", "sear", "keep-warm"],
  washTemp: ["Cold", "Warm", "Hot"],
  soilLevel: ["Light", "Normal", "Heavy"],
  heatLevel: ["Low", "Med", "High"],
  drynessLevel: ["Damp", "Dry", "Extra"],
  loadSize: ["Small", "Medium", "Large"],
  rinseCount: [1, 2, 3],
  microwaveMode: ["Reheat", "Defrost", "Grill", "Popcorn"],
  fridgeMode: ["eco", "normal", "boost", "vacation"],
  gasTestResult: ["not-run", "passed"],
  gasLastEvent: GAS_EVENTS,
  speakerSource: ["AirPlay", "Bluetooth", "Spotify", "AUX", "TV"],
  speakerPreset: ["Flat", "Warm", "Bright", "Bass", "Vocal"],
  repeat: ["off", "all", "one"],
  waterHeaterType: ["electric-tank", "gas-tank", "heat-pump", "tankless"],
  heaterMode: ["eco", "standard", "boost", "vacation"],
  airPurifierMode: ["auto", "manual", "sleep", "boost"],
  acSwingMode: ["off", "vertical", "horizontal", "both"],
  coffeeStrength: ["mild", "normal", "strong"],
  smokeSensorStatus: ["ok", "warning", "error"],
};

/** Validate nested schedules and history as well as all scalar patch fields. */
export function validCachedDevicePatch(value: unknown): boolean {
  if (!cacheRecord(value) || (value.id !== undefined && !cacheReference(value.id))) return false;
  for (const [kind, fields] of Object.entries(scalarFields)) {
    if (fields.some((field) => value[field] !== undefined && (typeof value[field] !== kind
      || (kind === "number" && !cacheNumber(value[field]))))) return false;
  }
  for (const [field, options] of Object.entries(enumFields)) {
    if (value[field] !== undefined && !options.includes(value[field])) return false;
  }
  if (value.modelDeviceId !== undefined && value.modelDeviceId !== null && typeof value.modelDeviceId !== "string") return false;
  if (value.reportedCapabilityIds !== undefined && !cacheArray(value.reportedCapabilityIds, (item) => typeof item === "string")) return false;
  if (value.schedule !== undefined && !cacheArray(value.schedule, (item) => cacheRecord(item)
    && typeof item.id === "string" && validClockTime(item.hour, item.minute)
    && typeof item.enabled === "boolean" && validDays(item.days))) return false;
  if (value.airHistory !== undefined && !cacheArray(value.airHistory, (item) => cacheRecord(item)
    && cacheNumber(item.ts) && Object.values(item).every(cacheNumber))) return false;
  return true;
}

/** An array is usable only if every nested entry is valid. */
export function cacheArray(value: unknown, predicate: Predicate): value is unknown[] {
  return Array.isArray(value) && value.every(predicate);
}

/** Persist only meaningful local wall-clock hours and minutes. */
export function validClockTime(hour: unknown, minute: unknown): boolean {
  return cacheNumber(hour) && Number.isInteger(hour) && hour >= 0 && hour <= 23
    && cacheNumber(minute) && Number.isInteger(minute) && minute >= 0 && minute <= 59;
}

/** A weekday filter never accepts arbitrary strings or missing lists. */
export function validDays(value: unknown): boolean {
  return cacheArray(value, (day) => typeof day === "string" && ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(day));
}
