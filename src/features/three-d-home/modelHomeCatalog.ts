import { DEVICES, ROOMS, getDevice, isPositionDevice, type DeviceDefinition } from '../../../packages/home-scene/src/data';
import { getCapabilities, isMonitor, readDeviceSetting, validateSetting } from '../../../packages/home-scene/src/deviceCapabilities';
import type { DeviceState, SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { projectGasDevice } from '../gas/gasDemoDevices';
import type { AutomationFlow, AutomationRule, Device, DeviceKind, FlowAction, FlowCondition, FlowTrigger, HomeState, Room, RoomMembership, Scene } from '../../store/useHomeStore';

export const MODEL_CATALOG_VERSION = 1;

/** Inert recovery records are kept outside every active device and routine collection. */
export type ModelCatalogArchive = Pick<HomeState, 'rooms' | 'devices' | 'scenes' | 'rules' | 'flows' | 'roomMembers'>;

/** Explicit aliases preserve the existing 24 verified preview correspondences; names never bind devices. */
export const LEGACY_MODEL_DEVICE_ALIASES = [
  { demoId: "d2", sceneId: "living-light", kind: "light" },
  // The original demo's drawing-room TV represents the furnished family-room TV.
  { demoId: "d3", sceneId: "family-tv", kind: "tv" },
  { demoId: "d5", sceneId: "master-bedside-left", kind: "light" },
  { demoId: "d6", sceneId: "master-ac", kind: "ac" },
  { demoId: "d8", sceneId: "kitchen-light", kind: "light" },
  { demoId: "d9", sceneId: "kitchen-coffee", kind: "coffee" },
  { demoId: "d11", sceneId: "kitchen-fridge", kind: "fridge" },
  { demoId: "d13", sceneId: "entry-door", kind: "door" },
  { demoId: "d15", sceneId: "entry-camera", kind: "camera" },
  { demoId: "d17", sceneId: "kitchen-stove", kind: "stove" },
  { demoId: "d18", sceneId: "laundry-washer", kind: "washer" },
  { demoId: "d18b", sceneId: "kitchen-dishwasher", kind: "dishwasher" },
  { demoId: "d19", sceneId: "kitchen-microwave", kind: "microwave" },
  { demoId: "d20", sceneId: "utility-energy", kind: "energy" },
  { demoId: "d21", sceneId: "utility-water", kind: "water" },
  { demoId: "d23", sceneId: "grounds-sprinkler", kind: "sprinkler" },
  { demoId: "d24", sceneId: "living-speaker", kind: "speaker" },
  { demoId: "d25", sceneId: "master-smoke", kind: "smoke" },
  { demoId: "d26", sceneId: "entry-gate", kind: "gate" },
  { demoId: "d27", sceneId: "utility-water-heater", kind: "water-heater" },
  { demoId: "d34", sceneId: "grounds-light", kind: "light" },
  { demoId: "d39", sceneId: "terrace-camera", kind: "camera" },
  { demoId: "d40", sceneId: "utility-gas-meter", kind: "gas-meter" },
  { demoId: "d41", sceneId: "kitchen-gas-leak", kind: "gas-leak" },
] as const satisfies readonly { demoId: string; sceneId: string; kind: DeviceKind }[];

export const LEGACY_MODEL_ROOM_ALIASES: Readonly<Record<string, string>> = {
  r1: 'living', r2: 'master', r3: 'kitchen', r5: 'bedroom-5', r6: 'grounds',
};
const legacyRoomIds = new Set(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
const legacyDeviceIds = new Set([...Array.from({ length: 41 }, (_, index) => `d${index + 1}`), 'd18b']);
const legacySceneIds = new Set(Array.from({ length: 19 }, (_, index) => `s${index + 1}`));
const modelRoomIds = new Set(ROOMS.map((room) => room.id));
const legacyByTarget = new Map(LEGACY_MODEL_DEVICE_ALIASES.map((alias) => [alias.sceneId as string, alias]));

// Only typed control fields can become host properties; identity, URLs and account observations are excluded.
export const HOST_CONTROL_FIELDS = [
  "tempC", "mode", "brightness", "speed", "volume", "muted", "openPercent",
  "armed", "recording", "nightVision", "motionAlerts", "motionSensitivity",
  "micMuted", "twoWayAudio", "burnerLevel", "stoveMode", "stoveTimerMin",
  "stoveLock", "cycle", "washTemp", "spinSpeedRpm", "soilLevel", "loadSize",
  "rinseCount", "prewash", "steamWash", "sanitizeWash", "smartDispense",
  "extraSpin", "ecoWash", "timeRemainingSec", "microwavePower", "microwaveMode",
  "energyBudgetKwh", "gridOutageAlerts", "waterLeakAlerts", "waterAutoShutoff",
  "waterBudgetL", "waterPressureLowPsi", "waterPressureHighPsi", "waterPressureAlerts",
  "durationMin", "zone", "speakerSource", "speakerPreset", "bass", "treble",
  "spatialAudio", "partyMode", "nightMode", "voiceAssistantEnabled", "micEnabled",
  "shuffle", "repeat", "heaterMode", "recirculation", "antiLegionella",
  "heaterScheduleEnabled", "vacationDays", "coffeeStrength", "coffeeSizeOz",
  "color", "colorTempK", "lightEffect", "adaptiveLighting", "motionBoost", "nightShift", "autoOffMin",
  "autoOpenEnabled", "channel", "source", "fanOscillation", "fanDirection", "fanTimerMin", "fanAutoMode", "fanLightOn", "fanSleepMode",
  "vacuumSuction", "vacuumMode", "vacuumMop", "vacuumQuietMode", "heatLevel", "drynessLevel", "sensorDry", "wrinkleGuard",
  "steamRefresh", "ecoDry", "airFluff", "coolDown", "antiStatic", "freezerTempC", "fridgeMode", "fridgeDoorAlarm", "fridgeIceMaker",
  "fridgeQuickCool", "fridgeQuickFreeze", "fridgeEnergySaver", "fridgeHumidity",
  "acFanSpeed", "acSwingMode", "acEcoMode", "acTurboMode", "acQuietMode", "acTargetHumidity",
  "coffeeCupCount", "coffeeTempC", "coffeeKeepWarmMin", "coffeeGrinder", "coffeeMilkFrother", "coffeeAutoBrewTime",
  "waterHeaterType", "airAlertAqi", "airAlertCo2", "airAlertPm25", "airAlertPm10", "airAlertVoc", "airAlertPollen",
] as const satisfies readonly (keyof Device)[];
const HOST_SAMPLE_FIELDS = [
  'powerW', 'energyTodayKwh', 'energyPeakW', 'energyMonthKwh', 'energyCostToday', 'gridAvailable',
  'solarW', 'solarTodayKwh', 'gridTodayKwh', 'waterLpm', 'waterTodayL', 'waterPressurePsi', 'waterTempC', 'waterLeakDetected',
  'battery', 'status', 'vacuumBinFull', 'vacuumBrushDirty', 'vacuumFilterLife', 'vacuumAreaM2', 'vacuumRuntimeMin',
  'progress', 'remainingMin', 'lintFilterOk', 'fridgeDoorOpen', 'fridgeFilterLife', 'airQualityIndex', 'humidity',
  'airPm25', 'airPm10', 'airCo2', 'airVoc', 'airFormaldehyde', 'airPollen', 'airQualityConfidence',
  'airOutdoorAqi', 'airOutdoorPm25', 'airOutdoorCo2', 'airOutdoorVoc', 'airOutdoorHumidity', 'airOutdoorTempC',
  'airFilterLife', 'airFilterDaysLeft', 'acFilterLife', 'coffeeWaterLevel', 'coffeeBeanLevel', 'coffeeDescaleNeeded',
  'smokeDetected', 'coDetected', 'coPpm', 'smokePpm', 'smokeBattery', 'smokeSensorStatus', 'smokeSilenced',
] as const satisfies readonly (keyof Device)[];
const hostFields = new Set<string>([...HOST_CONTROL_FIELDS, ...HOST_SAMPLE_FIELDS]);

/** Test both identity and kind so a custom record cannot claim a modeled target by name. */
export function isModeledDevice(device: Pick<Device, 'id' | 'kind'>): boolean {
  return getDevice(device.id)?.kind === device.kind;
}

/** Recognize rooms by manifest identity without the scene's unknown-room fallback. */
export function isModeledRoom(room: Pick<Room, 'id'>): boolean {
  return modelRoomIds.has(room.id);
}

/** Archived and retained metadata must not reintroduce reusable private camera URLs. */
function withoutCameraUrls(device: Device): Device {
  const { streamUrl, thumbnailUrl, lastThumbnailUrl, ...safe } = device;
  return safe;
}

/** Scenes, including archived ones, follow the same camera credential boundary as devices. */
function withoutSceneCameraUrls(scene: Scene): Scene {
  return { ...scene, actions: scene.actions.map((action) => {
    if (action.type !== 'patch') return action;
    const { streamUrl, thumbnailUrl, lastThumbnailUrl, ...patch } = action.patch;
    return { ...action, patch };
  }) };
}

/** Preserve non-transport metadata, then take every supported control from the validated scene snapshot. */
function modeledDevice(definition: DeviceDefinition, state: DeviceState, previous?: Device): Device {
  let device: Device = {
    ...(previous ? withoutCameraUrls(previous) : {}),
    id: definition.id, name: definition.name, roomId: definition.roomId, kind: definition.kind,
    isOn: isMonitor(definition.kind) ? true : definition.kind === 'camera' ? previous?.isOn ?? true : state.on,
  };
  for (const capability of getCapabilities(definition.kind)) {
    if (!('field' in capability) || !hostFields.has(capability.field)) continue;
    const reading = readDeviceSetting(definition, state, capability.field);
    const value = capability.type === 'stat' ? reading : validateSetting(capability, reading);
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) continue;
    device = { ...device, [capability.field]: value };
  }
  if (isPositionDevice(definition)) device = { ...device, openPercent: state.level, isOn: state.level > 0 };
  if (definition.kind === 'light') device = { ...device, brightness: state.level, lightEffect: readDeviceSetting(definition, state, 'lightEffect') === 'none' ? undefined : device.lightEffect };
  if (definition.kind === 'camera') device = { ...device, armed: state.on };
  return projectGasDevice(device, state);
}

/** Refresh modeled controls after an authored scene, leaving unmodeled records and camera power intact. */
export function projectModelSnapshot(devices: readonly Device[], snapshot: SimulationSnapshot): Device[] {
  return devices.map((device) => {
    const definition = getDevice(device.id);
    const state = snapshot.deviceStates[device.id];
    return definition?.kind === device.kind && state ? modeledDevice(definition, state, device) : device;
  });
}

/** A first migration needs the complete pre-model catalog available for recovery, without duplicates. */
function appendUnique<T>(existing: readonly T[], added: readonly T[], key: (record: T) => string): T[] {
  const records = new Map(existing.map((record) => [key(record), record]));
  for (const record of added) if (!records.has(key(record))) records.set(key(record), record);
  return [...records.values()];
}

/** Project one already-validated reference while leaving the command, order, and other fields intact. */
function mapRoutinePart<T extends FlowTrigger | FlowCondition | FlowAction>(
  part: T, deviceId: (id: string) => string | undefined, sceneIds: ReadonlySet<string>, memberIds: ReadonlySet<string>,
): T | undefined {
  if ('deviceId' in part) {
    const id = deviceId(part.deviceId);
    return id ? { ...part, deviceId: id } : undefined;
  }
  if ('sceneId' in part && !sceneIds.has(part.sceneId)) return undefined;
  if ('memberId' in part && !memberIds.has(part.memberId)) return undefined;
  return part;
}

/** Keep an unavailable old routine inert; never run only its surviving subset of steps. */
function mapRoutineFlow(flow: AutomationFlow, deviceId: (id: string) => string | undefined,
  sceneIds: ReadonlySet<string>, memberIds: ReadonlySet<string>): AutomationFlow | undefined {
  const triggers = flow.triggers.map((part) => mapRoutinePart(part, deviceId, sceneIds, memberIds));
  const conditions = flow.conditions.map((part) => mapRoutinePart(part, deviceId, sceneIds, memberIds));
  const actions = flow.actions.map((part) => mapRoutinePart(part, deviceId, sceneIds, memberIds));
  if (triggers.some((part) => !part) || conditions.some((part) => !part) || actions.some((part) => !part)) return undefined;
  return { ...flow, triggers: triggers as FlowTrigger[], conditions: conditions as FlowCondition[], actions: actions as FlowAction[] };
}

/**
 * Upgrade only an offline local demonstration to the manifest's 20 rooms and 92 devices.
 * The caller hydrates scene preferences first; that snapshot is authoritative for modeled controls.
 * Unmatched legacy records remain in an inert archive; genuinely custom records stay active.
 */
export function upgradeModelHomeCatalog(state: HomeState, snapshot: SimulationSnapshot): Partial<HomeState> {
  if (state.accountUserId || state.authenticatedUserId || state.accountHomeId || state.activeHomeId
    || state.realtime.enabled || state.realtime.useMqtt) return {};
  const migrating = state.modelCatalogVersion !== MODEL_CATALOG_VERSION;
  const previousById = new Map(state.devices.map((device) => [device.id, device]));
  const legacyBindings = new Map(LEGACY_MODEL_DEVICE_ALIASES.flatMap((alias) =>
    previousById.get(alias.demoId)?.kind === alias.kind ? [[alias.demoId as string, alias.sceneId as string] as const] : []));
  const customDevices = state.devices.filter((device) => !getDevice(device.id) && (!migrating || !legacyDeviceIds.has(device.id)));
  const customRoomIds = new Set(customDevices.map((device) => device.roomId));
  const extraRooms = state.rooms.filter((room) => !isModeledRoom(room)
    && (!migrating || !legacyRoomIds.has(room.id) || (!LEGACY_MODEL_ROOM_ALIASES[room.id] && customRoomIds.has(room.id))));
  const canonicalRooms: Room[] = ROOMS.map(({ id, name }) => ({ id, name }));
  const roomCatalog = new Map([...canonicalRooms, ...extraRooms].map((room) => [room.id, room]));
  // A later refresh keeps the user's room ordering, while appending newly modeled rooms.
  const rooms = migrating ? [...canonicalRooms, ...extraRooms] : appendUnique(
    state.rooms.flatMap((room) => roomCatalog.has(room.id) ? [roomCatalog.get(room.id)!] : []),
    [...canonicalRooms, ...extraRooms], (room) => room.id,
  );
  const activeRoomIds = new Set(rooms.map((room) => room.id));
  // Old room aliases are a one-time migration and never a permanent account lookup.
  const resolveRoom = (id: string): string | undefined => activeRoomIds.has(id) ? id : migrating ? LEGACY_MODEL_ROOM_ALIASES[id] : undefined;
  const devices: Device[] = DEVICES.map((definition) => {
    const old = previousById.get(definition.id) ?? (migrating ? previousById.get(legacyByTarget.get(definition.id)?.demoId ?? '') : undefined);
    const deviceState = snapshot.deviceStates[definition.id] ?? { on: definition.defaultOn, level: definition.defaultLevel };
    return modeledDevice(definition, deviceState, old?.kind === definition.kind ? old : undefined);
  });
  const archivedDevices: Device[] = state.devices.filter((device) => migrating && (legacyDeviceIds.has(device.id)
    ? !legacyBindings.has(device.id) : getDevice(device.id) && !isModeledDevice(device)));
  for (const custom of customDevices) {
    const roomId = resolveRoom(custom.roomId);
    if (roomId) devices.push({ ...withoutCameraUrls(custom), roomId });
    else archivedDevices.push(custom);
  }
  const activeDeviceIds = new Set(devices.map((device) => device.id));
  const byId = new Map(devices.map((device) => [device.id, device]));
  // Device aliases require a matching legacy kind; similar names never establish identity.
  const resolveDevice = (id: string): string | undefined => activeDeviceIds.has(id) ? id : migrating ? legacyBindings.get(id) : undefined;
  const scenes: Scene[] = [];
  const archivedScenes: Scene[] = [];
  for (const originalScene of state.scenes) {
    const scene = withoutSceneCameraUrls(originalScene);
    const roomId = resolveRoom(scene.roomId);
    const actions = scene.actions.map((action) => {
      const id = resolveDevice(action.deviceId);
      return id ? { ...action, deviceId: id } : undefined;
    });
    const invalid = actions.some((action) => !action);
    const spansRooms = actions.some((action) => action && byId.get(action.deviceId)?.roomId !== roomId);
    const promoteHome = migrating && legacySceneIds.has(scene.id) && spansRooms;
    if (invalid || (!roomId && scene.scope !== 'home' && !promoteHome)
      || (spansRooms && scene.scope !== 'home' && !promoteHome)) {
      archivedScenes.push(scene);
      continue;
    }
    scenes.push({ ...scene, roomId: roomId ?? '', ...(promoteHome ? { scope: 'home' as const } : {}), actions: actions as Scene['actions'] });
  }
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const rules: AutomationRule[] = [];
  const archivedRules: AutomationRule[] = [];
  for (const rule of state.rules) {
    const id = resolveDevice(rule.action.deviceId);
    if (id) rules.push({ ...rule, action: { ...rule.action, deviceId: id } });
    else archivedRules.push(rule);
  }
  const memberIds = new Set(state.household.map((member) => member.id));
  const flows: AutomationFlow[] = [];
  const archivedFlows: AutomationFlow[] = [];
  for (const flow of state.flows) {
    const mapped = mapRoutineFlow(flow, resolveDevice, sceneIds, memberIds);
    if (mapped) flows.push(mapped);
    else archivedFlows.push(flow);
  }
  const archivedMemberships: RoomMembership[] = [];
  const roomMembers = state.roomMembers.map((membership) => {
    const ids = membership.roomIds.map(resolveRoom);
    if (ids.some((id) => !id)) archivedMemberships.push(membership);
    return { ...membership, roomIds: [...new Set(ids.filter((id): id is string => !!id))] };
  });
  const archivedRooms = state.rooms.filter((room) => migrating && legacyRoomIds.has(room.id) && !resolveRoom(room.id));
  const previousArchive = state.modelCatalogArchive;
  const modelCatalogArchive: ModelCatalogArchive = {
    rooms: appendUnique(previousArchive?.rooms ?? [], archivedRooms, (room) => room.id),
    devices: appendUnique(previousArchive?.devices ?? [], archivedDevices, (device) => device.id).map(withoutCameraUrls),
    scenes: appendUnique(previousArchive?.scenes ?? [], archivedScenes, (scene) => scene.id).map(withoutSceneCameraUrls),
    rules: appendUnique(previousArchive?.rules ?? [], archivedRules, (rule) => rule.id),
    flows: appendUnique(previousArchive?.flows ?? [], archivedFlows, (flow) => flow.id),
    roomMembers: appendUnique(previousArchive?.roomMembers ?? [], archivedMemberships, (membership) => membership.memberId),
  };
  return {
    modelCatalogVersion: MODEL_CATALOG_VERSION, modelCatalogArchive, rooms, devices, scenes, rules, flows, roomMembers,
    activeSceneId: state.activeSceneId && sceneIds.has(state.activeSceneId) ? state.activeSceneId : null,
    lastSceneRun: state.lastSceneRun && sceneIds.has(state.lastSceneRun.sceneId) ? state.lastSceneRun : null,
  };
}
