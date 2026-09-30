import { describe, expect, it } from 'vitest';
import { DEVICE_KINDS, getCapabilities, getControlPages, validateStoredSetting, type DeviceKind } from './deviceCapabilities';
import originalInventory from './device-capabilities.json';

// Representative gaps from every custom original control family, including monitoring thresholds.
const originalExtraFields: Partial<Record<DeviceKind, string[]>> = {
  light: ['color', 'colorTempK', 'lightEffect', 'adaptiveLighting', 'motionBoost', 'nightShift', 'autoOffMin'],
  tv: ['source', 'channel'], ac: ['acFanSpeed', 'acSwingMode', 'acEcoMode', 'acTurboMode', 'acQuietMode', 'acTargetHumidity'],
  fan: ['fanOscillation', 'fanDirection', 'fanLightOn', 'fanAutoMode', 'fanSleepMode', 'fanTimerMin'],
  fridge: ['freezerTempC', 'fridgeMode', 'fridgeQuickCool', 'fridgeQuickFreeze', 'fridgeIceMaker', 'fridgeDoorAlarm', 'fridgeEnergySaver', 'fridgeHumidity'],
  coffee: ['coffeeCupCount', 'coffeeTempC', 'coffeeKeepWarmMin', 'coffeeGrinder', 'coffeeMilkFrother', 'coffeeAutoBrewTime'],
  vacuum: ['vacuumMode', 'vacuumSuction', 'vacuumMop', 'vacuumQuietMode'], gate: ['autoOpenEnabled'],
  camera: ['armed', 'recording', 'nightVision', 'motionAlerts', 'motionSensitivity', 'micMuted', 'twoWayAudio'],
  washer: ['washTemp', 'spinSpeedRpm', 'soilLevel', 'loadSize', 'rinseCount', 'prewash', 'steamWash', 'sanitizeWash', 'smartDispense', 'extraSpin', 'ecoWash'],
  dryer: ['heatLevel', 'drynessLevel', 'sensorDry', 'wrinkleGuard', 'steamRefresh', 'ecoDry', 'airFluff', 'coolDown', 'antiStatic'],
  dishwasher: ['cycle', 'washTemp', 'soilLevel', 'rinseCount', 'sanitizeWash'],
  stove: ['burnerLevel', 'stoveMode', 'stoveTimerMin', 'stoveLock'], microwave: ['timeRemainingSec', 'microwavePower', 'microwaveMode'],
  energy: ['energyBudgetKwh', 'gridOutageAlerts'], water: ['waterBudgetL', 'waterPressureLowPsi', 'waterPressureHighPsi', 'waterLeakAlerts', 'waterAutoShutoff', 'waterPressureAlerts'],
  'water-heater': ['waterHeaterType', 'heaterMode', 'recirculation', 'antiLegionella', 'vacationDays', 'heaterScheduleEnabled'],
  air: ['airAlertAqi', 'airAlertCo2', 'airAlertPm25', 'airAlertPm10', 'airAlertVoc', 'airAlertPollen', 'airPurifierMode', 'airPurifierSpeed', 'airIonizerEnabled', 'airAutoVentilation'],
  speaker: ['speakerSource', 'speakerPreset', 'bass', 'treble', 'spatialAudio', 'partyMode', 'nightMode', 'voiceAssistantEnabled', 'micEnabled', 'shuffle', 'repeat'],
  sprinkler: ['durationMin', 'zone', 'scheduleEnabled', 'scheduleHour', 'scheduleMinute', 'scheduleDays'], smoke: ['smokeSensorStatus'],
};

describe('shared original-device control pages', () => {
  it('retains custom original controls alongside every generated capability', () => {
    for (const kind of DEVICE_KINDS) {
      for (const capability of (originalInventory.profiles as Partial<Record<DeviceKind, readonly { id: string }[]>>)[kind] ?? []) {
        expect(getCapabilities(kind).find((item) => item.id === capability.id), `${kind}/${capability.id}`).toMatchObject(capability);
      }
    }
    for (const [kind, fields] of Object.entries(originalExtraFields)) {
      const actual = getCapabilities(kind as DeviceKind).flatMap((capability) => 'field' in capability ? [capability.field] : []);
      for (const field of fields) expect(actual, `${kind}/${field}`).toContain(field);
    }
  });

  it.each([1, 2, 3] as const)('paginates every device exactly once with %i large rows or six actions', (maxControlsPerPage) => {
    for (const kind of DEVICE_KINDS) {
      const capabilities = getCapabilities(kind);
      const pages = getControlPages({ kind }, { maxControlsPerPage });
      expect(new Set(capabilities.map((item) => item.id)).size, kind).toBe(capabilities.length);
      expect(new Set(pages.map((page) => page.id)).size, kind).toBe(pages.length);
      expect(pages.flatMap((page) => page.capabilities.map((item) => item.id)).sort()).toEqual(capabilities.map((item) => item.id).sort());
      for (const page of pages) {
        expect(page.capabilities.length).toBeGreaterThan(0);
        expect(page.capabilities.length).toBeLessThanOrEqual(page.compact ? 6 : maxControlsPerPage);
        expect(page.capabilities.every((item) => (item.type === 'action') === page.compact)).toBe(true);
        expect(page.label).toMatch(/^(Controls|Modes|Schedule|Status)( \d+)?$/);
        if (page.group === 'status') expect(page.capabilities.every((item) => item.type === 'stat')).toBe(true);
      }
    }
  });

  it.each([1, 2, 3, 4, 6] as const)('retains every action when only %i fit on a page', (maxActionsPerPage) => {
    for (const kind of DEVICE_KINDS) {
      const pages = getControlPages(kind, { maxControlsPerPage: 1, maxActionsPerPage });
      expect(pages.flatMap((page) => page.capabilities.map((item) => item.id)).sort()).toEqual(getCapabilities(kind).map((item) => item.id).sort());
      expect(pages.every((page) => page.capabilities.length <= (page.compact ? maxActionsPerPage : 1))).toBe(true);
    }
  });

  it('allows only explicitly bounded local outcome fields, not arbitrary telemetry or strings', () => {
    expect(validateStoredSetting('tv', 'playbackPositionSec', 3600)).toBe(3600);
    expect(validateStoredSetting('tv', 'playbackPositionSec', 9000)).toBe(3600);
    expect(validateStoredSetting('tv', 'playbackState', 'playing')).toBe('playing');
    expect(validateStoredSetting('tv', 'playbackState', 'https://stream.example')).toBeUndefined();
    expect(validateStoredSetting('camera', 'cameraPreviewEvent', 'Known visitor preview')).toBe('Known visitor preview');
    expect(validateStoredSetting('camera', 'cameraPreviewEvent', 'untrusted arbitrary event')).toBeUndefined();
    expect(validateStoredSetting('energy', 'powerW', 999)).toBeUndefined();
    expect(validateStoredSetting('light', '__proto__', 'x')).toBeUndefined();
    expect(validateStoredSetting('gate', 'scheduleDays', 'weekdays')).toBe('weekdays');
  });
});
