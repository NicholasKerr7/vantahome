import { DEVICES, ROOMS, isPositionDevice, type DeviceDefinition, type RoomDefinition } from '../../../packages/home-scene/src/data';
import { isMonitor } from '../../../packages/home-scene/src/deviceCapabilities';
import { hasVoicePhrase, normalizeSingleVoiceCommand, normalizeVoiceText, spokenWholeNumber } from './voiceCommandLanguage';

export type HomeVoiceCommand =
  | { type: 'power'; deviceIds: string[]; on: boolean }
  | { type: 'brightness'; deviceIds: string[]; value: number }
  | { type: 'temperature'; deviceIds: string[]; value: number }
  | { type: 'position'; deviceIds: string[]; value: number };
export type HomeVoiceParseResult = { command: HomeVoiceCommand; description: string } | { error: string };
/** Callers can supply only currently permitted definitions; this context never grants command authority. */
export type HomeVoiceContext = {
  devices?: readonly DeviceDefinition[];
  rooms?: readonly Pick<RoomDefinition, 'id' | 'name'>[];
  selectedRoomId?: string | null;
};

const ROOM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  living: ['living room', 'living', 'lounge'], kitchen: ['kitchen and dining', 'kitchen', 'dining', 'dining room'],
  master: ['primary bedroom', 'primary suite', 'master bedroom', 'master suite', 'master'],
  family: ['family room', 'family'], gym: ['exercise room', 'studio', 'gym'],
  'bedroom-1': ['northwest bedroom', 'north west suite', 'north west bedroom'],
  'bedroom-2': ['northeast bedroom', 'north east suite', 'north east bedroom'],
  'bedroom-3': ['southwest bedroom', 'south west suite', 'south west bedroom'],
  'bedroom-4': ['southeast bedroom', 'south east suite', 'south east bedroom'],
  'bedroom-5': ['upper guest bedroom'],
  'bath-5': ['primary bathroom', 'master bathroom'],
  grounds: ['grounds and entry', 'grounds', 'outside', 'outdoor', 'property'],
  utility: ['energy pavilion', 'energy shed', 'utility'],
};
const KIND_ALIASES: Readonly<Record<string, readonly string[]>> = {
  light: ['lights', 'light', 'lamps', 'lamp', 'lighting'], fan: ['fans', 'fan'],
  ac: ['air conditioning', 'air conditioner', 'air conditioners', 'ac', 'thermostat', 'temperature'],
  tv: ['television', 'tv'], blinds: ['blinds', 'window blinds'], gate: ['gate'],
  door: ['door', 'front door'], garage: ['garage', 'roller door'], window: ['window', 'windows'],
  speaker: ['speakers', 'speaker'], sprinkler: ['irrigation', 'sprinkler'],
  washer: ['washer', 'washing machine'], dryer: ['dryer'], vacuum: ['vacuum', 'robot vacuum'],
  fridge: ['fridge', 'refrigerator'], coffee: ['coffee machine', 'espresso machine'],
};
const NOT_FOUND = 'Device not found in your available rooms. Use its room and device name.';
const AMBIGUOUS = 'That name matches more than one device. Include the room, or say “all lights”.';
type RoomMatch = { roomId: string; alias: string };

/** Keep canonical names authoritative and reject aliases that could identify different available rooms. */
function findRoom(target: string, rooms: NonNullable<HomeVoiceContext['rooms']>): RoomMatch | { error: string } | null {
  const matches = rooms.flatMap((room) => {
    const aliases = new Set([room.name, room.id, ...(ROOM_ALIASES[room.id] ?? [])].map(normalizeVoiceText));
    return [...aliases].filter((alias) => hasVoicePhrase(target, alias)).map((alias) => ({ roomId: room.id, alias }));
  }).sort((a, b) => b.alias.length - a.alias.length);
  const best = matches[0];
  if (!best) return null;
  // A short “master” alias inside “master bathroom” is not a second room.
  if (matches.some((match) => match.roomId !== best.roomId
    && (match.alias === best.alias || !hasVoicePhrase(best.alias, match.alias)))) {
    return { error: 'Name one room at a time so I can select the right devices.' };
  }
  return best;
}

/** Remove only a full room prefix/suffix; unexplained words remain and prevent a guessed action. */
function removeRoom(target: string, alias: string): string | null {
  if (target.startsWith(`${alias} `)) return target.slice(alias.length + 1);
  for (const connector of [' in ', ' for ', ' of ', ' ']) {
    if (target.endsWith(`${connector}${alias}`)) return target.slice(0, -connector.length - alias.length);
  }
  return null;
}

/** Exact names and IDs remain available after household additions or renaming. */
function namedDevices(target: string, devices: readonly DeviceDefinition[]): DeviceDefinition[] {
  return devices.filter((device) => [normalizeVoiceText(device.id), normalizeVoiceText(device.name)].includes(target));
}

/** Resolve one complete target against the supplied catalog without expanding a room or permission scope. */
function resolveDevices(target: string, context: HomeVoiceContext): { devices: DeviceDefinition[] } | { error: string } {
  const rooms = context.rooms ?? ROOMS;
  const roomIds = new Set(rooms.map((room) => room.id));
  const catalog = (context.devices ?? DEVICES).filter((device) => roomIds.has(device.roomId));
  const selectedRoomId = rooms.some((room) => room.id === context.selectedRoomId) ? context.selectedRoomId : null;
  const exact = namedDevices(target, catalog);
  if (exact.length === 1) return { devices: exact };
  if (exact.length > 1) {
    const selected = selectedRoomId ? exact.filter((device) => device.roomId === selectedRoomId) : [];
    return selected.length === 1 ? { devices: selected } : { error: AMBIGUOUS };
  }
  // “All ... in the house” is explicit breadth; ordinary “property lights” retains its grounds meaning.
  const wholeHome = /^all .+ (?:in|throughout|across) (?:house|home|entire property)$/.test(target);
  if (wholeHome) target = target.replace(/ (?:in|throughout|across) (?:house|home|entire property)$/, '');
  const here = /(?:^| )(?:here|this room|current room)$/.test(target);
  if (here && !selectedRoomId) return { error: 'Choose a room first, or include its name in the command.' };
  if (here) target = target.replace(/(?: (?:in|for))? (?:here|this room|current room)$/, '');
  const room = findRoom(target, rooms);
  if (room && 'error' in room) return room;
  const withoutRoom = room ? removeRoom(target, room.alias) : target;
  if (withoutRoom === null) return { error: NOT_FOUND };
  const all = /^all\b/.test(withoutRoom);
  const name = withoutRoom.replace(/^all\s+/, '').trim();
  const roomId = room?.roomId ?? (here || !all ? selectedRoomId : null);
  const devicesInScope = roomId ? catalog.filter((device) => device.roomId === roomId) : catalog;
  const named = namedDevices(name, devicesInScope);
  if (named.length === 1) return { devices: named };
  if (named.length > 1) return { error: AMBIGUOUS };
  const kind = Object.entries(KIND_ALIASES).find(([, aliases]) => aliases.includes(name))?.[0];
  const devices = kind ? devicesInScope.filter((device) => device.kind === kind) : [];
  if (!devices.length) return { error: NOT_FOUND };
  if (devices.length > 1 && !roomId && !all) return { error: AMBIGUOUS };
  return { devices };
}

type ParsedIntent = { target: string; type: HomeVoiceCommand['type']; value: number | boolean };

/** Read one imperative; setting units and any room suffix are consumed completely before target lookup. */
function parseIntent(phrase: string): ParsedIntent | { error: string } {
  const leadingPower = phrase.match(/^(?:turn|switch) (on|off) (.+)$/);
  const trailingPower = phrase.match(/^(?:turn|switch) (.+?) (on|off)( (?:in|for) .+| here)?$/);
  if (leadingPower) return { type: 'power', target: leadingPower[2], value: leadingPower[1] === 'on' };
  if (trailingPower) return { type: 'power', target: `${trailingPower[1]}${trailingPower[3] ?? ''}`, value: trailingPower[2] === 'on' };
  const position = phrase.match(/^(open|close) (.+)$/);
  if (position) return { type: 'position', target: position[2], value: position[1] === 'open' ? 100 : 0 };
  const setting = phrase.match(/^(?:set|dim) (.+?) to (.+?)(?:\s*(percent|%|degrees(?: celsius)?|celsius|°c|c))?( (?:in|for) .+)?$/);
  if (!setting) return { error: 'Try “turn on kitchen lights”, “set primary suite lights to 40 percent”, or “open primary suite blinds”.' };
  const value = spokenWholeNumber(setting[2].trim());
  if (value === null) return { error: 'Use a whole number for brightness or temperature.' };
  let target = setting[1].replace(/ brightness$/, '');
  const type = /^(?:degrees|celsius|°c|c)/.test(setting[3] ?? '') || /\b(?:temperature|thermostat|ac|air conditioning|air conditioner)\b/.test(target) ? 'temperature' : 'brightness';
  if (type === 'temperature' && ['percent', '%'].includes(setting[3] ?? '')) return { error: 'Use degrees Celsius for air conditioning.' };
  if (type === 'temperature' && target.endsWith(' temperature')) target = target.replace(/ temperature$/, /(?:ac|air conditioning|air conditioner) temperature$/.test(target) ? '' : ' ac');
  return { target: `${target}${setting[4] ?? ''}`, type, value };
}

/** Parse a bounded command using current property vocabulary; ambiguity never produces a partial action. */
export function parseHomeVoiceCommand(input: string, context: HomeVoiceContext = {}): HomeVoiceParseResult {
  const phrase = normalizeSingleVoiceCommand(input);
  if (!phrase) return { error: 'Use one direct command at a time, without conditions or exceptions.' };
  const intent = parseIntent(phrase);
  if ('error' in intent) return intent;
  const { type, value } = intent;
  const result = resolveDevices(intent.target, context);
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
