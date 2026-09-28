import { DEVICES, ROOMS, isPositionDevice, type DeviceDefinition } from '../../../packages/home-scene/src/data';
import { isMonitor } from '../../../packages/home-scene/src/deviceCapabilities';

export type HomeVoiceCommand =
  | { type: 'power'; deviceIds: string[]; on: boolean }
  | { type: 'brightness'; deviceIds: string[]; value: number }
  | { type: 'temperature'; deviceIds: string[]; value: number }
  | { type: 'position'; deviceIds: string[]; value: number };
export type HomeVoiceParseResult = { command: HomeVoiceCommand; description: string } | { error: string };

const ROOM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  living: ['living room', 'living'], kitchen: ['kitchen and dining', 'kitchen', 'dining'],
  master: ['primary bedroom', 'primary suite', 'master bedroom', 'master suite', 'master'],
  family: ['family room', 'family'], gym: ['exercise room', 'studio', 'gym'],
  grounds: ['grounds and entry', 'grounds', 'outside', 'outdoor', 'property'],
  utility: ['energy pavilion', 'energy shed', 'utility'],
};
const KIND_ALIASES: Readonly<Record<string, readonly string[]>> = {
  light: ['lights', 'light', 'lamps', 'lamp', 'lighting'], fan: ['fans', 'fan'],
  ac: ['air conditioning', 'air conditioner', 'ac', 'thermostat', 'temperature'],
  tv: ['television', 'tv'], blinds: ['blinds', 'window blinds'], gate: ['gate'],
  door: ['door', 'front door'], garage: ['garage', 'roller door'], window: ['window'],
  speaker: ['speakers', 'speaker'], sprinkler: ['irrigation', 'sprinkler'],
  washer: ['washer', 'washing machine'], dryer: ['dryer'], vacuum: ['vacuum', 'robot vacuum'],
  fridge: ['fridge', 'refrigerator'], coffee: ['coffee machine', 'espresso machine'],
};

/** Normalize only recognition punctuation and harmless filler, retaining words that disambiguate rooms. */
function normalize(input: string): string {
  return input.toLowerCase().replace(/&/g, ' and ').replace(/[-_]/g, ' ').replace(/[!?]/g, '').replace(/[.,](?=\s|$)/g, '')
    .replace(/\b(?:please|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Match complete phrases, preventing a room called “northeast” from matching a different device by accident. */
function hasPhrase(input: string, phrase: string): boolean {
  return (` ${input} `).includes(` ${phrase} `);
}

/** Resolve a named room before a kind, requiring explicit “all” for unscoped group commands. */
function resolveDevices(target: string): { devices: DeviceDefinition[] } | { error: string } {
  const candidates = ROOMS.flatMap((room) => {
    const aliases = [normalize(room.name), normalize(room.id), ...(ROOM_ALIASES[room.id] ?? [])];
    return aliases.filter((alias) => hasPhrase(target, alias)).map((alias) => ({ roomId: room.id, alias }));
  }).sort((a, b) => b.alias.length - a.alias.length);
  const room = candidates[0];
  const roomDevices = room ? DEVICES.filter((device) => device.roomId === room.roomId) : DEVICES;
  const exact = roomDevices.filter((device) => [normalize(device.id), normalize(device.name)].includes(target));
  if (exact.length === 1) return { devices: exact };
  const remainder = (room ? ` ${target} `.replace(` ${room.alias} `, ' ') : target).trim();
  const all = /^all\b/.test(remainder);
  const name = remainder.replace(/^all\s+/, '');
  const named = roomDevices.filter((device) => normalize(device.name) === name || normalize(device.id) === name);
  if (named.length === 1) return { devices: named };
  const kind = Object.entries(KIND_ALIASES).find(([, aliases]) => aliases.includes(name))?.[0];
  const devices = kind ? roomDevices.filter((device) => device.kind === kind) : named;
  if (!devices.length) return { error: 'Device not found. Use its room and device name from the house.' };
  if (devices.length > 1 && !room && !all) return { error: 'That name matches more than one device. Include the room, or say “all lights”.' };
  return { devices };
}

/** Parse a single bounded command; ambiguous targets and unsupported operations never execute. */
export function parseHomeVoiceCommand(input: string): HomeVoiceParseResult {
  if (input.length > 240) return { error: 'Use one short command at a time.' };
  const phrase = normalize(input);
  let target = ''; let type: HomeVoiceCommand['type']; let value: number | boolean;
  const leadingPower = phrase.match(/^(?:turn|switch) (on|off) (.+)$/);
  const trailingPower = phrase.match(/^(?:turn|switch) (.+) (on|off)$/);
  const power = leadingPower ? { target: leadingPower[2], on: leadingPower[1] === 'on' }
    : trailingPower ? { target: trailingPower[1], on: trailingPower[2] === 'on' } : null;
  const position = phrase.match(/^(open|close) (.+)$/);
  const setting = phrase.match(/^(?:set|dim) (.+?) to (\d+(?:\.\d+)?)\s*(percent|%|degrees(?: celsius)?|celsius|c)?$/);
  if (power) { type = 'power'; target = power.target; value = power.on; }
  else if (position) { type = 'position'; target = position[2]; value = position[1] === 'open' ? 100 : 0; }
  else if (setting) {
    target = setting[1].replace(/ brightness$/, ''); value = Number(setting[2]);
    if (!Number.isInteger(value)) return { error: 'Use a whole number for brightness or temperature.' };
    type = /^(?:degrees|celsius|c)/.test(setting[3] ?? '') || /\b(?:temperature|thermostat|ac|air conditioning|air conditioner)\b/.test(target) ? 'temperature' : 'brightness';
    if (type === 'temperature' && ['percent', '%'].includes(setting[3] ?? '')) return { error: 'Use degrees Celsius for air conditioning.' };
    if (type === 'temperature' && target.endsWith(' temperature')) target = target.replace(/ temperature$/, /(?:ac|air conditioning|air conditioner) temperature$/.test(target) ? '' : ' ac');
  } else return { error: 'Try “turn on kitchen lights”, “set primary suite lights to 40 percent”, or “open primary suite blinds”.' };
  const result = resolveDevices(target);
  if ('error' in result) return result;
  const devices = result.devices;
  if (type === 'power' && devices.some((device) => isMonitor(device.kind) || isPositionDevice(device) || ['camera', 'gas-meter', 'gas-leak', 'battery', 'solar', 'energy'].includes(device.kind))) {
    return { error: 'Use full controls for this device. For doors, gates, and blinds, say “open” or “close”.' };
  }
  if (type === 'brightness' && (devices.some((device) => device.kind !== 'light') || Number(value) < 0 || Number(value) > 100)) return { error: 'Brightness commands need a light and a value from 0 to 100 percent.' };
  if (type === 'temperature' && (devices.some((device) => device.kind !== 'ac') || Number(value) < 18 || Number(value) > 26)) return { error: 'Air conditioning accepts 18 to 26 degrees Celsius.' };
  if (type === 'position' && devices.some((device) => !isPositionDevice(device))) return { error: 'Open and close commands work with blinds, gates, doors, and windows.' };
  const deviceIds = devices.map((device) => device.id);
  const label = devices.length === 1 ? devices[0].name : `${devices.length} devices`;
  if (type === 'power') return { command: { type, deviceIds, on: Boolean(value) }, description: `${label} turned ${value ? 'on' : 'off'}` };
  return { command: { type, deviceIds, value: Number(value) }, description: `${label} ${type === 'position' ? value ? 'opened' : 'closed' : `set to ${value}${type === 'temperature' ? '°C' : '%'}`}` };
}
