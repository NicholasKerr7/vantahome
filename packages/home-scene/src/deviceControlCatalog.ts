import type { ControlGroup, DeviceActionOperation, DeviceCapability, DeviceKind } from './deviceCapabilities';
import type { SettingValue } from './simulationTypes';

/** Keep extra controls typed and separate from the generated original capability export. */
function range(kind: DeviceKind, field: string, label: string, min: number, max: number, unit?: string, group: ControlGroup = 'controls', step = 1): DeviceCapability {
  return { id: `${kind}-${field}`, type: 'range', field, label, min, max, step, unit, group };
}

/** Give enum controls only the explicitly supported local values. */
function choice(kind: DeviceKind, field: string, label: string, values: readonly (string | [string, string])[], group: ControlGroup = 'modes'): DeviceCapability {
  return { id: `${kind}-${field}`, type: 'enum', field, label, group, options: values.map((value) => typeof value === 'string' ? { label: value, value } : { label: value[0], value: value[1] }) };
}

/** Build switches whose labels remain meaningful outside the original screen. */
function toggle(kind: DeviceKind, field: string, label: string, group: ControlGroup = 'modes'): DeviceCapability {
  return { id: `${kind}-${field}`, type: 'toggle', field, label, group };
}

/** Expose a reading without allowing a control to overwrite it. */
function stat(kind: DeviceKind, field: string, label: string, unit?: string): DeviceCapability {
  return { id: `${kind}-${field}`, type: 'stat', field, label, unit, group: 'status' };
}

/** Catalog actions carry bounded local patches or an explicit simulation operation. */
function action(kind: DeviceKind, id: string, label: string, patch: Record<string, SettingValue> = {}, operation?: DeviceActionOperation): DeviceCapability {
  return { id: `${kind}-${id}`, type: 'action', label, group: 'controls', patch, ...(operation ? { operation } : {}) };
}

/** Reuse the same honest, local playback controls for the TV and speaker previews. */
function mediaControls(kind: 'tv' | 'speaker'): DeviceCapability[] {
  return [
    action(kind, 'play-pause', 'Play / pause preview', {}, { type: 'media', command: 'play-pause' }),
    ...(['rewind', 'forward', 'previous', 'next'] as const).map((command) => action(kind, command, `${command[0].toUpperCase()}${command.slice(1)} preview`, {}, { type: 'media', command })),
    stat(kind, 'playbackState', 'Preview playback'), stat(kind, 'playbackPositionSec', 'Preview position', 's'), stat(kind, 'trackIndex', 'Preview track'),
  ];
}

/** Cover commands share the same position reducer as their percentage slider. */
function coverControls(kind: 'gate' | 'garage' | 'door' | 'window' | 'blinds'): DeviceCapability[] {
  return [action(kind, 'command-open', 'Open', { openPercent: 100 }), action(kind, 'command-close', 'Close', { openPercent: 0 })];
}

const lightColors: [string, string][] = [['Amber', '#FFD166'], ['Ice', '#A0E9FF'], ['Rose', '#FF9AA2'], ['Lavender', '#B69CFF'], ['Mint', '#A5FF9B'], ['White', '#FFFFFF']];

// These fields are the extra controls authored directly in the original detail screens.
export const supplementalCapabilities: Partial<Record<DeviceKind, DeviceCapability[]>> = {
  light: [
    choice('light', 'color', 'Color', lightColors, 'controls'),
    range('light', 'colorTempK', 'White temperature', 2000, 6500, 'K', 'controls', 100),
    choice('light', 'lightColorMode', 'Color mode', [['Color', 'color'], ['White temperature', 'temperature']]),
    choice('light', 'lightEffect', 'Effect preview', [['None', 'none'], ['Focus', 'focus'], ['Relax', 'relax'], ['Sunset', 'sunset'], ['Party', 'party']]),
    toggle('light', 'adaptiveLighting', 'Adaptive lighting'), toggle('light', 'motionBoost', 'Motion boost'), toggle('light', 'nightShift', 'Night shift'),
    range('light', 'autoOffMin', 'Auto-off preference', 0, 120, 'min', 'schedule'),
    action('light', 'scene-warm', 'Warm scene', { isOn: true, brightness: 60, color: '#FFD166', lightColorMode: 'color', lightEffect: 'none' }),
    action('light', 'scene-cool', 'Cool scene', { isOn: true, brightness: 70, color: '#A0E9FF', lightColorMode: 'color', lightEffect: 'none' }),
    action('light', 'scene-focus', 'Focus scene', { isOn: true, brightness: 80, color: '#FFFFFF', lightColorMode: 'color', lightEffect: 'none' }),
    ...([['Warm white', 2400], ['Soft white', 3000], ['Neutral white', 4000], ['Daylight', 5200]] as const).map(([label, temperature]) => action('light', `white-${temperature}`, label, { isOn: true, colorTempK: temperature, lightColorMode: 'temperature', lightEffect: 'none' })),
  ],
  tv: [
    choice('tv', 'source', 'Preview source', ['Live TV', 'Guide', 'YouTube', 'Netflix', 'Settings', 'Home'], 'controls'),
    range('tv', 'channel', 'Preview channel', 1, 999),
    action('tv', 'channel-up', 'Channel +', {}, { type: 'increment', field: 'channel', delta: 1 }),
    action('tv', 'channel-down', 'Channel −', {}, { type: 'increment', field: 'channel', delta: -1 }),
    ...(['Guide', 'YouTube', 'Netflix', 'Settings'] as const).map((source) => action('tv', `source-${source.toLowerCase()}`, `${source} preview`, { isOn: true, source })),
    ...(['up', 'left', 'select', 'right', 'down', 'home'] as const).map((direction) => action('tv', `remote-${direction}`, direction === 'select' ? 'OK' : `${direction[0].toUpperCase()}${direction.slice(1)}`, {}, { type: 'navigate', direction })),
    ...mediaControls('tv'), stat('tv', 'remoteFocus', 'Preview focused tile'), stat('tv', 'remoteSelection', 'Preview selected tile'), stat('tv', 'remoteAction', 'Last remote input'),
  ],
  ac: [
    range('ac', 'acFanSpeed', 'Fan speed', 0, 100, '%'),
    choice('ac', 'acSwingMode', 'Swing', [['Off', 'off'], ['Vertical', 'vertical'], ['Horizontal', 'horizontal'], ['Both', 'both']]),
    toggle('ac', 'acEcoMode', 'Eco mode'), toggle('ac', 'acTurboMode', 'Turbo mode'), toggle('ac', 'acQuietMode', 'Quiet mode'),
    range('ac', 'acTargetHumidity', 'Target humidity', 30, 60, '%'), stat('ac', 'acFilterLife', 'Filter life', '%'),
  ],
  fan: [
    action('fan', 'breeze', 'Breeze', { isOn: true, speed: 35 }), action('fan', 'standard', 'Standard', { isOn: true, speed: 60 }), action('fan', 'turbo', 'Turbo', { isOn: true, speed: 90 }),
    toggle('fan', 'fanOscillation', 'Oscillation'), choice('fan', 'fanDirection', 'Direction', [['Forward', 'forward'], ['Reverse', 'reverse']]),
    toggle('fan', 'fanLightOn', 'Integrated light'), toggle('fan', 'fanAutoMode', 'Auto mode'), toggle('fan', 'fanSleepMode', 'Sleep mode'),
    range('fan', 'fanTimerMin', 'Timer preference', 0, 240, 'min', 'schedule'),
  ],
  fridge: [
    range('fridge', 'freezerTempC', 'Freezer temperature', -24, -12, '°C'),
    choice('fridge', 'fridgeMode', 'Mode', [['Eco', 'eco'], ['Normal', 'normal'], ['Boost', 'boost'], ['Vacation', 'vacation']]),
    toggle('fridge', 'fridgeQuickCool', 'Quick cool'), toggle('fridge', 'fridgeQuickFreeze', 'Quick freeze'), toggle('fridge', 'fridgeIceMaker', 'Ice maker'),
    toggle('fridge', 'fridgeDoorAlarm', 'Door alarm'), toggle('fridge', 'fridgeEnergySaver', 'Energy saver'),
    range('fridge', 'fridgeHumidity', 'Humidity target', 30, 70, '%'), stat('fridge', 'fridgeDoorOpen', 'Door open'), stat('fridge', 'fridgeFilterLife', 'Filter life', '%'),
  ],
  coffee: [
    range('coffee', 'coffeeCupCount', 'Cups', 1, 6), range('coffee', 'coffeeTempC', 'Brew temperature', 80, 98, '°C'),
    range('coffee', 'coffeeKeepWarmMin', 'Keep-warm preference', 0, 60, 'min', 'schedule'),
    toggle('coffee', 'coffeeGrinder', 'Grinder'), toggle('coffee', 'coffeeMilkFrother', 'Milk frother'),
    choice('coffee', 'coffeeAutoBrewTime', 'Auto-brew preference', ['06:30', '07:00', '07:30', '08:00'], 'schedule'),
    stat('coffee', 'coffeeBeanLevel', 'Beans', '%'), stat('coffee', 'coffeeDescaleNeeded', 'Descaling needed'),
  ],
  vacuum: [
    action('vacuum', 'pause', 'Pause cleaning', { isOn: false, status: 'paused' }),
    choice('vacuum', 'vacuumMode', 'Cleaning mode', [['Auto', 'auto'], ['Spot', 'spot'], ['Edge', 'edge'], ['Room', 'room']]),
    range('vacuum', 'vacuumSuction', 'Suction', 0, 100, '%'), toggle('vacuum', 'vacuumMop', 'Mop'), toggle('vacuum', 'vacuumQuietMode', 'Quiet mode'),
    stat('vacuum', 'vacuumBinFull', 'Bin full'), stat('vacuum', 'vacuumBrushDirty', 'Brush needs cleaning'), stat('vacuum', 'vacuumFilterLife', 'Filter life', '%'),
    stat('vacuum', 'vacuumAreaM2', 'Sample cleaned area', 'm²'), stat('vacuum', 'vacuumRuntimeMin', 'Sample runtime', 'min'),
  ],
  gate: [...coverControls('gate'), toggle('gate', 'autoOpenEnabled', 'Auto-open preference')],
  garage: coverControls('garage'), door: coverControls('door'), blinds: coverControls('blinds'),
  window: [...coverControls('window'), action('window', 'vent', 'Vent', { openPercent: 25 })],
  microwave: [
    ...([30, 60, 120] as const).map((delta) => action('microwave', `add-${delta}`, `+${delta < 60 ? `${delta}s` : `${delta / 60}m`}`, {}, { type: 'increment', field: 'timeRemainingSec', delta })),
  ],
  camera: [
    action('camera', 'snapshot', 'Simulate snapshot', { cameraPreviewEvent: 'Simulated snapshot' }),
    action('camera', 'known-visitor', 'Simulate known visitor', { cameraPreviewEvent: 'Known visitor preview' }),
    action('camera', 'unknown-visitor', 'Simulate unknown visitor', { cameraPreviewEvent: 'Unknown visitor preview' }),
    stat('camera', 'cameraPreviewEvent', 'Local preview event'),
  ],
  energy: [
    action('energy', 'outage', 'Simulate grid outage', { gridAvailable: false }), action('energy', 'restore-grid', 'Restore sample grid', { gridAvailable: true }),
  ],
  'water-heater': [choice('water-heater', 'waterHeaterType', 'Heater type', [['Electric tank', 'electric-tank'], ['Gas tank', 'gas-tank'], ['Heat pump', 'heat-pump'], ['Tankless', 'tankless']])],
  air: [
    range('air', 'airAlertAqi', 'AQI alert threshold', 50, 200), range('air', 'airAlertCo2', 'CO₂ alert threshold', 600, 2000, 'ppm'),
    range('air', 'airAlertPm25', 'PM2.5 alert threshold', 10, 120, 'µg/m³'), range('air', 'airAlertPm10', 'PM10 alert threshold', 20, 160, 'µg/m³'),
    range('air', 'airAlertVoc', 'VOC alert threshold', 80, 800, 'ppb'), range('air', 'airAlertPollen', 'Pollen alert threshold', 1, 5),
  ],
  speaker: mediaControls('speaker'),
  smoke: [
    action('smoke', 'test-alarm', 'Simulate alarm test', { smokeDetected: true, coDetected: false, smokeSilenced: false }),
    action('smoke', 'silence', 'Silence preview', { smokeDetected: false, coDetected: false, smokeSilenced: true }),
    choice('smoke', 'smokeSensorStatus', 'Sample sensor status', [['OK', 'ok'], ['Warning', 'warning'], ['Error', 'error']]),
    stat('smoke', 'smokeSilenced', 'Preview silenced'), stat('smoke', 'coDetected', 'Sample CO alarm'),
  ],
};

const scheduledKinds: readonly DeviceKind[] = ['light', 'ac', 'fan', 'tv', 'coffee', 'vacuum', 'washer', 'dryer', 'dishwasher', 'water-heater', 'sprinkler', 'blinds', 'gate', 'garage', 'window', 'door', 'speaker'];
export const SIMULATION_SCHEDULE_NOTE = 'Stored locally for simulation; does not run automations.';

/** A single bounded schedule preference avoids pretending to run a background automation. */
export function scheduleCapabilities(kind: DeviceKind): DeviceCapability[] {
  if (!scheduledKinds.includes(kind)) return [];
  return [
    toggle(kind, 'scheduleEnabled', 'Save schedule preference', 'schedule'),
    range(kind, 'scheduleHour', 'Hour (24-hour)', 0, 23, undefined, 'schedule'),
    range(kind, 'scheduleMinute', 'Minute', 0, 59, undefined, 'schedule'),
    choice(kind, 'scheduleDays', 'Days', [['Every day', 'daily'], ['Weekdays', 'weekdays'], ['Weekends', 'weekends'], ['Monday', 'monday'], ['Tuesday', 'tuesday'], ['Wednesday', 'wednesday'], ['Thursday', 'thursday'], ['Friday', 'friday'], ['Saturday', 'saturday'], ['Sunday', 'sunday']], 'schedule'),
  ];
}

const playbackDefaults = { playbackState: 'stopped', playbackPositionSec: 0, trackIndex: 1 };
const scheduleDefaults = Object.fromEntries(scheduledKinds.map((kind) => [kind, { scheduleEnabled: false, scheduleHour: 7, scheduleMinute: 0, scheduleDays: 'daily' }])) as Partial<Record<DeviceKind, Record<string, SettingValue>>>;
const customDefaults: Partial<Record<DeviceKind, Record<string, SettingValue>>> = {
  light: { color: '#FFD166', colorTempK: 3200, lightColorMode: 'color', lightEffect: 'none', adaptiveLighting: false, motionBoost: false, nightShift: false, autoOffMin: 0 },
  tv: { source: 'Live TV', channel: 1, ...playbackDefaults, remoteFocus: 5, remoteSelection: 0, remoteAction: 'none' },
  ac: { acFanSpeed: 60, acSwingMode: 'both', acEcoMode: false, acTurboMode: false, acQuietMode: false, acTargetHumidity: 45, acFilterLife: 100 },
  fan: { fanOscillation: true, fanDirection: 'forward', fanLightOn: true, fanAutoMode: false, fanSleepMode: false, fanTimerMin: 0 },
  fridge: { freezerTempC: -18, fridgeMode: 'normal', fridgeQuickCool: false, fridgeQuickFreeze: false, fridgeIceMaker: true, fridgeDoorAlarm: true, fridgeEnergySaver: true, fridgeHumidity: 50, fridgeDoorOpen: false, fridgeFilterLife: 100 },
  coffee: { coffeeCupCount: 2, coffeeTempC: 92, coffeeKeepWarmMin: 20, coffeeGrinder: true, coffeeMilkFrother: false, coffeeAutoBrewTime: '07:00', coffeeBeanLevel: 55, coffeeDescaleNeeded: false },
  vacuum: { vacuumMode: 'auto', vacuumSuction: 70, vacuumMop: false, vacuumQuietMode: false, vacuumBinFull: false, vacuumBrushDirty: false, vacuumFilterLife: 100, vacuumAreaM2: 0, vacuumRuntimeMin: 0 },
  gate: { autoOpenEnabled: false }, camera: { cameraPreviewEvent: 'No preview events' },
  'water-heater': { waterHeaterType: 'electric-tank' },
  air: { airAlertAqi: 100, airAlertCo2: 1200, airAlertPm25: 35, airAlertPm10: 50, airAlertVoc: 300, airAlertPollen: 3 },
  speaker: playbackDefaults, smoke: { smokeSilenced: false, coDetected: false, smokeSensorStatus: 'ok' },
};
export const supplementalDefaults = Object.fromEntries([...new Set([...Object.keys(scheduleDefaults), ...Object.keys(customDefaults)])].map((key) => {
  const kind = key as DeviceKind;
  return [kind, { ...scheduleDefaults[kind], ...customDefaults[kind] }];
})) as Partial<Record<DeviceKind, Record<string, SettingValue>>>;

/** These allowlisted outcome fields can cross the bridge but remain read-only in the UI. */
function playbackStatus(kind: 'tv' | 'speaker'): DeviceCapability[] {
  return [choice(kind, 'playbackState', '', ['stopped', 'playing', 'paused']), range(kind, 'playbackPositionSec', '', 0, 3600), range(kind, 'trackIndex', '', 1, 99)];
}
export const simulatedStatusFields: Partial<Record<DeviceKind, DeviceCapability[]>> = {
  tv: [...playbackStatus('tv'), range('tv', 'remoteFocus', '', 1, 9), range('tv', 'remoteSelection', '', 0, 9), choice('tv', 'remoteAction', '', ['none', 'up', 'down', 'left', 'right', 'select', 'home'])],
  speaker: playbackStatus('speaker'),
};
