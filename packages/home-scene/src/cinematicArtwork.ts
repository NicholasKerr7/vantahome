import type { DeviceKind } from './deviceCapabilities';

/** Generated, bundled reference artwork keys shared by native and embedded cards. */
export const ARTWORK_KEYS = [
  "room-living",
  "room-kitchen",
  "room-bedroom",
  "room-bathroom",
  "room-family",
  "room-laundry",
  "room-gym",
  "room-grounds",
  "room-utility",
  "mood-morning",
  "mood-night",
  "mood-movie",
  "mood-away",
  "device-light",
  "device-lamp",
  "device-fan",
  "device-tv",
  "device-washer",
  "device-ac",
  "device-blinds",
  "device-gate",
  "device-smoke",
  "device-air",
  "device-speaker",
  "device-vacuum",
  "device-door",
  "device-fridge",
  "device-stove",
  "device-coffee",
  "device-microwave",
  "device-dishwasher",
  "device-window",
  "device-dryer",
  "device-generator",
  "device-battery",
  "device-energy",
  "device-solar",
  "device-water",
  "device-water-heater",
  "device-garage",
  "device-camera",
  "device-sprinkler",
  "device-gas-meter",
  "device-gas-leak",
  "device-street-light",
  "device-ventilation",
  "device-generic"
] as const;
export type ArtworkKey = typeof ARTWORK_KEYS[number];

type RoomReference = { id?: string; name?: string; modelRoomId?: string | null };
type DeviceReference = { kind: string; id?: string; name?: string; modelDeviceId?: string | null };
type SceneReference = { name: string; modelPreset?: string | null };
type RoutineReference = { name: string; when?: string; then?: string; schedule?: boolean };

const DEVICE_ARTWORK: Record<DeviceKind, ArtworkKey> = {
  'light': 'device-light',
  'fan': 'device-fan',
  'tv': 'device-tv',
  'washer': 'device-washer',
  'ac': 'device-ac',
  'blinds': 'device-blinds',
  'gate': 'device-gate',
  'smoke': 'device-smoke',
  'air': 'device-air',
  'speaker': 'device-speaker',
  'vacuum': 'device-vacuum',
  'door': 'device-door',
  'fridge': 'device-fridge',
  'stove': 'device-stove',
  'coffee': 'device-coffee',
  'microwave': 'device-microwave',
  'dishwasher': 'device-dishwasher',
  'window': 'device-window',
  'dryer': 'device-dryer',
  'generator': 'device-generator',
  'battery': 'device-battery',
  'energy': 'device-energy',
  'solar': 'device-solar',
  'water': 'device-water',
  'water-heater': 'device-water-heater',
  'garage': 'device-garage',
  'camera': 'device-camera',
  'sprinkler': 'device-sprinkler',
  'gas-meter': 'device-gas-meter',
  'gas-leak': 'device-gas-leak',
};
const PRESET_ARTWORK: Record<string, ArtworkKey> = { morning: 'mood-morning', movie: 'mood-movie', night: 'mood-night', away: 'mood-away' };
const ROOM_ARTWORK: Record<string, ArtworkKey> = {
  living: 'room-living', kitchen: 'room-kitchen', laundry: 'room-laundry',
  master: 'room-bedroom', family: 'room-family', gym: 'room-gym',
  grounds: 'room-grounds', utility: 'room-utility',
};

/** Bound classification to visible identity strings; it never reads permissions or device state. */
function normalized(value: string | undefined | null): string {
  return (value ?? '').toLowerCase().replace(/[-_]/g, ' ').trim();
}

/** Accept only registry entries, never inherited object properties from external identity strings. */
function registeredArtwork(registry: Partial<Record<string, ArtworkKey>>, key: string): ArtworkKey | undefined {
  return Object.prototype.hasOwnProperty.call(registry, key) ? registry[key] : undefined;
}

/** Prefer a canonical model binding, then classify custom room names with a safe generic fallback. */
export function roomArtwork(room: RoomReference): ArtworkKey {
  const id = room.modelRoomId || room.id || '';
  const registeredRoom = registeredArtwork(ROOM_ARTWORK, id);
  if (registeredRoom) return registeredRoom;
  if (/^bedroom-/.test(id)) return 'room-bedroom';
  if (/^bath-/.test(id)) return 'room-bathroom';
  const name = normalized(room.name);
  if (/bath|spa\b|washroom|powder/.test(name)) return 'room-bathroom';
  if (/bed|suite|guest/.test(name)) return 'room-bedroom';
  if (/kitchen|dining|pantry/.test(name)) return 'room-kitchen';
  if (/laundry/.test(name)) return 'room-laundry';
  if (/gym|exercise|fitness/.test(name)) return 'room-gym';
  if (/utility|energy|service|pavilion/.test(name)) return 'room-utility';
  if (/ground|entry|garden|outdoor|drive|garage/.test(name)) return 'room-grounds';
  if (/family|cinema|media/.test(name)) return 'room-family';
  return 'room-living';
}

/** Resolve hardware independently of on/off state, with explicit fixture variants where known. */
export function deviceArtwork(device: DeviceReference): ArtworkKey {
  const identity = normalized(device.modelDeviceId || device.id) + ' ' + normalized(device.name);
  if (device.kind === 'light') {
    if (/street|solar.*light/.test(identity)) return 'device-street-light';
    if (/bedside|lamp/.test(identity)) return 'device-lamp';
  }
  if (device.kind === 'fan' && /bath|ventilation|extractor/.test(identity)) return 'device-ventilation';
  return registeredArtwork(DEVICE_ARTWORK, device.kind) ?? 'device-generic';
}

/** Use only public scene identity so custom scenes match in native and the restricted frame. */
export function sceneArtwork(scene: SceneReference): ArtworkKey {
  const preset = normalized(scene.modelPreset);
  const registeredPreset = registeredArtwork(PRESET_ARTWORK, preset);
  if (registeredPreset) return registeredPreset;
  const name = normalized(scene.name);
  if (/morning|sunrise|wake|dawn/.test(name)) return 'mood-morning';
  if (/movie|cinema|theat|entertain/.test(name)) return 'mood-movie';
  if (/night|sleep|bedtime|rest/.test(name)) return 'mood-night';
  if (/away|leave|vacation|security|all off/.test(name)) return 'mood-away';
  if (/climate|cool|temperature|comfort/.test(name)) return 'device-ac';
  if (/garden|water|irrigat/.test(name)) return 'room-grounds';
  if (/energy|solar|power/.test(name)) return 'room-utility';
  if (/light|bright|day/.test(name)) return 'mood-morning';
  return 'room-living';
}

/** Routine covers describe their visible purpose; imagery never implies enabled or successful execution. */
export function routineArtwork(routine: RoutineReference): ArtworkKey {
  const copy = normalized([routine.name, routine.when, routine.then].filter(Boolean).join(' '));
  if (/gas/.test(copy)) return /meter|usage|consum/.test(copy) ? 'device-gas-meter' : 'device-gas-leak';
  if (/water.*leak|leak.*water|flood/.test(copy)) return 'device-water';
  if (/smoke|fire|alarm/.test(copy)) return 'device-smoke';
  if (/sprinkl|irrigat|water.*garden/.test(copy)) return 'device-sprinkler';
  if (/sunrise|morning|wake|dawn/.test(copy)) return 'mood-morning';
  if (/sunset|night|sleep|bedtime/.test(copy)) return 'mood-night';
  if (/away|leav|arriv|door|gate|lock|secur/.test(copy)) return 'mood-away';
  if (/movie|cinema|tv|speaker|music/.test(copy)) return 'mood-movie';
  if (/climate|temperature|heat|cool|air condition|fan/.test(copy)) return 'device-ac';
  if (/energy|battery|solar|power/.test(copy)) return 'room-utility';
  if (/clean|vacuum/.test(copy)) return 'device-vacuum';
  if (/light|lamp/.test(copy)) return 'device-light';
  return routine.schedule ? 'mood-morning' : 'device-generic';
}
