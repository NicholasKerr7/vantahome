import { isEmbeddedScene } from './embeddedHost';
import { create } from 'zustand';
import { synchronizeSolarLights, type LightingMode } from './lightingAutomation';
import { getCapabilities, isMonitor, readDeviceSetting, validateSetting, type SettingValue } from './deviceCapabilities';
import { DEVICES, getDevice, getRoom, isPositionDevice, ROOMS, type DeviceId, type FloorId, type PresetId, type RoomId, type ViewId } from './data';

export interface DeviceState { on: boolean; level: number; settings?: Record<string, SettingValue> }
export type DeviceStates = Record<DeviceId, DeviceState>;
type IndoorRoomId = RoomId;

interface IndoorContext {
  roomId: IndoorRoomId;
  selectedDevice: DeviceId | null;
}

export interface HomeSnapshot {
  deviceStates: DeviceStates;
  floor: FloorId;
  roomId: RoomId;
  view: ViewId;
  selectedDevice: DeviceId | null;
  indoorContext: IndoorContext;
  night: boolean;
  lightingMode: LightingMode;
  motionDisabled: boolean;
  activePreset: PresetId | null;
}

interface HomeStore extends HomeSnapshot {
  setRoom: (roomId: RoomId) => void;
  setFloor: (floor: FloorId) => void;
  setView: (view: ViewId) => void;
  selectDevice: (id: string) => void;
  selectHotspotDevice: (id: string) => void;
  toggleDevice: (id: DeviceId) => void;
  setDeviceLevel: (id: DeviceId, level: number) => void;
  setDeviceSetting: (id: DeviceId, field: string, value: SettingValue) => void;
  runDeviceAction: (id: DeviceId, actionId: string) => void;
  setNight: (night: boolean) => void;
  setLightingMode: (mode: LightingMode) => void;
  syncAutomaticLighting: (night: boolean) => void;
  setMotionDisabled: (disabled: boolean) => void;
  activatePreset: (preset: PresetId) => void;
  reset: (localNight?: boolean) => void;
  persistenceError: boolean;
}

export const STORAGE_KEY = 'vantahome-simulation-v2';
export const STORAGE_VERSION = 6;

/** Construct independent defaults so one state update cannot alter another. */
export function createDefaultState(): HomeSnapshot {
  return {
    deviceStates: Object.fromEntries(DEVICES.map((device) => [device.id, isPositionDevice(device)
      ? createPositionState(device.defaultLevel) : { on: device.defaultOn, level: device.defaultLevel }])),
    floor: 'ground', roomId: 'living', view: 'ground', selectedDevice: 'living-light',
    indoorContext: { roomId: 'living', selectedDevice: 'living-light' },
    night: false, lightingMode: 'auto', motionDisabled: false, activePreset: 'morning',
  };
}

/** Keep all scene inputs finite and within the supported percentage range. */
export function clampLevel(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

/** Keep blinds and gates consistent: zero is closed, every positive position is open. */
export function createPositionState(level: number): DeviceState {
  const position = clampLevel(level);
  return { on: position > 0, level: position };
}

/** Narrow parsed data before touching any untrusted persisted properties. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Restore an optional indoor bookmark without allowing exterior or mismatched devices. */
function readIndoorContext(value: unknown, fallbackFloor: FloorId): IndoorContext {
  const fallbackRoom: IndoorRoomId = fallbackFloor === 'upper' ? 'family' : 'living';
  const saved = isRecord(value) ? value : null;
  const room = ROOMS.find((candidate) => candidate.id === saved?.roomId && !candidate.outdoor) ?? getRoom(fallbackRoom);
  const roomId = room.id as IndoorRoomId;
  const selected = typeof saved?.selectedDevice === 'string' ? getDevice(saved.selectedDevice) : undefined;
  const selectedDevice = saved ? selected?.roomId === roomId ? selected.id : null : DEVICES.find((device) => device.roomId === roomId)?.id ?? null;
  return { roomId, selectedDevice };
}

/** Validate a versioned storage envelope and repair invalid fields independently. */
export function parseStoredState(raw: string | null): HomeSnapshot {
  const fallback = createDefaultState();
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || (parsed.version !== STORAGE_VERSION && parsed.version !== 5 && parsed.version !== 4 && parsed.version !== 3 && parsed.version !== 2) || !isRecord(parsed.state)) return fallback;
    const saved = parsed.state;
    const deviceStates = fallback.deviceStates;
    if (isRecord(saved.deviceStates)) {
      for (const device of DEVICES) {
        // Earlier schemas had no gate; migration always adds it in its closed position.
        if (device.id === 'entry-gate' && Number(parsed.version) < 4) continue;
        const candidate = saved.deviceStates[device.id];
        if (!isRecord(candidate)) continue;
        deviceStates[device.id] = {
          on: typeof candidate.on === 'boolean' ? candidate.on : deviceStates[device.id].on,
          level: typeof candidate.level === 'number' && Number.isFinite(candidate.level) ? clampLevel(candidate.level) : deviceStates[device.id].level,
        };
        if (isRecord(candidate.settings)) {
          for (const capability of getCapabilities(device.kind)) {
            if (!('field' in capability)) continue;
            const value = validateSetting(capability, candidate.settings[capability.field]);
            if (value !== undefined) deviceStates[device.id] = applyDeviceSetting(device.id, deviceStates[device.id], capability.field, value);
          }
          // Persist only action-owned statuses and the explicit local sample acknowledgement.
          for (const capability of getCapabilities(device.kind)) {
            if (capability.type !== 'action') continue;
            for (const [field, allowed] of Object.entries(capability.patch)) {
              if (field !== 'isOn' && candidate.settings[field] === allowed) deviceStates[device.id].settings = { ...deviceStates[device.id].settings, [field]: allowed };
            }
          }
          if (isMonitor(device.kind) && candidate.settings.sampleChecked === true) deviceStates[device.id].settings = { ...deviceStates[device.id].settings, sampleChecked: true };
        }
        if (isPositionDevice(device) && !(parsed.version === 2 && device.id === 'master-blinds')) deviceStates[device.id] = createPositionState(deviceStates[device.id].level);
      }
    }
    // Version 2 hid the remembered position whenever power was off; keep its appearance.
    const savedBlinds = deviceStates['master-blinds'];
    deviceStates['master-blinds'] = createPositionState(parsed.version === 2 && !savedBlinds.on ? 0 : savedBlinds.level);
    deviceStates['entry-gate'] = createPositionState(deviceStates['entry-gate'].level);
    const room = typeof saved.roomId === 'string' && ROOMS.some((item) => item.id === saved.roomId) ? getRoom(saved.roomId) : getRoom(fallback.roomId);
    const selected = typeof saved.selectedDevice === 'string' ? getDevice(saved.selectedDevice) : undefined;
    const validSelection = selected?.roomId === room.id ? selected.id : null;
    const indoorContext: IndoorContext = room.outdoor
      ? readIndoorContext(saved.indoorContext, saved.floor === 'upper' ? 'upper' : 'ground')
      : { roomId: room.id, selectedDevice: validSelection };
    const floor = room.outdoor ? getRoom(indoorContext.roomId).floor : room.floor;
    const view: ViewId = saved.view === 'exterior' || saved.view === 'immersive' ? saved.view : room.outdoor ? 'exterior' : room.floor;
    return {
      deviceStates, roomId: room.id, floor, view, selectedDevice: validSelection, indoorContext,
      night: typeof saved.night === 'boolean' ? saved.night : fallback.night,
      lightingMode: saved.lightingMode === 'day' || saved.lightingMode === 'night' ? saved.lightingMode : 'auto',
      motionDisabled: typeof saved.motionDisabled === 'boolean' ? saved.motionDisabled : false,
      activePreset: saved.activePreset === 'morning' || saved.activePreset === 'movie' || saved.activePreset === 'night' || saved.activePreset === 'away' ? saved.activePreset : null,
    };
  } catch { return fallback; }
}

/** Apply the whole preset in one pure transaction, preserving the current camera. */
export function applyPreset(state: HomeSnapshot, preset: PresetId): HomeSnapshot {
  const devices = createDefaultState().deviceStates;
  if (preset === 'movie') {
    devices['living-light'] = { on: true, level: 18 };
    devices['living-fan'] = { on: true, level: 25 };
    devices['family-tv'] = { on: true, level: 45 };
    devices['master-blinds'] = createPositionState(0);
  } else if (preset === 'night' || preset === 'away') {
    for (const device of DEVICES) {
      // Monitoring, refrigeration and backup storage remain available in every scene.
      const staysAvailable = isMonitor(device.kind) || ['fridge', 'battery', 'camera'].includes(device.kind);
      devices[device.id].on = staysAvailable;
      if (device.kind === 'camera') devices[device.id].settings = { armed: true };
      if (isPositionDevice(device)) devices[device.id] = createPositionState(0);
    }
    if (preset === 'night') devices['master-ac'] = { on: true, level: 45 };
  }
  const night = preset === 'night' || preset === 'movie';
  return { ...state, deviceStates: synchronizeSolarLights(devices, night), night, lightingMode: night ? 'night' : 'day', activePreset: preset };
}

/** Read local simulation preferences while allowing blocked browser storage. */
function readInitialState(): HomeSnapshot {
  if (typeof window === 'undefined' || isEmbeddedScene()) return createDefaultState();
  try { return parseStoredState(window.localStorage.getItem(STORAGE_KEY)); }
  catch { return createDefaultState(); }
}

/** Select only serializable preferences, excluding store actions and notices. */
function snapshot(state: HomeSnapshot): HomeSnapshot {
  const { deviceStates, floor, roomId, view, selectedDevice, indoorContext, night, lightingMode, motionDisabled, activePreset } = state;
  return { deviceStates, floor, roomId, view, selectedDevice, indoorContext, night, lightingMode, motionDisabled, activePreset };
}

/** Keep an interior selection and its return bookmark in one coherent update. */
function indoorNavigation(roomId: IndoorRoomId, selectedDevice: DeviceId | null, view: ViewId) {
  return { roomId, floor: getRoom(roomId).floor, selectedDevice, view, indoorContext: { roomId, selectedDevice } };
}

/** Explore any outdoor zone while retaining the exact interior return selection. */
function outdoorNavigation(state: HomeSnapshot, roomId: RoomId = 'grounds', selectedDevice: DeviceId | null = DEVICES.find((device) => device.roomId === roomId)?.id ?? null, view: 'exterior' | 'immersive' = 'exterior') {
  const indoorContext: IndoorContext = getRoom(state.roomId).outdoor
    ? state.indoorContext : { roomId: state.roomId, selectedDevice: state.selectedDevice };
  return { roomId, floor: getRoom(indoorContext.roomId).floor, view, selectedDevice, indoorContext };
}

/** Apply one supported setting, preserving scene level contracts and opening semantics. */
export function applyDeviceSetting(id: DeviceId, current: DeviceState, field: string, input: SettingValue): DeviceState {
  const device = getDevice(id);
  if (!device) return current;
  const capability = getCapabilities(device.kind).find((item) => 'field' in item && item.field === field);
  if (!capability) return current;
  const value = validateSetting(capability, input);
  if (value === undefined) return current;
  if (field === 'openPercent') {
    return { ...current, ...createPositionState(Number(value)) };
  }
  if ((device.kind === 'light' && field === 'brightness') || (device.kind === 'fan' && field === 'speed')) return { ...current, level: clampLevel(Number(value)) };
  if (field === 'isOn') return { ...current, on: Boolean(value) };
  const next = { ...current, settings: { ...current.settings, [field]: value } };
  if (field === 'armed') next.on = Boolean(value);
  if (device.kind === 'ac' && field === 'tempC') next.level = clampLevel((26 - Number(value)) / 0.08);
  return next;
}

/** Resolve a primary action through the device's semantics, never through a fake sensor switch. */
export function toggleDeviceState(id: DeviceId, current: DeviceState): DeviceState {
  const device = getDevice(id);
  if (!device) return current;
  if (isMonitor(device.kind)) return { ...current, on: true, settings: { ...current.settings, sampleChecked: true } };
  if (device.kind === 'camera') return applyDeviceSetting(id, current, 'armed', !readDeviceSetting(device, current, 'armed'));
  if (isPositionDevice(device)) return { ...current, ...createPositionState(current.level > 0 ? 0 : 100) };
  const next = { ...current, on: !current.on };
  if (device.kind === 'vacuum') next.settings = { ...current.settings, status: next.on ? 'cleaning' : 'docked' };
  if (device.kind === 'microwave' && next.on && Number(readDeviceSetting(device, current, 'timeRemainingSec')) === 0) next.settings = { ...current.settings, timeRemainingSec: 60 };
  return next;
}

export const useHomeStore = create<HomeStore>((set) => ({
  ...readInitialState(), persistenceError: false,
  /** Navigate to a room and select its first controllable object when present. */
  setRoom: (roomId) => set((state) => {
    const room = getRoom(roomId);
    if (room.outdoor) return outdoorNavigation(state, room.id);
    const selectedDevice = DEVICES.find((device) => device.roomId === room.id)?.id ?? null;
    return indoorNavigation(room.id, selectedDevice, state.view === 'immersive' ? 'immersive' : room.floor);
  }),
  /** Show the main gathering room on the requested floor. */
  setFloor: (floor) => set(indoorNavigation(floor === 'ground' ? 'living' : 'family', floor === 'ground' ? 'living-light' : 'family-tv', floor)),
  /** Switch between complete exterior, floor cutaway and fixed room perspective. */
  setView: (view) => set((state) => {
    if (view === 'exterior') return outdoorNavigation(state);
    if (view === 'ground' || view === 'upper') {
      if (view === state.floor && !getRoom(state.roomId).outdoor) return { view };
      if (getRoom(state.roomId).outdoor && view === getRoom(state.indoorContext.roomId).floor) {
        return indoorNavigation(state.indoorContext.roomId, state.indoorContext.selectedDevice, view);
      }
      return indoorNavigation(view === 'ground' ? 'living' : 'family', view === 'ground' ? 'living-light' : 'family-tv', view);
    }
    return { view, floor: state.floor };
  }),
  /** Resolve scene picks to an accessible inspector and the device's floor. */
  selectDevice: (id) => set((state) => {
    const device = getDevice(id);
    if (!device) return {};
    const room = getRoom(device.roomId);
    if (room.outdoor) return outdoorNavigation(state, room.id, device.id, getRoom(state.roomId).outdoor && state.view === 'immersive' ? 'immersive' : 'exterior');
    return indoorNavigation(room.id, device.id, state.view === 'immersive' ? 'immersive' : room.floor);
  }),
  /** Synchronize the inspector while retaining exterior or immersive presentation. */
  selectHotspotDevice: (id) => set((state) => {
    const device = getDevice(id);
    if (!device) return {};
    const room = getRoom(device.roomId);
    if (room.outdoor) return outdoorNavigation(state, room.id, device.id, state.view === 'immersive' ? 'immersive' : 'exterior');
    const view = state.view === 'ground' || state.view === 'upper' ? room.floor : state.view;
    return indoorNavigation(room.id, device.id, view);
  }),
  /** Perform a kind-appropriate quick action without altering the selected camera. */
  toggleDevice: (id) => set((state) => getDevice(id) ? {
    deviceStates: { ...state.deviceStates, [id]: toggleDeviceState(id, state.deviceStates[id]) }, activePreset: null,
  } : {}),
  /** Preserve existing percentage-based animation inputs and cover behavior. */
  setDeviceLevel: (id, level) => set((state) => {
    const device = getDevice(id); if (!device) return {};
    const current = state.deviceStates[id];
    const next = isPositionDevice(device) ? { ...current, ...createPositionState(level) } : { ...current, level: clampLevel(level) };
    if (device.kind === 'ac' && next.settings?.tempC !== undefined) next.settings = { ...next.settings, tempC: 26 - Math.round(next.level * 0.08) };
    return { deviceStates: { ...state.deviceStates, [id]: next }, activePreset: null };
  }),
  /** Validate schema-backed controls before applying them to the simulation. */
  setDeviceSetting: (id, field, value) => set((state) => {
    if (!getDevice(id)) return {};
    const next = applyDeviceSetting(id, state.deviceStates[id], field, value);
    return next === state.deviceStates[id] ? {} : { deviceStates: { ...state.deviceStates, [id]: next }, activePreset: null };
  }),
  /** Run only explicitly cataloged action patches; arbitrary input cannot add state. */
  runDeviceAction: (id, actionId) => set((state) => {
    const device = getDevice(id); if (!device) return {};
    const action = getCapabilities(device.kind).find((item) => item.id === actionId);
    if (action?.type !== 'action') return {};
    const next = { ...state.deviceStates[id], settings: { ...state.deviceStates[id].settings } };
    for (const [field, value] of Object.entries(action.patch)) {
      if (field === 'isOn') next.on = Boolean(value); else next.settings[field] = value;
    }
    return { deviceStates: { ...state.deviceStates, [id]: next }, activePreset: null };
  }),
  /** A manual preview also synchronizes the simulated dusk-to-dawn solar poles. */
  setNight: (night) => set((state) => ({ night, lightingMode: night ? 'night' : 'day', deviceStates: synchronizeSolarLights(state.deviceStates, night), activePreset: null })),
  /** Return to the property clock, or select an explicit day/night preview. */
  setLightingMode: (lightingMode) => set((state) => {
    if (lightingMode === 'auto') return { lightingMode, deviceStates: synchronizeSolarLights(state.deviceStates, state.night), activePreset: null };
    const night = lightingMode === 'night';
    return { lightingMode, night, deviceStates: synchronizeSolarLights(state.deviceStates, night), activePreset: null };
  }),
  /** Apply clock transitions only; individual pole overrides last until the next transition. */
  syncAutomaticLighting: (night) => set((state) => {
    if (state.lightingMode !== 'auto') return state;
    const deviceStates = synchronizeSolarLights(state.deviceStates, night);
    if (state.night === night && deviceStates === state.deviceStates) return state;
    return { night, deviceStates };
  }),
  /** Let users reduce motion in addition to the operating-system preference. */
  setMotionDisabled: (motionDisabled) => set({ motionDisabled }),
  /** Batch all device and environmental changes into a single Zustand update. */
  activatePreset: (preset) => set((state) => applyPreset(state, preset)),
  /** Reset the devices and camera while allowing the live clock to retain its current night. */
  reset: (localNight = false) => set(() => {
    const initial = createDefaultState();
    return { ...initial, night: localNight, deviceStates: synchronizeSolarLights(initial.deviceStates, localNight) };
  }),
}));

// Persist only the small, versioned simulation snapshot; storage failures remain visible.
if (typeof window !== 'undefined' && !isEmbeddedScene()) {
  useHomeStore.subscribe((state, previous) => {
    if (state.persistenceError !== previous.persistenceError) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, state: snapshot(state) }));
      if (state.persistenceError) useHomeStore.setState({ persistenceError: false });
    } catch {
      if (!state.persistenceError) useHomeStore.setState({ persistenceError: true });
    }
  });
}
