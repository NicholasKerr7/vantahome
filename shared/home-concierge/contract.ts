/** The only device families this first, simulation-only assistant may describe or draft. */
export type ComfortKind = 'light' | 'ac' | 'fan' | 'blinds' | 'tv' | 'speaker';
export type ConciergeValues = {
  isOn?: boolean;
  brightness?: number;
  tempC?: number;
  openPercent?: number;
  volume?: number;
  colorTempK?: number;
};
export type ConciergeDevice = { id: string; kind: ComfortKind; controllable: boolean };
export type ConciergeContext = {
  mode: 'simulation';
  capturedAt: number;
  devices: { id: string; values: ConciergeValues }[];
};
export type ConciergeRequest = { homeId: string; question: string; context: ConciergeContext };
export type ConciergeScene = {
  name: string;
  explanation: string;
  actions: { deviceId: string; values: ConciergeValues }[];
};
export type ConciergeResponse = {
  title: string;
  answer: string;
  deviceIds: string[];
  scene: ConciergeScene | null;
};

export const MAX_CONCIERGE_DEVICES = 128;
export const MAX_CONCIERGE_ACTIONS = 32;
export const MAX_CONCIERGE_CONTEXT_AGE_MS = 60_000;
export const MAX_CONCIERGE_QUESTION_LENGTH = 600;
export const COMFORT_KINDS: readonly ComfortKind[] = ['light', 'ac', 'fan', 'blinds', 'tv', 'speaker'];
const VALUE_FIELDS = ['isOn', 'brightness', 'tempC', 'openPercent', 'volume', 'colorTempK'] as const;
const FIELDS_BY_KIND: Record<ComfortKind, readonly (keyof ConciergeValues)[]> = {
  light: ['isOn', 'brightness', 'colorTempK'], ac: ['isOn', 'tempC'], fan: ['isOn'],
  blinds: ['openPercent'], tv: ['isOn', 'volume'], speaker: ['isOn', 'volume'],
};
const RANGES: Record<Exclude<keyof ConciergeValues, 'isOn'>, readonly [number, number, number]> = {
  brightness: [0, 100, 1], tempC: [15, 28, 1], openPercent: [0, 100, 1],
  volume: [0, 100, 1], colorTempK: [2000, 6500, 100],
};

/** Require ordinary JSON records; prototypes and arrays are never accepted as settings. */
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
}

/** Reject both missing and extra keys at every protocol object boundary. */
function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

/** Keep identifiers opaque, bounded and safe to compare without coercion. */
function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(value);
}

/** Preserve normal prose while rejecting hidden controls and empty or unbounded strings. */
function prose(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

/** Narrow external catalog kinds without treating a physical opening window as a blind. */
export function isComfortKind(value: unknown): value is ComfortKind {
  return typeof value === 'string' && COMFORT_KINDS.some((kind) => kind === value);
}

/** Expose the small audited field list for local snapshot projection, never the full device object. */
export function conciergeValueFields(kind: ComfortKind): readonly (keyof ConciergeValues)[] {
  return FIELDS_BY_KIND[kind];
}

/**
 * Validate a nonempty value patch. Provider schemas require every property, so null means omitted.
 * Request observations use the same bounds; supplying a kind additionally rejects unrelated fields.
 */
export function parseConciergeValues(input: unknown, kind?: ComfortKind): ConciergeValues | null {
  if (kind !== undefined && !isComfortKind(kind)) return null;
  if (!record(input) || Object.keys(input).some((field) => !(VALUE_FIELDS as readonly string[]).includes(field))) return null;
  const result: ConciergeValues = {};
  for (const field of VALUE_FIELDS) {
    const value = input[field];
    if (value === null || value === undefined) continue;
    if (kind && !FIELDS_BY_KIND[kind].includes(field)) return null;
    if (field === 'isOn') {
      if (typeof value !== 'boolean') return null;
      result.isOn = value;
    } else {
      const [min, max, step] = RANGES[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)
        || value < min || value > max || (value - min) % step !== 0) return null;
      result[field] = value;
    }
  }
  return Object.keys(result).length ? result : null;
}

/** Validate the bounded client envelope; the server must still resolve every ID through caller RLS. */
export function parseConciergeRequest(input: unknown): ConciergeRequest | null {
  if (!record(input) || !exactKeys(input, ['homeId', 'question', 'context']) || !identifier(input.homeId)
    || !prose(input.question, MAX_CONCIERGE_QUESTION_LENGTH) || !record(input.context)) return null;
  const context = input.context;
  if (!exactKeys(context, ['mode', 'capturedAt', 'devices']) || context.mode !== 'simulation'
    || typeof context.capturedAt !== 'number' || !Number.isSafeInteger(context.capturedAt) || context.capturedAt <= 0
    || !Array.isArray(context.devices) || !context.devices.length || context.devices.length > MAX_CONCIERGE_DEVICES) return null;
  const devices: ConciergeContext['devices'] = [];
  const ids = new Set<string>();
  for (const device of context.devices) {
    if (!record(device) || !exactKeys(device, ['id', 'values']) || !identifier(device.id) || ids.has(device.id)) return null;
    const values = parseConciergeValues(device.values);
    if (!values) return null;
    ids.add(device.id);
    devices.push({ id: device.id, values });
  }
  return { homeId: input.homeId, question: input.question.trim(), context: { mode: 'simulation', capturedAt: context.capturedAt, devices } };
}

/** Validate model prose and every proposal against the current, independently authorized directory. */
export function parseConciergeResponse(input: unknown, devices: readonly ConciergeDevice[], canDraft: boolean): ConciergeResponse | null {
  if (!record(input) || !exactKeys(input, ['title', 'answer', 'deviceIds', 'scene'])
    || !prose(input.title, 80) || !prose(input.answer, 1200) || !Array.isArray(input.deviceIds)
    || input.deviceIds.length > MAX_CONCIERGE_DEVICES || devices.length > MAX_CONCIERGE_DEVICES) return null;
  const directory = new Map<string, ConciergeDevice>();
  for (const device of devices) {
    if (!record(device) || !identifier(device.id) || !isComfortKind(device.kind) || typeof device.controllable !== 'boolean' || directory.has(device.id)) return null;
    directory.set(device.id, device);
  }
  const references = new Set<string>();
  for (const id of input.deviceIds) {
    if (!identifier(id) || references.has(id) || !directory.has(id)) return null;
    references.add(id);
  }
  let scene: ConciergeScene | null = null;
  if (input.scene !== null) {
    const draft = input.scene;
    if (!canDraft || !record(draft) || !exactKeys(draft, ['name', 'explanation', 'actions'])
      || !prose(draft.name, 80) || !prose(draft.explanation, 360) || !Array.isArray(draft.actions)
      || !draft.actions.length || draft.actions.length > MAX_CONCIERGE_ACTIONS) return null;
    const seen = new Set<string>();
    const actions: ConciergeScene['actions'] = [];
    for (const action of draft.actions) {
      if (!record(action) || !exactKeys(action, ['deviceId', 'values']) || !identifier(action.deviceId) || seen.has(action.deviceId)) return null;
      const device = directory.get(action.deviceId);
      if (!device?.controllable || !references.has(action.deviceId)) return null;
      const values = parseConciergeValues(action.values, device.kind);
      if (!values) return null;
      seen.add(action.deviceId);
      actions.push({ deviceId: action.deviceId, values });
    }
    scene = { name: draft.name.trim(), explanation: draft.explanation.trim(), actions };
  }
  return { title: input.title.trim(), answer: input.answer.trim(), deviceIds: [...references], scene };
}

/**
 * Provider-only strict Structured Outputs schema. Every field is required; null values are omitted
 * by parseConciergeValues. Local validation additionally enforces exact device kinds and authority.
 */
export const CONCIERGE_RESPONSE_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'answer', 'deviceIds', 'scene'],
  properties: {
    title: { type: 'string', maxLength: 80 }, answer: { type: 'string', maxLength: 1200 },
    deviceIds: { type: 'array', maxItems: MAX_CONCIERGE_DEVICES, items: { type: 'string' } },
    scene: { anyOf: [{ type: 'null' }, {
      type: 'object', additionalProperties: false, required: ['name', 'explanation', 'actions'], properties: {
        name: { type: 'string', maxLength: 80 }, explanation: { type: 'string', maxLength: 360 },
        actions: { type: 'array', minItems: 1, maxItems: MAX_CONCIERGE_ACTIONS, items: {
          type: 'object', additionalProperties: false, required: ['deviceId', 'values'], properties: {
            deviceId: { type: 'string' }, values: {
              type: 'object', additionalProperties: false, required: VALUE_FIELDS, properties: {
                isOn: { type: ['boolean', 'null'] }, brightness: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
                tempC: { type: ['integer', 'null'], minimum: 15, maximum: 28 }, openPercent: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
                volume: { type: ['integer', 'null'], minimum: 0, maximum: 100 }, colorTempK: { type: ['integer', 'null'], minimum: 2000, maximum: 6500, multipleOf: 100 },
              },
            },
          },
        } },
      },
    }] },
  },
} as const;
