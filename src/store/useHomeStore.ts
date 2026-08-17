import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ConnectionStatus } from "../services/deviceClient";
import { applyDeviceStatePatch } from "./deviceState";
import { roleHasPermission } from "../security/permissions";

export const AC_TEMP_MIN_C = 15;
export const AC_TEMP_MAX_C = 28;

export type DeviceMode = "cold" | "fan" | "dry";

export type DeviceKind =
  | "ac"
  | "light"
  | "tv"
  | "coffee"
  | "fridge"
  | "gate"
  | "garage"
  | "fan"
  | "door"
  | "vacuum"
  | "camera"
  | "window"
  | "stove"
  | "washer"
  | "dryer"
  | "dishwasher"
  | "microwave"
  | "energy"
  | "water"
  | "water-heater"
  | "air"
  | "sprinkler"
  | "speaker"
  | "smoke";

export type AirQualitySample = {
  ts: number;
  aqi?: number;
  pm25?: number;
  pm10?: number;
  co2?: number;
  voc?: number;
  formaldehyde?: number;
  pollen?: number;
  humidity?: number;
  tempC?: number;
};

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type SprinklerSchedule = {
  id: string;
  hour: number;
  minute: number;
  days: Weekday[];
  enabled: boolean;
};

export type Device = {
  id: string;
  name: string;
  kind: DeviceKind;
  roomId: string;
  isOn: boolean;
  /** Capability IDs reported by the integration; absent for seeded demo data. */
  reportedCapabilityIds?: string[];

  // Shared controls
  tempC?: number;
  mode?: DeviceMode;
  brightness?: number; // lights
  volume?: number; // tv
  color?: string;
  colorTempK?: number;
  lightEffect?: "focus" | "relax" | "sunset" | "party";
  adaptiveLighting?: boolean;
  motionBoost?: boolean;
  nightShift?: boolean;
  autoOffMin?: number;
  autoOpenEnabled?: boolean;
  channel?: number;
  muted?: boolean;
  source?: string;
  stackId?: string; // washer/dryer pairing
  stackPosition?: "top" | "bottom"; // washer/dryer stacking position

  // Extra per-kind fields
  speed?: number; // fan
  fanOscillation?: boolean; // fan
  fanDirection?: "forward" | "reverse"; // fan
  fanTimerMin?: number; // fan
  fanAutoMode?: boolean; // fan
  fanLightOn?: boolean; // fan
  fanSleepMode?: boolean; // fan
  openPercent?: number; // garage/door/window
  openLastActor?: string; // garage/door/window
  status?: "docked" | "cleaning" | "paused"; // vacuum
  battery?: number; // vacuum/door/garage
  vacuumSuction?: number; // vacuum
  vacuumMode?: "auto" | "spot" | "edge" | "room"; // vacuum
  vacuumMop?: boolean; // vacuum
  vacuumQuietMode?: boolean; // vacuum
  vacuumBinFull?: boolean; // vacuum
  vacuumBrushDirty?: boolean; // vacuum
  vacuumFilterLife?: number; // vacuum
  vacuumAreaM2?: number; // vacuum
  vacuumRuntimeMin?: number; // vacuum
  armed?: boolean; // camera
  recording?: boolean; // camera
  nightVision?: boolean; // camera
  motionAlerts?: boolean; // camera
  motionSensitivity?: number; // camera
  micMuted?: boolean; // camera
  twoWayAudio?: boolean; // camera
  streamUrl?: string; // camera
  thumbnailUrl?: string; // camera
  lastThumbnailUrl?: string; // camera
  lastSeenAt?: number; // camera
  burnerLevel?: number; // stove
  stoveMode?: "simmer" | "boil" | "sear" | "keep-warm"; // stove
  stoveTimerMin?: number; // stove
  stoveLock?: boolean; // stove
  cycle?: string; // washer/dryer
  progress?: number; // washer/dryer
  washTemp?: "Cold" | "Warm" | "Hot"; // washer
  spinSpeedRpm?: number; // washer
  soilLevel?: "Light" | "Normal" | "Heavy"; // washer
  heatLevel?: "Low" | "Med" | "High"; // dryer
  drynessLevel?: "Damp" | "Dry" | "Extra"; // dryer
  remainingMin?: number; // washer/dryer
  loadSize?: "Small" | "Medium" | "Large"; // washer
  rinseCount?: 1 | 2 | 3; // washer
  prewash?: boolean; // washer
  steamWash?: boolean; // washer
  sanitizeWash?: boolean; // washer
  smartDispense?: boolean; // washer
  extraSpin?: boolean; // washer
  ecoWash?: boolean; // washer
  sensorDry?: boolean; // dryer
  wrinkleGuard?: boolean; // dryer
  steamRefresh?: boolean; // dryer
  ecoDry?: boolean; // dryer
  airFluff?: boolean; // dryer
  coolDown?: boolean; // dryer
  lintFilterOk?: boolean; // dryer
  antiStatic?: boolean; // dryer
  timeRemainingSec?: number; // microwave
  microwavePower?: number; // microwave
  microwaveMode?: "Reheat" | "Defrost" | "Grill" | "Popcorn"; // microwave
  freezerTempC?: number; // fridge
  fridgeMode?: "eco" | "normal" | "boost" | "vacation"; // fridge
  fridgeDoorOpen?: boolean; // fridge
  fridgeDoorAlarm?: boolean; // fridge
  fridgeIceMaker?: boolean; // fridge
  fridgeQuickCool?: boolean; // fridge
  fridgeQuickFreeze?: boolean; // fridge
  fridgeEnergySaver?: boolean; // fridge
  fridgeFilterLife?: number; // fridge
  fridgeHumidity?: number; // fridge
  powerW?: number; // energy monitor
  energyTodayKwh?: number; // energy monitor
  energyPeakW?: number; // energy monitor
  energyMonthKwh?: number; // energy monitor
  energyCostToday?: number; // energy monitor
  energyBudgetKwh?: number; // energy monitor
  gridAvailable?: boolean; // energy monitor
  gridOutageAlerts?: boolean; // energy monitor
  solarW?: number; // energy monitor
  solarTodayKwh?: number; // energy monitor
  gridTodayKwh?: number; // energy monitor
  waterLpm?: number; // water meter
  waterTodayL?: number; // water meter
  waterPressurePsi?: number; // water meter
  waterPressureLowPsi?: number; // water meter
  waterPressureHighPsi?: number; // water meter
  waterTempC?: number; // water meter
  waterLeakDetected?: boolean; // water meter
  waterLeakAlerts?: boolean; // water meter
  waterPressureAlerts?: boolean; // water meter
  waterAutoShutoff?: boolean; // water meter
  waterBudgetL?: number; // water meter
  speakerSource?: "AirPlay" | "Bluetooth" | "Spotify" | "AUX" | "TV";
  speakerPreset?: "Flat" | "Warm" | "Bright" | "Bass" | "Vocal";
  bass?: number;
  treble?: number;
  spatialAudio?: boolean;
  partyMode?: boolean;
  nightMode?: boolean;
  micEnabled?: boolean;
  voiceAssistantEnabled?: boolean;
  shuffle?: boolean;
  repeat?: "off" | "all" | "one";
  trackTitle?: string;
  trackArtist?: string;
  trackAlbum?: string;
  trackDurationSec?: number;
  trackProgressSec?: number;
  waterHeaterType?: "electric-tank" | "gas-tank" | "heat-pump" | "tankless";
  heaterMode?: "eco" | "standard" | "boost" | "vacation";
  recirculation?: boolean;
  antiLegionella?: boolean;
  vacationDays?: number;
  heaterScheduleEnabled?: boolean;
  airQualityIndex?: number; // air quality
  humidity?: number; // air quality
  airPm25?: number; // air quality
  airPm10?: number; // air quality
  airCo2?: number; // air quality
  airVoc?: number; // air quality
  airFormaldehyde?: number; // air quality
  airPollen?: number; // air quality
  airQualityConfidence?: number; // air quality
  airOutdoorAqi?: number; // air quality
  airOutdoorPm25?: number; // air quality
  airOutdoorCo2?: number; // air quality
  airOutdoorVoc?: number; // air quality
  airOutdoorHumidity?: number; // air quality
  airOutdoorTempC?: number; // air quality
  airAlertsEnabled?: boolean; // air quality
  airAlertAqi?: number; // air quality
  airAlertCo2?: number; // air quality
  airAlertVoc?: number; // air quality
  airAlertPm25?: number; // air quality
  airAlertPm10?: number; // air quality
  airAlertPollen?: number; // air quality
  airPurifierMode?: "auto" | "manual" | "sleep" | "boost"; // air quality
  airPurifierSpeed?: number; // air quality
  airIonizerEnabled?: boolean; // air quality
  airFilterLife?: number; // air quality
  airFilterDaysLeft?: number; // air quality
  airAutoVentilation?: boolean; // air quality
  airHistory?: AirQualitySample[]; // air quality
  airLastUpdatedAt?: number; // air quality
  airSensorLabel?: string; // air quality
  acFanSpeed?: number; // AC
  acSwingMode?: "off" | "vertical" | "horizontal" | "both"; // AC
  acEcoMode?: boolean; // AC
  acTurboMode?: boolean; // AC
  acQuietMode?: boolean; // AC
  acTargetHumidity?: number; // AC
  acFilterLife?: number; // AC
  coffeeStrength?: "mild" | "normal" | "strong"; // coffee
  coffeeSizeOz?: number; // coffee
  coffeeTempC?: number; // coffee
  coffeeKeepWarmMin?: number; // coffee
  coffeeCupCount?: number; // coffee
  coffeeGrinder?: boolean; // coffee
  coffeeMilkFrother?: boolean; // coffee
  coffeeWaterLevel?: number; // coffee
  coffeeBeanLevel?: number; // coffee
  coffeeDescaleNeeded?: boolean; // coffee
  coffeeAutoBrewTime?: string; // coffee
  coDetected?: boolean; // smoke/CO
  coPpm?: number; // smoke/CO
  smokePpm?: number; // smoke/CO
  smokeBattery?: number; // smoke/CO
  smokeSensorStatus?: "ok" | "warning" | "error"; // smoke/CO
  smokeSilenced?: boolean; // smoke/CO
  smokeLastTestAt?: number; // smoke/CO
  smokeLastAlarmAt?: number; // smoke/CO
  zone?: string; // sprinkler
  durationMin?: number; // sprinkler
  smokeDetected?: boolean; // smoke alarm
  schedule?: SprinklerSchedule[]; // sprinkler
};

export type Room = { id: string; name: string };

export type AmbientReading = {
  tempC: number;
  label: string;
  updatedAt?: number;
  source?: "seed" | "sensor" | "weather" | "estimate";
};

export type HouseholdMember = {
  id: string;
  userId?: string;
  name: string;
  role: "Owner" | "Admin" | "Member" | "Guest" | "Tenant";
  avatarColor?: string;
  avatarUri?: string;
  status: "home" | "away";
  lastSeenAt?: number;
};

export type RoomMembership = {
  memberId: string;
  roomIds: string[];
};

export type MemberPermissionOverride = {
  memberId: string;
  permission: import("../security/permissions").ActionPermission;
  allowed: boolean;
};

const FULL_ACCESS_ROLES: HouseholdMember["role"][] = [
  "Owner",
  "Admin",
  "Member",
];

const roleHasFullAccess = (role?: HouseholdMember["role"]) =>
  !!role && FULL_ACCESS_ROLES.includes(role);

export type SceneAction =
  | { type: "patch"; deviceId: string; patch: Partial<Device> }
  | { type: "toggle"; deviceId: string; on?: boolean };

export type Scene = {
  id: string;
  roomId: string;
  name: string;
  actions: SceneAction[];
};

export type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type: "time"; hour: number; minute: number };
  action:
    | { type: "toggle"; deviceId: string; on: boolean }
    | { type: "set-ac"; deviceId: string; tempC: number; mode: DeviceMode };
};

export type FlowTrigger =
  | { type: "time"; hour: number; minute: number }
  | { type: "device"; deviceId: string; state: "on" | "off" }
  | { type: "scene"; sceneId: string }
  | { type: "presence"; memberId: string; status: HouseholdMember["status"] };

export type FlowCondition =
  | {
      type: "time-range";
      startHour: number;
      startMinute: number;
      endHour: number;
      endMinute: number;
    }
  | { type: "device"; deviceId: string; state: "on" | "off" }
  | { type: "day"; days: Weekday[] };

export type FlowAction =
  | { type: "toggle"; deviceId: string; on: boolean }
  | { type: "set-ac"; deviceId: string; tempC: number; mode: DeviceMode }
  | { type: "set-brightness"; deviceId: string; brightness: number }
  | { type: "run-scene"; sceneId: string }
  | { type: "delay"; seconds: number }
  | { type: "notify"; message: string };

export type AutomationFlow = {
  id: string;
  name: string;
  enabled: boolean;
  triggers: FlowTrigger[];
  conditions: FlowCondition[];
  actions: FlowAction[];
};

export type IntegrationProvider = "alexa" | "google" | "homekit" | "matter";

type IntegrationState = {
  status: "not-linked" | "linking" | "linked" | "error";
  accountName?: string;
  linkedAt?: number;
  lastSyncAt?: number;
  errorReason?: string;
};

type Preferences = {
  haptics: boolean;
  notifications: boolean;
};

type RealtimeSettings = {
  enabled: boolean;
  wsUrl: string;
  useMqtt: boolean;
  mqttStatus?: ConnectionStatus;
  mqttError?: string;
};

type Profile = {
  name: string;
  email?: string;
  phone?: string;
  homeName?: string;
  avatarColor?: string;
  avatarUri?: string;
  timeFormat?: "12h" | "24h";
  tempUnit?: "C" | "F";
  timezone?: string;
};

export type HomeState = {
  userName: string;
  profile: Profile;
  outdoor: AmbientReading;
  indoor: AmbientReading;
  rooms: Room[];
  devices: Device[];
  scenes: Scene[];
  activeSceneId: string | null;
  lastSceneRun: { sceneId: string; ts: number } | null;
  rules: AutomationRule[];
  flows: AutomationFlow[];
  integrations: Record<IntegrationProvider, IntegrationState>;
  preferences: Preferences;
  realtime: RealtimeSettings;
  household: HouseholdMember[];
  roomMembers: RoomMembership[];
  memberPermissionOverrides: MemberPermissionOverride[];
  activeMemberId: string;

  addRoom: (name: string) => void;
  renameRoom: (roomId: string, name: string) => void;
  moveRoom: (roomId: string, direction: -1 | 1) => void;
  removeRoom: (roomId: string) => void;
  setProfile: (patch: Partial<Profile>) => void;
  setOutdoor: (patch: Partial<AmbientReading>) => void;
  setIndoor: (patch: Partial<AmbientReading>) => void;
  setPreferences: (patch: Partial<Preferences>) => void;
  setRealtime: (patch: Partial<RealtimeSettings>) => void;
  setDevice: (deviceId: string, patch: Partial<Device>) => void;
  setAC: (deviceId: string, patch: Partial<Device>) => void;
  toggleDevice: (deviceId: string) => void;
  addDevice: (device: Omit<Device, "id"> & { id?: string }) => void;
  removeDevice: (deviceId: string) => void;
  addHouseholdMember: (
    member: Omit<HouseholdMember, "id"> & { id?: string },
  ) => void;
  updateHouseholdMember: (
    memberId: string,
    patch: Partial<HouseholdMember>,
  ) => void;
  removeHouseholdMember: (memberId: string) => void;
  setHouseholdPresence: (
    memberId: string,
    status: HouseholdMember["status"],
  ) => void;
  setActiveMember: (memberId: string) => void;
  setRoomMembership: (memberId: string, roomIds: string[]) => void;
  grantRoomAccess: (memberId: string, roomId: string) => void;
  revokeRoomAccess: (memberId: string, roomId: string) => void;
  setHouseholdFromRemote: (members: HouseholdMember[]) => void;
  setRoomMembersFromRemote: (members: RoomMembership[]) => void;
  setMemberPermissionOverride: (
    memberId: string,
    permission: MemberPermissionOverride["permission"],
    allowed: boolean | null,
  ) => void;
  setMemberPermissionOverridesFromRemote: (
    overrides: MemberPermissionOverride[],
  ) => void;

  addRule: (rule: Omit<AutomationRule, "id">) => void;
  toggleRule: (ruleId: string) => void;
  updateRule: (ruleId: string, patch: Partial<AutomationRule>) => void;
  removeRule: (ruleId: string) => void;
  quickScheduleDevice: (
    deviceId: string,
    time: { hour: number; minute: number },
  ) => void;
  runScene: (sceneId: string) => void;
  clearActiveScene: () => void;
  addScene: (scene: Omit<Scene, "id">) => void;
  updateScene: (sceneId: string, patch: Partial<Scene>) => void;
  addFlow: (flow: Omit<AutomationFlow, "id">) => void;
  updateFlow: (flowId: string, patch: Partial<AutomationFlow>) => void;
  toggleFlow: (flowId: string) => void;
  removeFlow: (flowId: string) => void;

  setIntegrationStatus: (
    provider: IntegrationProvider,
    status: IntegrationState["status"],
  ) => void;
  linkIntegration: (
    provider: IntegrationProvider,
    accountName?: string,
  ) => void;
  unlinkIntegration: (provider: IntegrationProvider) => void;
  resyncIntegration: (provider: IntegrationProvider) => void;
};

type AccessScope = {
  member: HouseholdMember | undefined;
  fullAccess: boolean;
  roomIds: Set<string>;
};

const getAccessScope = (state: Pick<
  HomeState,
  | "rooms"
  | "household"
  | "roomMembers"
  | "memberPermissionOverrides"
  | "activeMemberId"
>): AccessScope => {
  const member =
    state.household.find((m) => m.id === state.activeMemberId) ??
    state.household[0];
  const fullAccess = roleHasFullAccess(member?.role);
  if (fullAccess) {
    return {
      member,
      fullAccess,
      roomIds: new Set(state.rooms.map((room) => room.id)),
    };
  }
  const membership = state.roomMembers.find(
    (entry) => entry.memberId === member?.id,
  );
  return {
    member,
    fullAccess,
    roomIds: new Set(membership?.roomIds ?? []),
  };
};

export const selectActiveMember = (state: HomeState) =>
  state.household.find((m) => m.id === state.activeMemberId) ??
  state.household[0];

export const selectVisibleRooms = (state: HomeState) => {
  const scope = getAccessScope(state);
  if (scope.fullAccess) return state.rooms;
  return state.rooms.filter((room) => scope.roomIds.has(room.id));
};

export const selectVisibleDevices = (state: HomeState) => {
  const scope = getAccessScope(state);
  if (!scope.member) return [];
  const overrides = state.memberPermissionOverrides.filter(
    (item) => item.memberId === scope.member?.id,
  );
  if (!roleHasPermission(scope.member.role, "device.view", overrides)) return [];
  const canViewCamera = roleHasPermission(
    scope.member.role,
    "camera.live",
    overrides,
  );
  if (scope.fullAccess && canViewCamera) return state.devices;
  return state.devices.filter(
    (device) =>
      (scope.fullAccess || (device.roomId && scope.roomIds.has(device.roomId))) &&
      (device.kind !== "camera" || canViewCamera),
  );
};

// Demo data to keep the UI populated before a real backend is wired up.
const profileSeed: Profile = {
  name: "Nick",
  email: "nick@example.com",
  phone: "",
  homeName: "Vanta Home",
  avatarColor: "#B46BFF",
  avatarUri: "",
  timeFormat: "12h",
  tempUnit: "C",
  timezone: "Auto",
};

const outdoorSeed: AmbientReading = {
  tempC: 24,
  label: "Sunny",
  source: "seed",
};
const indoorSeed: AmbientReading = {
  tempC: 22,
  label: "Indoor",
  source: "seed",
};

const roomsSeed: Room[] = [
  { id: "r1", name: "Drawing Room" },
  { id: "r2", name: "Bedroom" },
  { id: "r3", name: "Kitchen" },
  { id: "r4", name: "Office" },
  { id: "r5", name: "Guest Suite" },
  { id: "r6", name: "Patio" },
];

const householdSeed: HouseholdMember[] = [
  {
    id: "m1",
    name: "Nick Carter",
    role: "Owner",
    status: "home",
    avatarColor: "#B46BFF",
  },
  {
    id: "m2",
    name: "Jamie Parker",
    role: "Admin",
    status: "away",
    avatarColor: "#7A5CFF",
  },
  {
    id: "m3",
    name: "Sky Ren",
    role: "Guest",
    status: "away",
    avatarColor: "#A0E9FF",
  },
  {
    id: "m4",
    name: "Taylor Quinn",
    role: "Tenant",
    status: "away",
    avatarColor: "#F0C27B",
  },
];

const roomMembersSeed: RoomMembership[] = [
  { memberId: "m3", roomIds: ["r5"] },
  { memberId: "m4", roomIds: ["r2"] },
];

const activeMemberSeed = householdSeed[0]?.id ?? "";

const cameraSnapshotBase = process.env.EXPO_PUBLIC_CAMERA_SNAPSHOT_BASE?.trim();
const cameraStreamBase = process.env.EXPO_PUBLIC_CAMERA_STREAM_BASE?.trim();

const buildCameraUrls = (id: string) => {
  const snapshotUrl = cameraSnapshotBase
    ? `${cameraSnapshotBase.replace(/\/$/, "")}/${id}/snapshot.jpg`
    : undefined;
  const streamUrl = cameraStreamBase
    ? `${cameraStreamBase.replace(/\/$/, "")}/${id}/stream.m3u8`
    : undefined;
  return { streamUrl, thumbnailUrl: snapshotUrl };
};

const devicesSeed: Device[] = [
  {
    id: "d1",
    name: "Air Conditioner",
    kind: "ac",
    roomId: "r1",
    isOn: true,
    tempC: 22,
    mode: "cold",
    acFanSpeed: 60,
    acSwingMode: "both",
    acEcoMode: false,
    acTurboMode: false,
    acQuietMode: true,
    acTargetHumidity: 45,
    acFilterLife: 72,
  },
  {
    id: "d2",
    name: "Light",
    kind: "light",
    roomId: "r1",
    isOn: true,
    brightness: 70,
    color: "#FFD166",
  },
  {
    id: "d3",
    name: "TV",
    kind: "tv",
    roomId: "r1",
    isOn: false,
    volume: 30,
    channel: 5,
    source: "Live TV",
  },
  {
    id: "d4",
    name: "Coffee",
    kind: "coffee",
    roomId: "r1",
    isOn: false,
    coffeeStrength: "normal",
    coffeeSizeOz: 8,
    coffeeTempC: 92,
    coffeeKeepWarmMin: 20,
    coffeeCupCount: 2,
    coffeeGrinder: true,
    coffeeMilkFrother: false,
    coffeeWaterLevel: 70,
    coffeeBeanLevel: 55,
    coffeeDescaleNeeded: false,
    coffeeAutoBrewTime: "07:00",
  },
  {
    id: "d26",
    name: "Front Gate",
    kind: "gate",
    roomId: "r1",
    isOn: false,
    openPercent: 0,
    autoOpenEnabled: true,
  },

  {
    id: "d5",
    name: "Bed Light",
    kind: "light",
    roomId: "r2",
    isOn: false,
    brightness: 45,
    color: "#A0E9FF",
  },
  {
    id: "d6",
    name: "Bedroom AC",
    kind: "ac",
    roomId: "r2",
    isOn: true,
    tempC: 21,
    mode: "cold",
    acFanSpeed: 50,
    acSwingMode: "vertical",
    acEcoMode: true,
    acTurboMode: false,
    acQuietMode: false,
    acTargetHumidity: 48,
    acFilterLife: 80,
  },
  {
    id: "d7",
    name: "Bedroom TV",
    kind: "tv",
    roomId: "r2",
    isOn: true,
    volume: 22,
    channel: 2,
    source: "Live TV",
  },

  {
    id: "d8",
    name: "Kitchen Light",
    kind: "light",
    roomId: "r3",
    isOn: true,
    brightness: 85,
    color: "#FFFFFF",
  },
  {
    id: "d9",
    name: "Kitchen Coffee",
    kind: "coffee",
    roomId: "r3",
    isOn: true,
    coffeeStrength: "strong",
    coffeeSizeOz: 10,
    coffeeTempC: 94,
    coffeeKeepWarmMin: 30,
    coffeeCupCount: 2,
    coffeeGrinder: true,
    coffeeMilkFrother: true,
    coffeeWaterLevel: 60,
    coffeeBeanLevel: 40,
    coffeeDescaleNeeded: true,
    coffeeAutoBrewTime: "06:45",
  },

  {
    id: "d10",
    name: "Ceiling Fan",
    kind: "fan",
    roomId: "r3",
    isOn: true,
    speed: 60,
    fanOscillation: true,
    fanDirection: "forward",
    fanTimerMin: 0,
    fanAutoMode: false,
    fanLightOn: true,
    fanSleepMode: false,
  },
  {
    id: "d11",
    name: "Refrigerator",
    kind: "fridge",
    roomId: "r3",
    isOn: true,
    tempC: 4,
    freezerTempC: -18,
    fridgeMode: "normal",
    fridgeDoorOpen: false,
    fridgeDoorAlarm: true,
    fridgeIceMaker: true,
    fridgeQuickCool: false,
    fridgeQuickFreeze: false,
    fridgeEnergySaver: true,
    fridgeFilterLife: 64,
    fridgeHumidity: 50,
  },
  {
    id: "d12",
    name: "Garage",
    kind: "garage",
    roomId: "r1",
    isOn: false,
    openPercent: 0,
    battery: 88,
  },
  {
    id: "d13",
    name: "Front Door",
    kind: "door",
    roomId: "r1",
    isOn: false,
    openPercent: 0,
    battery: 76,
  },
  {
    id: "d14",
    name: "Vacuum",
    kind: "vacuum",
    roomId: "r2",
    isOn: false,
    status: "docked",
    battery: 86,
    vacuumSuction: 70,
    vacuumMode: "auto",
    vacuumMop: false,
    vacuumQuietMode: false,
    vacuumBinFull: false,
    vacuumBrushDirty: false,
    vacuumFilterLife: 68,
    vacuumAreaM2: 32,
    vacuumRuntimeMin: 46,
  },
  {
    id: "d15",
    name: "Entry Camera",
    kind: "camera",
    roomId: "r1",
    isOn: true,
    armed: true,
    recording: false,
    nightVision: true,
    motionAlerts: true,
    motionSensitivity: 6,
    micMuted: false,
    twoWayAudio: true,
    ...buildCameraUrls("d15"),
  },
  {
    id: "d37",
    name: "Office Camera",
    kind: "camera",
    roomId: "r4",
    isOn: true,
    armed: false,
    recording: false,
    nightVision: true,
    motionAlerts: true,
    motionSensitivity: 5,
    micMuted: false,
    twoWayAudio: true,
    ...buildCameraUrls("d37"),
  },
  {
    id: "d38",
    name: "Guest Suite Camera",
    kind: "camera",
    roomId: "r5",
    isOn: false,
    armed: true,
    recording: false,
    nightVision: false,
    motionAlerts: true,
    motionSensitivity: 4,
    micMuted: true,
    twoWayAudio: false,
    ...buildCameraUrls("d38"),
  },
  {
    id: "d39",
    name: "Patio Camera",
    kind: "camera",
    roomId: "r6",
    isOn: true,
    armed: true,
    recording: true,
    nightVision: true,
    motionAlerts: true,
    motionSensitivity: 7,
    micMuted: false,
    twoWayAudio: true,
    ...buildCameraUrls("d39"),
  },
  {
    id: "d16",
    name: "Window",
    kind: "window",
    roomId: "r2",
    isOn: true,
    openPercent: 30,
  },
  {
    id: "d17",
    name: "Stove",
    kind: "stove",
    roomId: "r3",
    isOn: false,
    burnerLevel: 0,
    stoveMode: "simmer",
    stoveTimerMin: 0,
    stoveLock: false,
  },
  {
    id: "d18",
    name: "Washer/Dryer",
    kind: "washer",
    roomId: "r2",
    isOn: false,
    cycle: "Normal",
    progress: 0,
    washTemp: "Warm",
    spinSpeedRpm: 1000,
    soilLevel: "Normal",
    remainingMin: 42,
    loadSize: "Medium",
    rinseCount: 2,
    prewash: false,
    steamWash: false,
    sanitizeWash: false,
    smartDispense: true,
    extraSpin: false,
    ecoWash: false,
  },
  {
    id: "d18b",
    name: "Dishwasher",
    kind: "dishwasher",
    roomId: "r3",
    isOn: false,
    cycle: "Auto",
    progress: 0,
    washTemp: "Hot",
    soilLevel: "Normal",
    remainingMin: 58,
    rinseCount: 2,
    prewash: false,
    steamWash: false,
    sanitizeWash: true,
    smartDispense: true,
    extraSpin: false,
    ecoWash: false,
  },
  {
    id: "d19",
    name: "Microwave",
    kind: "microwave",
    roomId: "r3",
    isOn: false,
    timeRemainingSec: 0,
    microwavePower: 7,
    microwaveMode: "Reheat",
  },
  {
    id: "d20",
    name: "Energy Monitor",
    kind: "energy",
    roomId: "r1",
    isOn: true,
    powerW: 680,
    energyTodayKwh: 4.2,
    energyPeakW: 980,
    energyMonthKwh: 78,
    energyCostToday: 2.4,
    energyBudgetKwh: 120,
    gridAvailable: true,
    gridOutageAlerts: true,
    solarW: 420,
    solarTodayKwh: 1.4,
    gridTodayKwh: 2.8,
  },
  {
    id: "d21",
    name: "Water Meter",
    kind: "water",
    roomId: "r3",
    isOn: true,
    waterLpm: 8,
    waterTodayL: 120,
    waterPressurePsi: 52,
    waterPressureLowPsi: 40,
    waterPressureHighPsi: 80,
    waterTempC: 18,
    waterLeakDetected: false,
    waterLeakAlerts: true,
    waterPressureAlerts: true,
    waterAutoShutoff: false,
    waterBudgetL: 220,
  },
  {
    id: "d22",
    name: "Air Quality",
    kind: "air",
    roomId: "r2",
    isOn: true,
    airQualityIndex: 32,
    humidity: 44,
    airPm25: 8,
    airPm10: 14,
    airCo2: 620,
    airVoc: 120,
    airFormaldehyde: 0.04,
    airPollen: 1,
    airQualityConfidence: 92,
    airOutdoorAqi: 46,
    airOutdoorPm25: 12,
    airOutdoorCo2: 420,
    airOutdoorVoc: 90,
    airOutdoorHumidity: 48,
    airOutdoorTempC: 26,
    airAlertsEnabled: true,
    airAlertAqi: 100,
    airAlertCo2: 1200,
    airAlertVoc: 300,
    airAlertPm25: 35,
    airAlertPm10: 50,
    airAlertPollen: 3,
    airPurifierMode: "auto",
    airPurifierSpeed: 40,
    airIonizerEnabled: false,
    airFilterLife: 78,
    airFilterDaysLeft: 45,
    airAutoVentilation: true,
  },
  {
    id: "d23",
    name: "Sprinkler",
    kind: "sprinkler",
    roomId: "r1",
    isOn: false,
    zone: "Front Yard",
    durationMin: 15,
    schedule: [
      {
        id: "sch1",
        hour: 6,
        minute: 0,
        days: ["Mon", "Wed", "Fri"],
        enabled: true,
      },
    ],
  },
  {
    id: "d24",
    name: "Smart Speaker",
    kind: "speaker",
    roomId: "r1",
    isOn: true,
    volume: 28,
    speakerSource: "Spotify",
    speakerPreset: "Warm",
    bass: 58,
    treble: 46,
    spatialAudio: true,
    partyMode: false,
    nightMode: false,
    micEnabled: true,
    voiceAssistantEnabled: true,
    shuffle: true,
    repeat: "all",
    trackTitle: "Midnight City",
    trackArtist: "M83",
    trackAlbum: "Hurry Up, We're Dreaming",
    trackDurationSec: 252,
    trackProgressSec: 96,
  },
  {
    id: "d25",
    name: "Smoke/CO",
    kind: "smoke",
    roomId: "r2",
    isOn: true,
    smokeDetected: false,
    coDetected: false,
    coPpm: 3,
    smokePpm: 0,
    smokeBattery: 84,
    smokeSensorStatus: "ok",
    smokeSilenced: false,
  },
  {
    id: "d27",
    name: "Water Heater",
    kind: "water-heater",
    roomId: "r3",
    isOn: true,
    tempC: 52,
    waterHeaterType: "heat-pump",
    heaterMode: "eco",
    recirculation: true,
    antiLegionella: false,
    vacationDays: 0,
    heaterScheduleEnabled: true,
  },
  {
    id: "d28",
    name: "Desk Light",
    kind: "light",
    roomId: "r4",
    isOn: true,
    brightness: 68,
    color: "#B6D0FF",
  },
  {
    id: "d29",
    name: "Office AC",
    kind: "ac",
    roomId: "r4",
    isOn: false,
    tempC: 23,
    mode: "fan",
    acFanSpeed: 45,
    acSwingMode: "vertical",
    acEcoMode: true,
    acTurboMode: false,
    acQuietMode: true,
    acTargetHumidity: 45,
    acFilterLife: 74,
  },
  {
    id: "d30",
    name: "Focus Speaker",
    kind: "speaker",
    roomId: "r4",
    isOn: true,
    volume: 18,
    speakerSource: "Spotify",
    speakerPreset: "Flat",
    bass: 48,
    treble: 52,
    spatialAudio: false,
    partyMode: false,
    nightMode: true,
    micEnabled: false,
    voiceAssistantEnabled: false,
    shuffle: false,
    repeat: "all",
    trackTitle: "Ambient Flow",
    trackArtist: "Vanta",
    trackAlbum: "Workday",
    trackDurationSec: 242,
    trackProgressSec: 102,
  },
  {
    id: "d31",
    name: "Guest Light",
    kind: "light",
    roomId: "r5",
    isOn: false,
    brightness: 55,
    color: "#FFD6E8",
  },
  {
    id: "d32",
    name: "Guest TV",
    kind: "tv",
    roomId: "r5",
    isOn: false,
    volume: 18,
    channel: 4,
    source: "Streaming",
  },
  {
    id: "d33",
    name: "Guest Window",
    kind: "window",
    roomId: "r5",
    isOn: true,
    openPercent: 15,
  },
  {
    id: "d34",
    name: "Patio Lights",
    kind: "light",
    roomId: "r6",
    isOn: true,
    brightness: 72,
    color: "#FFD1A3",
  },
  {
    id: "d35",
    name: "Patio Fan",
    kind: "fan",
    roomId: "r6",
    isOn: true,
    speed: 40,
    fanOscillation: true,
    fanDirection: "forward",
    fanTimerMin: 0,
    fanAutoMode: false,
    fanLightOn: false,
    fanSleepMode: false,
  },
  {
    id: "d36",
    name: "Patio Speaker",
    kind: "speaker",
    roomId: "r6",
    isOn: false,
    volume: 26,
    speakerSource: "Bluetooth",
    speakerPreset: "Warm",
    bass: 55,
    treble: 46,
    spatialAudio: false,
    partyMode: false,
    nightMode: false,
    micEnabled: true,
    voiceAssistantEnabled: true,
    shuffle: true,
    repeat: "all",
    trackTitle: "Golden Hour",
    trackArtist: "Tycho",
    trackAlbum: "Awake",
    trackDurationSec: 280,
    trackProgressSec: 48,
  },
];

const integrationsSeed: Record<IntegrationProvider, IntegrationState> = {
  alexa: { status: "not-linked" },
  google: { status: "not-linked" },
  homekit: { status: "not-linked" },
  matter: { status: "not-linked" },
};

const realtimeSeed: RealtimeSettings = {
  enabled: false,
  wsUrl: "ws://localhost:8088",
  useMqtt: !!process.env.EXPO_PUBLIC_MQTT_URL,
};

const mergeById = <T extends { id: string }>(
  current: T[] | undefined,
  seed: T[],
) => {
  const map = new Map<string, T>();
  (seed || []).forEach((item) => map.set(item.id, item));
  (current || []).forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
};

const scenesSeed: Scene[] = [
  {
    id: "s1",
    roomId: "r1",
    name: "Movie Time",
    actions: [
      { type: "patch", deviceId: "d2", patch: { isOn: true, brightness: 20 } },
      { type: "patch", deviceId: "d3", patch: { isOn: true, volume: 18 } },
      {
        type: "patch",
        deviceId: "d1",
        patch: { isOn: true, tempC: 22, mode: "cold" },
      },
    ],
  },
  {
    id: "s2",
    roomId: "r1",
    name: "Chill",
    actions: [
      {
        type: "patch",
        deviceId: "d1",
        patch: { isOn: true, tempC: 21, mode: "cold" },
      },
    ],
  },
  {
    id: "s3",
    roomId: "r1",
    name: "All Off",
    actions: [
      { type: "toggle", deviceId: "d1", on: false },
      { type: "toggle", deviceId: "d2", on: false },
      { type: "toggle", deviceId: "d3", on: false },
      { type: "toggle", deviceId: "d4", on: false },
    ],
  },
  {
    id: "s4",
    roomId: "r2",
    name: "Sleep Mode",
    actions: [
      { type: "patch", deviceId: "d5", patch: { isOn: true, brightness: 15 } },
      {
        type: "patch",
        deviceId: "d6",
        patch: { isOn: true, tempC: 20, mode: "cold" },
      },
      { type: "toggle", deviceId: "d7", on: false },
      { type: "patch", deviceId: "d16", patch: { openPercent: 10 } },
    ],
  },
  {
    id: "s5",
    roomId: "r2",
    name: "Wake Up",
    actions: [
      { type: "patch", deviceId: "d5", patch: { isOn: true, brightness: 60 } },
      {
        type: "patch",
        deviceId: "d6",
        patch: { isOn: true, tempC: 22, mode: "fan" },
      },
      { type: "toggle", deviceId: "d7", on: true },
      { type: "patch", deviceId: "d16", patch: { openPercent: 40 } },
    ],
  },
  {
    id: "s6",
    roomId: "r3",
    name: "Morning Prep",
    actions: [
      { type: "patch", deviceId: "d8", patch: { isOn: true, brightness: 80 } },
      { type: "toggle", deviceId: "d9", on: true },
      { type: "patch", deviceId: "d10", patch: { isOn: true, speed: 55 } },
    ],
  },
  {
    id: "s7",
    roomId: "r3",
    name: "Cooking",
    actions: [
      { type: "patch", deviceId: "d8", patch: { isOn: true, brightness: 90 } },
      { type: "patch", deviceId: "d10", patch: { isOn: true, speed: 75 } },
      { type: "patch", deviceId: "d17", patch: { isOn: true, burnerLevel: 3 } },
    ],
  },
  {
    id: "s8",
    roomId: "r3",
    name: "Kitchen Wind Down",
    actions: [
      { type: "patch", deviceId: "d8", patch: { isOn: true, brightness: 35 } },
      { type: "toggle", deviceId: "d9", on: false },
      { type: "patch", deviceId: "d10", patch: { isOn: true, speed: 35 } },
      { type: "toggle", deviceId: "d17", on: false },
    ],
  },
  {
    id: "s9",
    roomId: "r1",
    name: "Away Mode",
    actions: [
      { type: "toggle", deviceId: "d2", on: false },
      { type: "toggle", deviceId: "d3", on: false },
      { type: "toggle", deviceId: "d4", on: false },
      {
        type: "patch",
        deviceId: "d15",
        patch: { armed: true, motionAlerts: true, isOn: true },
      },
      {
        type: "patch",
        deviceId: "d12",
        patch: { isOn: false, openPercent: 0 },
      },
      {
        type: "patch",
        deviceId: "d13",
        patch: { isOn: false, openPercent: 0 },
      },
      {
        type: "patch",
        deviceId: "d26",
        patch: { isOn: false, openPercent: 0 },
      },
    ],
  },
  {
    id: "s10",
    roomId: "r1",
    name: "Welcome Home",
    actions: [
      {
        type: "patch",
        deviceId: "d1",
        patch: { isOn: true, tempC: 22, mode: "cold" },
      },
      {
        type: "patch",
        deviceId: "d2",
        patch: { isOn: true, brightness: 75, color: "#FFD166" },
      },
      { type: "toggle", deviceId: "d3", on: true },
      {
        type: "patch",
        deviceId: "d15",
        patch: { armed: false, motionAlerts: false },
      },
      {
        type: "patch",
        deviceId: "d26",
        patch: { isOn: true, openPercent: 100 },
      },
    ],
  },
  {
    id: "s11",
    roomId: "r2",
    name: "Night Wind Down",
    actions: [
      {
        type: "patch",
        deviceId: "d5",
        patch: { isOn: true, brightness: 20, color: "#B69CFF" },
      },
      {
        type: "patch",
        deviceId: "d6",
        patch: { isOn: true, tempC: 21, mode: "cold" },
      },
      { type: "toggle", deviceId: "d7", on: false },
      { type: "patch", deviceId: "d16", patch: { openPercent: 10 } },
    ],
  },
  {
    id: "s12",
    roomId: "r3",
    name: "Kitchen Party",
    actions: [
      {
        type: "patch",
        deviceId: "d8",
        patch: { isOn: true, brightness: 90, color: "#B69CFF" },
      },
      { type: "toggle", deviceId: "d9", on: true },
      { type: "patch", deviceId: "d10", patch: { isOn: true, speed: 70 } },
      { type: "patch", deviceId: "d17", patch: { isOn: true, burnerLevel: 2 } },
    ],
  },
  {
    id: "s13",
    roomId: "r2",
    name: "Clean Sweep",
    actions: [
      {
        type: "patch",
        deviceId: "d14",
        patch: { isOn: true, status: "cleaning" },
      },
      { type: "patch", deviceId: "d16", patch: { openPercent: 40 } },
      { type: "toggle", deviceId: "d5", on: false },
    ],
  },
  {
    id: "s14",
    roomId: "r4",
    name: "Focus Work",
    actions: [
      {
        type: "patch",
        deviceId: "d28",
        patch: { isOn: true, brightness: 75, color: "#B6D0FF" },
      },
      {
        type: "patch",
        deviceId: "d29",
        patch: { isOn: true, tempC: 22, mode: "fan" },
      },
      {
        type: "patch",
        deviceId: "d30",
        patch: { isOn: true, volume: 14, speakerPreset: "Flat" },
      },
    ],
  },
  {
    id: "s15",
    roomId: "r4",
    name: "Video Call",
    actions: [
      {
        type: "patch",
        deviceId: "d28",
        patch: { isOn: true, brightness: 85, color: "#FFFFFF" },
      },
      {
        type: "patch",
        deviceId: "d29",
        patch: { isOn: true, tempC: 21, mode: "cold" },
      },
      { type: "toggle", deviceId: "d30", on: false },
    ],
  },
  {
    id: "s16",
    roomId: "r5",
    name: "Guest Welcome",
    actions: [
      {
        type: "patch",
        deviceId: "d31",
        patch: { isOn: true, brightness: 70, color: "#FFD6E8" },
      },
      { type: "toggle", deviceId: "d32", on: true },
      { type: "patch", deviceId: "d33", patch: { openPercent: 25 } },
    ],
  },
  {
    id: "s17",
    roomId: "r5",
    name: "Sleep Prep",
    actions: [
      {
        type: "patch",
        deviceId: "d31",
        patch: { isOn: true, brightness: 15, color: "#B69CFF" },
      },
      { type: "toggle", deviceId: "d32", on: false },
      { type: "patch", deviceId: "d33", patch: { openPercent: 5 } },
    ],
  },
  {
    id: "s18",
    roomId: "r6",
    name: "Evening Hangout",
    actions: [
      {
        type: "patch",
        deviceId: "d34",
        patch: { isOn: true, brightness: 80, color: "#FFD1A3" },
      },
      {
        type: "patch",
        deviceId: "d35",
        patch: { isOn: true, speed: 45 },
      },
      { type: "patch", deviceId: "d36", patch: { isOn: true, volume: 32 } },
    ],
  },
  {
    id: "s19",
    roomId: "r6",
    name: "Patio Close",
    actions: [
      { type: "toggle", deviceId: "d34", on: false },
      { type: "toggle", deviceId: "d35", on: false },
      { type: "toggle", deviceId: "d36", on: false },
    ],
  },
];

const rulesSeed: AutomationRule[] = [
  {
    id: "a1",
    name: "Night Cool",
    enabled: true,
    trigger: { type: "time", hour: 21, minute: 0 },
    action: { type: "set-ac", deviceId: "d1", tempC: 22, mode: "cold" },
  },
  {
    id: "a2",
    name: "Morning Boost",
    enabled: true,
    trigger: { type: "time", hour: 6, minute: 30 },
    action: { type: "set-ac", deviceId: "d6", tempC: 21, mode: "cold" },
  },
  {
    id: "a3",
    name: "Coffee Start",
    enabled: true,
    trigger: { type: "time", hour: 7, minute: 0 },
    action: { type: "toggle", deviceId: "d9", on: true },
  },
  {
    id: "a4",
    name: "Evening Lights",
    enabled: true,
    trigger: { type: "time", hour: 18, minute: 30 },
    action: { type: "toggle", deviceId: "d2", on: true },
  },
  {
    id: "a5",
    name: "Night Lockdown",
    enabled: true,
    trigger: { type: "time", hour: 23, minute: 30 },
    action: { type: "toggle", deviceId: "d26", on: false },
  },
  {
    id: "a6",
    name: "Sprinkler Morning",
    enabled: false,
    trigger: { type: "time", hour: 6, minute: 15 },
    action: { type: "toggle", deviceId: "d23", on: true },
  },
];

const flowsSeed: AutomationFlow[] = [
  {
    id: "f1",
    name: "Arrive Home",
    enabled: true,
    triggers: [{ type: "presence", memberId: "m1", status: "home" }],
    conditions: [
      {
        type: "time-range",
        startHour: 17,
        startMinute: 0,
        endHour: 23,
        endMinute: 30,
      },
    ],
    actions: [
      { type: "toggle", deviceId: "d2", on: true },
      { type: "set-ac", deviceId: "d1", tempC: 22, mode: "cold" },
      { type: "run-scene", sceneId: "s10" },
    ],
  },
  {
    id: "f2",
    name: "Morning Wake",
    enabled: true,
    triggers: [{ type: "time", hour: 7, minute: 0 }],
    conditions: [{ type: "day", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] }],
    actions: [
      { type: "set-brightness", deviceId: "d5", brightness: 60 },
      { type: "set-ac", deviceId: "d6", tempC: 21, mode: "cold" },
    ],
  },
  {
    id: "f3",
    name: "Movie Ready",
    enabled: false,
    triggers: [{ type: "scene", sceneId: "s1" }],
    conditions: [{ type: "device", deviceId: "d3", state: "on" }],
    actions: [
      { type: "set-brightness", deviceId: "d2", brightness: 20 },
      { type: "notify", message: "Movie time on." },
    ],
  },
];

export const useHomeStore = create<HomeState>()(
  persist(
    (set, get) => ({
      userName: "Nick",
      profile: profileSeed,
      outdoor: outdoorSeed,
      indoor: indoorSeed,

      rooms: roomsSeed,
      devices: devicesSeed,

      scenes: scenesSeed,
      activeSceneId: null,
      lastSceneRun: null,
      rules: rulesSeed,
      flows: flowsSeed,
      integrations: integrationsSeed,
      preferences: { haptics: true, notifications: true },
      realtime: realtimeSeed,
      household: householdSeed,
      roomMembers: roomMembersSeed,
      memberPermissionOverrides: [],
      activeMemberId: activeMemberSeed,

      addRoom: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const id = `r${Date.now()}`;
        set((state) => ({
          rooms: [...state.rooms, { id, name: trimmed }],
        }));
      },
      renameRoom: (roomId, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((state) => ({
          rooms: state.rooms.map((r) =>
            r.id === roomId ? { ...r, name: trimmed } : r,
          ),
        }));
      },
      moveRoom: (roomId, direction) => {
        set((state) => {
          const idx = state.rooms.findIndex((r) => r.id === roomId);
          if (idx < 0) return {};
          const nextIdx = idx + direction;
          if (nextIdx < 0 || nextIdx >= state.rooms.length) return {};
          const rooms = [...state.rooms];
          const [room] = rooms.splice(idx, 1);
          rooms.splice(nextIdx, 0, room);
          return { rooms };
        });
      },
      removeRoom: (roomId) => {
        set((state) => {
          if (state.rooms.length <= 1) return {};
          const remaining = state.rooms.filter((r) => r.id !== roomId);
          const fallbackRoom = remaining[0];
          const devices = state.devices.map((d) =>
            d.roomId === roomId ? { ...d, roomId: fallbackRoom.id } : d,
          );
          const scenes = state.scenes.filter((s) => s.roomId !== roomId);
          const roomMembers = state.roomMembers.map((entry) => ({
            ...entry,
            roomIds: entry.roomIds.filter((id) => id !== roomId),
          }));
          return { rooms: remaining, devices, scenes, roomMembers };
        });
      },

      setProfile: (patch) =>
        set((state) => {
          const next = { ...state.profile, ...patch };
          return {
            profile: next,
            userName: next.name || state.userName,
          };
        }),

      setOutdoor: (patch) =>
        set((state) => ({
          outdoor: {
            ...state.outdoor,
            ...patch,
            updatedAt: patch.updatedAt ?? Date.now(),
          },
        })),

      setIndoor: (patch) =>
        set((state) => ({
          indoor: {
            ...state.indoor,
            ...patch,
            updatedAt: patch.updatedAt ?? Date.now(),
          },
        })),

      setPreferences: (patch) =>
        set((state) => ({
          preferences: { ...state.preferences, ...patch },
        })),

      setRealtime: (patch) =>
        set((state) => ({
          realtime: { ...state.realtime, ...patch },
        })),

      setDevice: (deviceId, patch) =>
        set((state) => ({
          devices: applyDeviceStatePatch(state.devices, deviceId, patch),
        })),

      setAC: (deviceId, patch) =>
        set((state) => ({
          devices: state.devices.map((d) =>
            d.id === deviceId
              ? { ...d, ...patch, isOn: patch.isOn ?? true }
              : d,
          ),
        })),

      toggleDevice: (deviceId) =>
        set((state) => ({
          devices: state.devices.map((d) =>
            d.id === deviceId ? { ...d, isOn: !d.isOn } : d,
          ),
        })),

      addDevice: (device) => {
        const id = device.id ?? `d${Date.now()}`;
        set((state) => ({ devices: [...state.devices, { ...device, id }] }));
      },

      removeDevice: (deviceId) =>
        set((state) => ({
          devices: state.devices.filter((d) => d.id !== deviceId),
        })),

      addHouseholdMember: (member) => {
        const id = member.id ?? `m${Date.now()}`;
        set((state) => {
          const nextMember = { ...member, id };
          const shouldAssignRooms = !roleHasFullAccess(nextMember.role);
          const firstRoomId = state.rooms[0]?.id;
          const roomMembers = shouldAssignRooms && firstRoomId
            ? [
                ...state.roomMembers,
                { memberId: id, roomIds: [firstRoomId] },
              ]
            : state.roomMembers;
          return {
            household: [...state.household, nextMember],
            roomMembers,
          };
        });
      },

      updateHouseholdMember: (memberId, patch) =>
        set((state) => {
          const nextHousehold = state.household.map((m) =>
            m.id === memberId ? { ...m, ...patch } : m,
          );
          const updated = nextHousehold.find((m) => m.id === memberId);
          if (!updated) return { household: nextHousehold };
          if (roleHasFullAccess(updated.role)) {
            return { household: nextHousehold };
          }
          const hasEntry = state.roomMembers.some(
            (entry) => entry.memberId === memberId,
          );
          if (hasEntry) return { household: nextHousehold };
          const fallbackRoom = state.rooms[0]?.id;
          const roomMembers = fallbackRoom
            ? [
                ...state.roomMembers,
                { memberId, roomIds: [fallbackRoom] },
              ]
            : state.roomMembers;
          return { household: nextHousehold, roomMembers };
        }),

      removeHouseholdMember: (memberId) =>
        set((state) => {
          const household = state.household.filter((m) => m.id !== memberId);
          const roomMembers = state.roomMembers.filter(
            (entry) => entry.memberId !== memberId,
          );
          const memberPermissionOverrides =
            state.memberPermissionOverrides.filter(
              (entry) => entry.memberId !== memberId,
            );
          const activeMemberId =
            state.activeMemberId === memberId
              ? household[0]?.id ?? ""
              : state.activeMemberId;
          return {
            household,
            roomMembers,
            memberPermissionOverrides,
            activeMemberId,
          };
        }),

      setHouseholdPresence: (memberId, status) =>
        set((state) => ({
          household: state.household.map((m) =>
            m.id === memberId ? { ...m, status, lastSeenAt: Date.now() } : m,
          ),
        })),

      setHouseholdFromRemote: (members) =>
        set((state) => ({
          household: members,
          activeMemberId:
            members.find((m) => m.id === state.activeMemberId)?.id ??
            members[0]?.id ??
            state.activeMemberId,
        })),

      setRoomMembersFromRemote: (members) =>
        set(() => ({
          roomMembers: members,
        })),

      setMemberPermissionOverride: (memberId, permission, allowed) =>
        set((state) => {
          const remaining = state.memberPermissionOverrides.filter(
            (item) =>
              item.memberId !== memberId || item.permission !== permission,
          );
          return {
            memberPermissionOverrides:
              allowed === null
                ? remaining
                : [...remaining, { memberId, permission, allowed }],
          };
        }),

      setMemberPermissionOverridesFromRemote: (overrides) =>
        set(() => ({ memberPermissionOverrides: overrides })),

      setActiveMember: (memberId) =>
        set((state) => {
          const exists = state.household.some((m) => m.id === memberId);
          return { activeMemberId: exists ? memberId : state.activeMemberId };
        }),

      setRoomMembership: (memberId, roomIds) =>
        set((state) => {
          const nextRoomIds = Array.from(new Set(roomIds));
          const others = state.roomMembers.filter(
            (entry) => entry.memberId !== memberId,
          );
          return {
            roomMembers: [
              ...others,
              { memberId, roomIds: nextRoomIds },
            ],
          };
        }),

      grantRoomAccess: (memberId, roomId) =>
        set((state) => {
          const entry = state.roomMembers.find(
            (item) => item.memberId === memberId,
          );
          const roomIds = entry?.roomIds ?? [];
          if (roomIds.includes(roomId)) return {};
          const next = [...roomIds, roomId];
          const others = state.roomMembers.filter(
            (item) => item.memberId !== memberId,
          );
          return { roomMembers: [...others, { memberId, roomIds: next }] };
        }),

      revokeRoomAccess: (memberId, roomId) =>
        set((state) => {
          const entry = state.roomMembers.find(
            (item) => item.memberId === memberId,
          );
          const roomIds = entry?.roomIds ?? [];
          if (!roomIds.includes(roomId)) return {};
          const next = roomIds.filter((id) => id !== roomId);
          const others = state.roomMembers.filter(
            (item) => item.memberId !== memberId,
          );
          return { roomMembers: [...others, { memberId, roomIds: next }] };
        }),

      addRule: (rule) =>
        set((state) => ({
          rules: [...state.rules, { ...rule, id: `a${Date.now()}` }],
        })),

      toggleRule: (ruleId) =>
        set((state) => ({
          rules: state.rules.map((r) =>
            r.id === ruleId ? { ...r, enabled: !r.enabled } : r,
          ),
        })),

      updateRule: (ruleId, patch) =>
        set((state) => ({
          rules: state.rules.map((r) =>
            r.id === ruleId ? { ...r, ...patch } : r,
          ),
        })),

      removeRule: (ruleId) =>
        set((state) => ({
          rules: state.rules.filter((r) => r.id !== ruleId),
        })),

      quickScheduleDevice: (deviceId, time) => {
        const d = get().devices.find((x) => x.id === deviceId);
        if (!d) return;

        const hh = String(time.hour).padStart(2, "0");
        const mm = String(time.minute).padStart(2, "0");

        // AC needs temperature/mode; everything else can use a simple toggle rule.
        if (d.kind === "ac") {
          get().addRule({
            name: `${d.name} → ${hh}:${mm}`,
            enabled: true,
            trigger: { type: "time", hour: time.hour, minute: time.minute },
            action: {
              type: "set-ac",
              deviceId,
              tempC: d.tempC ?? AC_TEMP_MIN_C,
              mode: d.mode ?? "cold",
            },
          });
        } else {
          get().addRule({
            name: `${d.name} ON @ ${hh}:${mm}`,
            enabled: true,
            trigger: { type: "time", hour: time.hour, minute: time.minute },
            action: { type: "toggle", deviceId, on: true },
          } as AutomationRule);
        }
      },

      runScene: (sceneId) =>
        set((state) => {
          const scene = state.scenes.find((s) => s.id === sceneId);
          if (!scene) return {};

          const devices = state.devices.map((d) => {
            const actions = scene.actions.filter((a) => a.deviceId === d.id);
            if (!actions.length) return d;
            return actions.reduce<Device>((acc, a) => {
              if (a.type === "patch") return { ...acc, ...a.patch };
              if (a.type === "toggle")
                return { ...acc, isOn: a.on ?? !acc.isOn };
              return acc;
            }, d);
          });

          return {
            devices,
            activeSceneId: sceneId,
            lastSceneRun: { sceneId, ts: Date.now() },
          };
        }),

      clearActiveScene: () =>
        set(() => ({
          activeSceneId: null,
        })),

      addScene: (scene) =>
        set((state) => ({
          scenes: [...state.scenes, { ...scene, id: `s${Date.now()}` }],
        })),

      updateScene: (sceneId, patch) =>
        set((state) => ({
          scenes: state.scenes.map((scene) =>
            scene.id === sceneId ? { ...scene, ...patch } : scene,
          ),
        })),

      addFlow: (flow) =>
        set((state) => ({
          flows: [...state.flows, { ...flow, id: `f${Date.now()}` }],
        })),

      updateFlow: (flowId, patch) =>
        set((state) => ({
          flows: state.flows.map((f) =>
            f.id === flowId ? { ...f, ...patch } : f,
          ),
        })),

      toggleFlow: (flowId) =>
        set((state) => ({
          flows: state.flows.map((f) =>
            f.id === flowId ? { ...f, enabled: !f.enabled } : f,
          ),
        })),

      removeFlow: (flowId) =>
        set((state) => ({
          flows: state.flows.filter((f) => f.id !== flowId),
        })),

      setIntegrationStatus: (provider, status) =>
        set((state) => ({
          integrations: {
            ...state.integrations,
            [provider]: {
              ...state.integrations[provider],
              status,
              ...(status === "not-linked"
                ? { accountName: undefined, linkedAt: undefined }
                : {}),
            },
          },
        })),

      linkIntegration: (provider, accountName) =>
        set((state) => ({
          integrations: {
            ...state.integrations,
            [provider]: {
              status: "linked",
              accountName,
              linkedAt: Date.now(),
              lastSyncAt: Date.now(),
            },
          },
        })),

      unlinkIntegration: (provider) =>
        set((state) => ({
          integrations: {
            ...state.integrations,
            [provider]: { status: "not-linked" },
          },
        })),

      resyncIntegration: (provider) =>
        set((state) => ({
          integrations: {
            ...state.integrations,
            [provider]: {
              ...state.integrations[provider],
              lastSyncAt: Date.now(),
            },
          },
        })),
    }),
    {
      name: "vantahome-store",
      version: 4,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== "object")
          return {} as HomeState;
        const state = persistedState as HomeState;
        if (version && version >= 4) return state;
        const base =
          version && version >= 2
            ? state
            : {
                ...state,
                rooms: mergeById(state.rooms, roomsSeed),
                devices: mergeById(state.devices, devicesSeed),
                scenes: mergeById(state.scenes, scenesSeed),
              };
        return {
          ...base,
          household: base.household ?? householdSeed,
          roomMembers: base.roomMembers ?? roomMembersSeed,
          memberPermissionOverrides: base.memberPermissionOverrides ?? [],
          activeMemberId:
            base.activeMemberId ??
            base.household?.[0]?.id ??
            activeMemberSeed,
        };
      },
      // Only persist user-facing state to keep storage light and migration-safe.
      partialize: (state) => ({
        userName: state.userName,
        profile: state.profile,
        outdoor: state.outdoor,
        indoor: state.indoor,
        rooms: state.rooms,
        devices: state.devices,
        scenes: state.scenes,
        activeSceneId: state.activeSceneId,
        rules: state.rules,
        flows: state.flows,
        integrations: state.integrations,
        preferences: state.preferences,
        realtime: state.realtime,
        household: state.household,
        roomMembers: state.roomMembers,
        memberPermissionOverrides: state.memberPermissionOverrides,
        activeMemberId: state.activeMemberId,
      }),
    },
  ),
);
