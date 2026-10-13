import { PRESETS } from '../../packages/home-scene/src/data';
import { cacheArray, cacheNumber, cacheRecord, cacheReference, validCachedDevicePatch, validClockTime, validDays } from './cachedDeviceValidation';

/** Validate each trigger discriminator before selectors inspect its referenced device or scene. */
function validTrigger(value: unknown): boolean {
  if (!cacheRecord(value)) return false;
  switch (value.type) {
    case 'time': return validClockTime(value.hour, value.minute);
    case 'device': return cacheReference(value.deviceId) && (value.state === 'on' || value.state === 'off');
    case 'scene': return cacheReference(value.sceneId);
    case 'presence': return cacheReference(value.memberId) && (value.status === 'home' || value.status === 'away');
    default: return false;
  }
}

/** Conditions require complete clock bounds and lists; empty lists remain valid disabled drafts. */
function validCondition(value: unknown): boolean {
  if (!cacheRecord(value)) return false;
  switch (value.type) {
    case 'time-range': return validClockTime(value.startHour, value.startMinute) && validClockTime(value.endHour, value.endMinute);
    case 'device': return validTrigger(value);
    case 'day': return validDays(value.days);
    default: return false;
  }
}

/** Reject malformed execution operands instead of allowing partial automation hydration. */
function validAction(value: unknown): boolean {
  if (!cacheRecord(value)) return false;
  switch (value.type) {
    case 'toggle': return cacheReference(value.deviceId) && typeof value.on === 'boolean';
    case 'set-ac': return cacheReference(value.deviceId) && cacheNumber(value.tempC) && typeof value.mode === 'string' && ['cold', 'fan', 'dry'].includes(value.mode);
    case 'set-brightness': return cacheReference(value.deviceId) && cacheNumber(value.brightness) && value.brightness >= 0 && value.brightness <= 100;
    case 'run-scene': return cacheReference(value.sceneId);
    case 'delay': return cacheNumber(value.seconds) && value.seconds >= 0;
    case 'notify': return typeof value.message === 'string';
    default: return false;
  }
}

/** Preserve valid legacy schedules while enforcing their narrower trigger and action variants. */
function validRule(value: unknown): boolean {
  return cacheRecord(value) && cacheReference(value.id) && typeof value.name === 'string' && typeof value.enabled === 'boolean'
    && cacheRecord(value.trigger) && value.trigger.type === 'time' && validTrigger(value.trigger)
    && cacheRecord(value.action) && (value.action.type === 'toggle' || value.action.type === 'set-ac') && validAction(value.action);
}

/** Flows may be empty drafts, but every collection and nested discriminated union must be intact. */
function validFlow(value: unknown): boolean {
  return cacheRecord(value) && cacheReference(value.id) && typeof value.name === 'string' && typeof value.enabled === 'boolean'
    && (value.legacyRuleId === undefined || cacheReference(value.legacyRuleId))
    && cacheArray(value.triggers, validTrigger) && cacheArray(value.conditions, validCondition) && cacheArray(value.actions, validAction);
}

/** Scenes validate their complete action structure before camera URLs are sanitized. */
function validScene(value: unknown): boolean {
  return cacheRecord(value) && cacheReference(value.id) && typeof value.name === 'string' && typeof value.roomId === 'string'
    && (value.scope === undefined || value.scope === 'home' || value.scope === 'room')
    && (value.modelPreset === undefined || PRESETS.some((preset) => preset.id === value.modelPreset))
    && cacheArray(value.actions, (action) => cacheRecord(action) && cacheReference(action.deviceId)
      && (action.type === 'patch' ? validCachedDevicePatch(action.patch)
        : action.type === 'toggle' && (action.on === undefined || typeof action.on === 'boolean')));
}

/** Missing legacy collections can migrate; present collections must validate without losing unread bytes. */
export function validCachedRoutineCollections(state: Record<string, unknown>): boolean {
  return (state.rules === undefined || cacheArray(state.rules, validRule))
    && (state.flows === undefined || cacheArray(state.flows, validFlow))
    && (state.scenes === undefined || cacheArray(state.scenes, validScene));
}
