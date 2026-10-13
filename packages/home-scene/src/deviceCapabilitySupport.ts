import type { DeviceCapability, DeviceKind } from './deviceCapabilities';

export const SAVED_CONFIGURATION_NOTE = 'Saved preferences only · no simulated operation.';

// These settings remain valid in older snapshots and can be configured, but have no
// consumer that changes this model. Keep them explicit instead of implying execution.
const CONFIGURATION_FIELDS: Partial<Record<DeviceKind, readonly string[]>> = {
  light: ['adaptiveLighting', 'motionBoost', 'nightShift', 'autoOffMin'],
  ac: ['acTargetHumidity'],
  fan: ['fanOscillation', 'fanLightOn', 'fanAutoMode', 'fanTimerMin'],
  tv: ['volume', 'muted', 'source', 'channel'],
  fridge: ['tempC', 'freezerTempC', 'fridgeMode', 'fridgeQuickCool', 'fridgeQuickFreeze', 'fridgeIceMaker', 'fridgeDoorAlarm', 'fridgeEnergySaver', 'fridgeHumidity'],
  coffee: ['coffeeStrength', 'coffeeSizeOz', 'coffeeCupCount', 'coffeeTempC', 'coffeeKeepWarmMin', 'coffeeGrinder', 'coffeeMilkFrother', 'coffeeAutoBrewTime'],
  vacuum: ['vacuumMode', 'vacuumSuction', 'vacuumMop', 'vacuumQuietMode'],
  gate: ['autoOpenEnabled'],
  camera: ['recording', 'nightVision', 'motionAlerts', 'micMuted', 'twoWayAudio', 'motionSensitivity'],
  stove: ['burnerLevel', 'stoveMode', 'stoveTimerMin', 'stoveLock'],
  washer: ['cycle', 'washTemp', 'spinSpeedRpm', 'soilLevel', 'loadSize', 'rinseCount', 'prewash', 'steamWash', 'sanitizeWash', 'smartDispense', 'extraSpin', 'ecoWash'],
  dryer: ['cycle', 'heatLevel', 'drynessLevel', 'sensorDry', 'wrinkleGuard', 'steamRefresh', 'ecoDry', 'airFluff', 'coolDown', 'antiStatic'],
  dishwasher: ['cycle', 'washTemp', 'soilLevel', 'rinseCount', 'prewash', 'steamWash', 'sanitizeWash', 'smartDispense', 'extraSpin', 'ecoWash'],
  microwave: ['timeRemainingSec', 'microwavePower', 'microwaveMode'],
  energy: ['energyBudgetKwh'],
  water: ['waterAutoShutoff'],
  'water-heater': ['tempC', 'heaterMode', 'recirculation', 'antiLegionella', 'heaterScheduleEnabled', 'vacationDays', 'waterHeaterType'],
  air: ['airPurifierMode', 'airPurifierSpeed', 'airIonizerEnabled', 'airAutoVentilation'],
  sprinkler: ['durationMin', 'zone'],
  speaker: ['speakerSource', 'speakerPreset', 'bass', 'treble', 'spatialAudio', 'partyMode', 'nightMode', 'voiceAssistantEnabled', 'micEnabled', 'shuffle', 'repeat'],
  generator: ['generatorMode'],
  battery: ['storageMode', 'reservePercent'],
};

/** Annotate saved-only settings once for both native and browser inspectors, without changing IDs or validation. */
export function describeCapabilitySupport(kind: DeviceKind, capability: DeviceCapability): DeviceCapability {
  if (!('field' in capability) || capability.type === 'stat') return capability;
  const configurationOnly = CONFIGURATION_FIELDS[kind]?.includes(capability.field)
    || ['scheduleEnabled', 'scheduleHour', 'scheduleMinute', 'scheduleDays'].includes(capability.field);
  return configurationOnly ? { ...capability, configurationOnly: true } : capability;
}

/** Explain why a page preserves configuration without claiming live behavior or additional hardware. */
export function configurationPageNote(kind: DeviceKind, capabilities: readonly DeviceCapability[]): string | undefined {
  if (!capabilities.length || !capabilities.every((capability) => capability.configurationOnly)) return undefined;
  if (kind === 'fan' && capabilities.some((capability) => 'field' in capability && ['fanOscillation', 'fanLightOn'].includes(capability.field))) {
    return 'Saved only · this fixed fan has no oscillation or lamp.';
  }
  if (kind === 'tv') return 'Saved preview settings · no stream or audio.';
  return SAVED_CONFIGURATION_NOTE;
}
