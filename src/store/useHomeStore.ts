import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';

export const AC_TEMP_MIN_C = 15;
export const AC_TEMP_MAX_C = 28;

export type DeviceMode = 'cold' | 'fan' | 'dry';

export type DeviceKind =
  | 'ac'
  | 'light'
  | 'tv'
  | 'coffee'
  | 'fridge'
  | 'gate'
  | 'garage'
  | 'fan'
  | 'door'
  | 'vacuum'
  | 'camera'
  | 'window'
  | 'stove'
  | 'washer'
  | 'dryer'
  | 'microwave'
  | 'energy'
  | 'water'
  | 'air'
  | 'sprinkler'
  | 'speaker'
  | 'smoke';

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

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

  // Shared controls
  tempC?: number;
  mode?: DeviceMode;
  brightness?: number; // lights
  volume?: number; // tv
  color?: string;
  colorTempK?: number;
  lightEffect?: 'focus' | 'relax' | 'sunset' | 'party';
  adaptiveLighting?: boolean;
  motionBoost?: boolean;
  nightShift?: boolean;
  autoOffMin?: number;
  autoOpenEnabled?: boolean;
  channel?: number;
  muted?: boolean;
  source?: string;

  // Extra per-kind fields
  speed?: number; // fan
  openPercent?: number; // garage/door/window
  status?: 'docked' | 'cleaning' | 'paused'; // vacuum
  battery?: number; // vacuum
  armed?: boolean; // camera
  recording?: boolean; // camera
  nightVision?: boolean; // camera
  motionAlerts?: boolean; // camera
  motionSensitivity?: number; // camera
  micMuted?: boolean; // camera
  twoWayAudio?: boolean; // camera
  burnerLevel?: number; // stove
  cycle?: string; // washer/dryer
  progress?: number; // washer/dryer
  timeRemainingSec?: number; // microwave
  powerW?: number; // energy monitor
  energyTodayKwh?: number; // energy monitor
  energyPeakW?: number; // energy monitor
  energyMonthKwh?: number; // energy monitor
  energyCostToday?: number; // energy monitor
  energyBudgetKwh?: number; // energy monitor
  waterLpm?: number; // water meter
  waterTodayL?: number; // water meter
  waterPressurePsi?: number; // water meter
  waterTempC?: number; // water meter
  waterLeakDetected?: boolean; // water meter
  waterLeakAlerts?: boolean; // water meter
  waterAutoShutoff?: boolean; // water meter
  waterBudgetL?: number; // water meter
  airQualityIndex?: number; // air quality
  humidity?: number; // air quality
  zone?: string; // sprinkler
  durationMin?: number; // sprinkler
  smokeDetected?: boolean; // smoke alarm
  schedule?: SprinklerSchedule[]; // sprinkler
};

export type Room = { id: string; name: string };

export type HouseholdMember = {
  id: string;
  name: string;
  role: 'Owner' | 'Admin' | 'Guest';
  avatarColor?: string;
  avatarUri?: string;
  status: 'home' | 'away';
  lastSeenAt?: number;
};

export type SceneAction =
  | { type: 'patch'; deviceId: string; patch: Partial<Device> }
  | { type: 'toggle'; deviceId: string; on?: boolean };

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
  trigger: { type: 'time'; hour: number; minute: number };
  action:
    | { type: 'toggle'; deviceId: string; on: boolean }
    | { type: 'set-ac'; deviceId: string; tempC: number; mode: DeviceMode };
};

export type FlowTrigger =
  | { type: 'time'; hour: number; minute: number }
  | { type: 'device'; deviceId: string; state: 'on' | 'off' }
  | { type: 'scene'; sceneId: string }
  | { type: 'presence'; memberId: string; status: HouseholdMember['status'] };

export type FlowCondition =
  | { type: 'time-range'; startHour: number; startMinute: number; endHour: number; endMinute: number }
  | { type: 'device'; deviceId: string; state: 'on' | 'off' }
  | { type: 'day'; days: Weekday[] };

export type FlowAction =
  | { type: 'toggle'; deviceId: string; on: boolean }
  | { type: 'set-ac'; deviceId: string; tempC: number; mode: DeviceMode }
  | { type: 'set-brightness'; deviceId: string; brightness: number }
  | { type: 'run-scene'; sceneId: string }
  | { type: 'delay'; seconds: number }
  | { type: 'notify'; message: string };

export type AutomationFlow = {
  id: string;
  name: string;
  enabled: boolean;
  triggers: FlowTrigger[];
  conditions: FlowCondition[];
  actions: FlowAction[];
};

export type IntegrationProvider = 'alexa' | 'google' | 'homekit' | 'matter';

type IntegrationState = {
  status: 'not-linked' | 'linking' | 'linked' | 'error';
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
};

type Profile = {
  name: string;
  email?: string;
  phone?: string;
  homeName?: string;
  avatarColor?: string;
  avatarUri?: string;
  timeFormat?: '12h' | '24h';
  tempUnit?: 'C' | 'F';
  timezone?: string;
};

type State = {
  userName: string;
  profile: Profile;
  outdoor: { tempC: number; label: string };
  indoor: { tempC: number; label: string };
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

  addRoom: (name: string) => void;
  renameRoom: (roomId: string, name: string) => void;
  moveRoom: (roomId: string, direction: -1 | 1) => void;
  removeRoom: (roomId: string) => void;
  setProfile: (patch: Partial<Profile>) => void;
  setPreferences: (patch: Partial<Preferences>) => void;
  setRealtime: (patch: Partial<RealtimeSettings>) => void;
  setDevice: (deviceId: string, patch: Partial<Device>) => void;
  setAC: (deviceId: string, patch: Partial<Device>) => void;
  toggleDevice: (deviceId: string) => void;
  addDevice: (device: Omit<Device, 'id'> & { id?: string }) => void;
  removeDevice: (deviceId: string) => void;
  addHouseholdMember: (member: Omit<HouseholdMember, 'id'> & { id?: string }) => void;
  updateHouseholdMember: (memberId: string, patch: Partial<HouseholdMember>) => void;
  removeHouseholdMember: (memberId: string) => void;
  setHouseholdPresence: (memberId: string, status: HouseholdMember['status']) => void;

  addRule: (rule: Omit<AutomationRule, 'id'>) => void;
  toggleRule: (ruleId: string) => void;
  updateRule: (ruleId: string, patch: Partial<AutomationRule>) => void;
  removeRule: (ruleId: string) => void;
  quickScheduleDevice: (deviceId: string, time: { hour: number; minute: number }) => void;
  runScene: (sceneId: string) => void;
  addScene: (scene: Omit<Scene, 'id'>) => void;
  addFlow: (flow: Omit<AutomationFlow, 'id'>) => void;
  updateFlow: (flowId: string, patch: Partial<AutomationFlow>) => void;
  toggleFlow: (flowId: string) => void;
  removeFlow: (flowId: string) => void;

  setIntegrationStatus: (provider: IntegrationProvider, status: IntegrationState['status']) => void;
  linkIntegration: (provider: IntegrationProvider, accountName?: string) => void;
  unlinkIntegration: (provider: IntegrationProvider) => void;
  resyncIntegration: (provider: IntegrationProvider) => void;
};

// Demo data to keep the UI populated before a real backend is wired up.
const profileSeed: Profile = {
  name: 'Alex',
  email: 'alex@example.com',
  phone: '',
  homeName: 'Vanta Home',
  avatarColor: '#B46BFF',
  avatarUri: '',
  timeFormat: '12h',
  tempUnit: 'C',
  timezone: 'Auto',
};

const outdoorSeed = { tempC: 24, label: 'Sunny' };
const indoorSeed = { tempC: 22, label: 'Indoor' };

const roomsSeed: Room[] = [
  { id: 'r1', name: 'Drawing Room' },
  { id: 'r2', name: 'Bedroom' },
  { id: 'r3', name: 'Kitchen' },
];

const householdSeed: HouseholdMember[] = [
  { id: 'm1', name: 'Alex Carter', role: 'Owner', status: 'home', avatarColor: '#B46BFF' },
  { id: 'm2', name: 'Jamie Parker', role: 'Admin', status: 'away', avatarColor: '#7A5CFF' },
  { id: 'm3', name: 'Sky Ren', role: 'Guest', status: 'away', avatarColor: '#A0E9FF' },
];

const devicesSeed: Device[] = [
  { id: 'd1', name: 'Air Conditioner', kind: 'ac', roomId: 'r1', isOn: true, tempC: 22, mode: 'cold' },
  { id: 'd2', name: 'Light', kind: 'light', roomId: 'r1', isOn: true, brightness: 70, color: '#FFD166' },
  { id: 'd3', name: 'TV', kind: 'tv', roomId: 'r1', isOn: false, volume: 30, channel: 5, source: 'Live TV' },
  { id: 'd4', name: 'Coffee', kind: 'coffee', roomId: 'r1', isOn: false },
  { id: 'd26', name: 'Front Gate', kind: 'gate', roomId: 'r1', isOn: false, openPercent: 0, autoOpenEnabled: true },

  { id: 'd5', name: 'Bed Light', kind: 'light', roomId: 'r2', isOn: false, brightness: 45, color: '#A0E9FF' },
  { id: 'd6', name: 'Bedroom AC', kind: 'ac', roomId: 'r2', isOn: true, tempC: 21, mode: 'cold' },
  { id: 'd7', name: 'Bedroom TV', kind: 'tv', roomId: 'r2', isOn: true, volume: 22, channel: 2, source: 'Live TV' },

  { id: 'd8', name: 'Kitchen Light', kind: 'light', roomId: 'r3', isOn: true, brightness: 85, color: '#FFFFFF' },
  { id: 'd9', name: 'Kitchen Coffee', kind: 'coffee', roomId: 'r3', isOn: true },

  { id: 'd10', name: 'Ceiling Fan', kind: 'fan', roomId: 'r3', isOn: true, speed: 60 },
  { id: 'd11', name: 'Refrigerator', kind: 'fridge', roomId: 'r3', isOn: true, tempC: 4 },
  { id: 'd12', name: 'Garage', kind: 'garage', roomId: 'r1', isOn: false, openPercent: 0 },
  { id: 'd13', name: 'Front Door', kind: 'door', roomId: 'r1', isOn: false, openPercent: 0 },
  { id: 'd14', name: 'Vacuum', kind: 'vacuum', roomId: 'r2', isOn: false, status: 'docked', battery: 86 },
  {
    id: 'd15',
    name: 'Entry Camera',
    kind: 'camera',
    roomId: 'r1',
    isOn: true,
    armed: true,
    recording: false,
    nightVision: true,
    motionAlerts: true,
    motionSensitivity: 6,
    micMuted: false,
    twoWayAudio: true,
  },
  { id: 'd16', name: 'Window', kind: 'window', roomId: 'r2', isOn: true, openPercent: 30 },
  { id: 'd17', name: 'Stove', kind: 'stove', roomId: 'r3', isOn: false, burnerLevel: 0 },
  { id: 'd18', name: 'Washer/Dryer', kind: 'washer', roomId: 'r2', isOn: false, cycle: 'Normal', progress: 0 },
  { id: 'd19', name: 'Microwave', kind: 'microwave', roomId: 'r3', isOn: false, timeRemainingSec: 0 },
  {
    id: 'd20',
    name: 'Energy Monitor',
    kind: 'energy',
    roomId: 'r1',
    isOn: true,
    powerW: 680,
    energyTodayKwh: 4.2,
    energyPeakW: 980,
    energyMonthKwh: 78,
    energyCostToday: 2.4,
    energyBudgetKwh: 120,
  },
  {
    id: 'd21',
    name: 'Water Meter',
    kind: 'water',
    roomId: 'r3',
    isOn: true,
    waterLpm: 8,
    waterTodayL: 120,
    waterPressurePsi: 52,
    waterTempC: 18,
    waterLeakDetected: false,
    waterLeakAlerts: true,
    waterAutoShutoff: false,
    waterBudgetL: 220,
  },
  { id: 'd22', name: 'Air Quality', kind: 'air', roomId: 'r2', isOn: true, airQualityIndex: 32, humidity: 44 },
  {
    id: 'd23',
    name: 'Sprinkler',
    kind: 'sprinkler',
    roomId: 'r1',
    isOn: false,
    zone: 'Front Yard',
    durationMin: 15,
    schedule: [{ id: 'sch1', hour: 6, minute: 0, days: ['Mon', 'Wed', 'Fri'], enabled: true }],
  },
  { id: 'd24', name: 'Smart Speaker', kind: 'speaker', roomId: 'r1', isOn: true, volume: 28 },
  { id: 'd25', name: 'Smoke/CO', kind: 'smoke', roomId: 'r2', isOn: true, smokeDetected: false },
];

const integrationsSeed: Record<IntegrationProvider, IntegrationState> = {
  alexa: { status: 'not-linked' },
  google: { status: 'not-linked' },
  homekit: { status: 'not-linked' },
  matter: { status: 'not-linked' },
};

const realtimeSeed: RealtimeSettings = {
  enabled: false,
  wsUrl: 'ws://localhost:8088',
};

const scenesSeed: Scene[] = [
  {
    id: 's1',
    roomId: 'r1',
    name: 'Movie Time',
    actions: [
      { type: 'patch', deviceId: 'd2', patch: { isOn: true, brightness: 20 } },
      { type: 'patch', deviceId: 'd3', patch: { isOn: true, volume: 18 } },
      { type: 'patch', deviceId: 'd1', patch: { isOn: true, tempC: 22, mode: 'cold' } },
    ],
  },
  {
    id: 's2',
    roomId: 'r1',
    name: 'Chill',
    actions: [{ type: 'patch', deviceId: 'd1', patch: { isOn: true, tempC: 21, mode: 'cold' } }],
  },
  {
    id: 's3',
    roomId: 'r1',
    name: 'All Off',
    actions: [
      { type: 'toggle', deviceId: 'd1', on: false },
      { type: 'toggle', deviceId: 'd2', on: false },
      { type: 'toggle', deviceId: 'd3', on: false },
      { type: 'toggle', deviceId: 'd4', on: false },
    ],
  },
  {
    id: 's4',
    roomId: 'r2',
    name: 'Sleep Mode',
    actions: [
      { type: 'patch', deviceId: 'd5', patch: { isOn: true, brightness: 15 } },
      { type: 'patch', deviceId: 'd6', patch: { isOn: true, tempC: 20, mode: 'cold' } },
      { type: 'toggle', deviceId: 'd7', on: false },
      { type: 'patch', deviceId: 'd16', patch: { openPercent: 10 } },
    ],
  },
  {
    id: 's5',
    roomId: 'r2',
    name: 'Wake Up',
    actions: [
      { type: 'patch', deviceId: 'd5', patch: { isOn: true, brightness: 60 } },
      { type: 'patch', deviceId: 'd6', patch: { isOn: true, tempC: 22, mode: 'fan' } },
      { type: 'toggle', deviceId: 'd7', on: true },
      { type: 'patch', deviceId: 'd16', patch: { openPercent: 40 } },
    ],
  },
  {
    id: 's6',
    roomId: 'r3',
    name: 'Morning Prep',
    actions: [
      { type: 'patch', deviceId: 'd8', patch: { isOn: true, brightness: 80 } },
      { type: 'toggle', deviceId: 'd9', on: true },
      { type: 'patch', deviceId: 'd10', patch: { isOn: true, speed: 55 } },
    ],
  },
  {
    id: 's7',
    roomId: 'r3',
    name: 'Cooking',
    actions: [
      { type: 'patch', deviceId: 'd8', patch: { isOn: true, brightness: 90 } },
      { type: 'patch', deviceId: 'd10', patch: { isOn: true, speed: 75 } },
      { type: 'patch', deviceId: 'd17', patch: { isOn: true, burnerLevel: 3 } },
    ],
  },
  {
    id: 's8',
    roomId: 'r3',
    name: 'Kitchen Wind Down',
    actions: [
      { type: 'patch', deviceId: 'd8', patch: { isOn: true, brightness: 35 } },
      { type: 'toggle', deviceId: 'd9', on: false },
      { type: 'patch', deviceId: 'd10', patch: { isOn: true, speed: 35 } },
      { type: 'toggle', deviceId: 'd17', on: false },
    ],
  },
  {
    id: 's9',
    roomId: 'r1',
    name: 'Away Mode',
    actions: [
      { type: 'toggle', deviceId: 'd2', on: false },
      { type: 'toggle', deviceId: 'd3', on: false },
      { type: 'toggle', deviceId: 'd4', on: false },
      { type: 'patch', deviceId: 'd15', patch: { armed: true, motionAlerts: true, isOn: true } },
      { type: 'patch', deviceId: 'd12', patch: { isOn: false, openPercent: 0 } },
      { type: 'patch', deviceId: 'd13', patch: { isOn: false, openPercent: 0 } },
      { type: 'patch', deviceId: 'd26', patch: { isOn: false, openPercent: 0 } },
    ],
  },
  {
    id: 's10',
    roomId: 'r1',
    name: 'Welcome Home',
    actions: [
      { type: 'patch', deviceId: 'd1', patch: { isOn: true, tempC: 22, mode: 'cold' } },
      { type: 'patch', deviceId: 'd2', patch: { isOn: true, brightness: 75, color: '#FFD166' } },
      { type: 'toggle', deviceId: 'd3', on: true },
      { type: 'patch', deviceId: 'd15', patch: { armed: false, motionAlerts: false } },
      { type: 'patch', deviceId: 'd26', patch: { isOn: true, openPercent: 100 } },
    ],
  },
  {
    id: 's11',
    roomId: 'r2',
    name: 'Night Wind Down',
    actions: [
      { type: 'patch', deviceId: 'd5', patch: { isOn: true, brightness: 20, color: '#B69CFF' } },
      { type: 'patch', deviceId: 'd6', patch: { isOn: true, tempC: 21, mode: 'cold' } },
      { type: 'toggle', deviceId: 'd7', on: false },
      { type: 'patch', deviceId: 'd16', patch: { openPercent: 10 } },
    ],
  },
  {
    id: 's12',
    roomId: 'r3',
    name: 'Kitchen Party',
    actions: [
      { type: 'patch', deviceId: 'd8', patch: { isOn: true, brightness: 90, color: '#B69CFF' } },
      { type: 'toggle', deviceId: 'd9', on: true },
      { type: 'patch', deviceId: 'd10', patch: { isOn: true, speed: 70 } },
      { type: 'patch', deviceId: 'd17', patch: { isOn: true, burnerLevel: 2 } },
    ],
  },
  {
    id: 's13',
    roomId: 'r2',
    name: 'Clean Sweep',
    actions: [
      { type: 'patch', deviceId: 'd14', patch: { isOn: true, status: 'cleaning' } },
      { type: 'patch', deviceId: 'd16', patch: { openPercent: 40 } },
      { type: 'toggle', deviceId: 'd5', on: false },
    ],
  },
];

const rulesSeed: AutomationRule[] = [
  {
    id: 'a1',
    name: 'Night Cool',
    enabled: true,
    trigger: { type: 'time', hour: 21, minute: 0 },
    action: { type: 'set-ac', deviceId: 'd1', tempC: 22, mode: 'cold' },
  },
  {
    id: 'a2',
    name: 'Morning Boost',
    enabled: true,
    trigger: { type: 'time', hour: 6, minute: 30 },
    action: { type: 'set-ac', deviceId: 'd6', tempC: 21, mode: 'cold' },
  },
  {
    id: 'a3',
    name: 'Coffee Start',
    enabled: true,
    trigger: { type: 'time', hour: 7, minute: 0 },
    action: { type: 'toggle', deviceId: 'd9', on: true },
  },
  {
    id: 'a4',
    name: 'Evening Lights',
    enabled: true,
    trigger: { type: 'time', hour: 18, minute: 30 },
    action: { type: 'toggle', deviceId: 'd2', on: true },
  },
  {
    id: 'a5',
    name: 'Night Lockdown',
    enabled: true,
    trigger: { type: 'time', hour: 23, minute: 30 },
    action: { type: 'toggle', deviceId: 'd26', on: false },
  },
  {
    id: 'a6',
    name: 'Sprinkler Morning',
    enabled: false,
    trigger: { type: 'time', hour: 6, minute: 15 },
    action: { type: 'toggle', deviceId: 'd23', on: true },
  },
];

const flowsSeed: AutomationFlow[] = [
  {
    id: 'f1',
    name: 'Arrive Home',
    enabled: true,
    triggers: [{ type: 'presence', memberId: 'm1', status: 'home' }],
    conditions: [{ type: 'time-range', startHour: 17, startMinute: 0, endHour: 23, endMinute: 30 }],
    actions: [
      { type: 'toggle', deviceId: 'd2', on: true },
      { type: 'set-ac', deviceId: 'd1', tempC: 22, mode: 'cold' },
      { type: 'run-scene', sceneId: 's10' },
    ],
  },
  {
    id: 'f2',
    name: 'Morning Wake',
    enabled: true,
    triggers: [{ type: 'time', hour: 7, minute: 0 }],
    conditions: [{ type: 'day', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] }],
    actions: [
      { type: 'set-brightness', deviceId: 'd5', brightness: 60 },
      { type: 'set-ac', deviceId: 'd6', tempC: 21, mode: 'cold' },
    ],
  },
  {
    id: 'f3',
    name: 'Movie Ready',
    enabled: false,
    triggers: [{ type: 'scene', sceneId: 's1' }],
    conditions: [{ type: 'device', deviceId: 'd3', state: 'on' }],
    actions: [
      { type: 'set-brightness', deviceId: 'd2', brightness: 20 },
      { type: 'notify', message: 'Movie time on.' },
    ],
  },
];

export const useHomeStore = create<State>()(
  persist(
    (set, get) => ({
  userName: 'Alex',
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
      rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, name: trimmed } : r)),
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
        d.roomId === roomId ? { ...d, roomId: fallbackRoom.id } : d
      );
      const scenes = state.scenes.filter((s) => s.roomId !== roomId);
      return { rooms: remaining, devices, scenes };
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
      devices: state.devices.map((d) => (d.id === deviceId ? { ...d, ...patch } : d)),
    })),

  setAC: (deviceId, patch) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId ? { ...d, ...patch, isOn: patch.isOn ?? true } : d
      ),
    })),

  toggleDevice: (deviceId) =>
    set((state) => ({
      devices: state.devices.map((d) => (d.id === deviceId ? { ...d, isOn: !d.isOn } : d)),
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
    set((state) => ({ household: [...state.household, { ...member, id }] }));
  },

  updateHouseholdMember: (memberId, patch) =>
    set((state) => ({
      household: state.household.map((m) => (m.id === memberId ? { ...m, ...patch } : m)),
    })),

  removeHouseholdMember: (memberId) =>
    set((state) => ({
      household: state.household.filter((m) => m.id !== memberId),
    })),

  setHouseholdPresence: (memberId, status) =>
    set((state) => ({
      household: state.household.map((m) =>
        m.id === memberId ? { ...m, status, lastSeenAt: Date.now() } : m
      ),
    })),

  addRule: (rule) =>
    set((state) => ({
      rules: [...state.rules, { ...rule, id: `a${Date.now()}` }],
    })),

  toggleRule: (ruleId) =>
    set((state) => ({
      rules: state.rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
    })),

  updateRule: (ruleId, patch) =>
    set((state) => ({
      rules: state.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    })),

  removeRule: (ruleId) =>
    set((state) => ({
      rules: state.rules.filter((r) => r.id !== ruleId),
    })),

  quickScheduleDevice: (deviceId, time) => {
    const d = get().devices.find((x) => x.id === deviceId);
    if (!d) return;

    const hh = String(time.hour).padStart(2, '0');
    const mm = String(time.minute).padStart(2, '0');

    // AC needs temperature/mode; everything else can use a simple toggle rule.
    if (d.kind === 'ac') {
      get().addRule({
        name: `${d.name} → ${hh}:${mm}`,
        enabled: true,
        trigger: { type: 'time', hour: time.hour, minute: time.minute },
        action: { type: 'set-ac', deviceId, tempC: d.tempC ?? AC_TEMP_MIN_C, mode: d.mode ?? 'cold' },
      });
    } else {
      get().addRule({
        name: `${d.name} ON @ ${hh}:${mm}`,
        enabled: true,
        trigger: { type: 'time', hour: time.hour, minute: time.minute },
        action: { type: 'toggle', deviceId, on: true },
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
          if (a.type === 'patch') return { ...acc, ...a.patch };
          if (a.type === 'toggle') return { ...acc, isOn: a.on ?? !acc.isOn };
          return acc;
        }, d);
      });

      return { devices, activeSceneId: sceneId, lastSceneRun: { sceneId, ts: Date.now() } };
    }),

  addScene: (scene) =>
    set((state) => ({
      scenes: [...state.scenes, { ...scene, id: `s${Date.now()}` }],
    })),

  addFlow: (flow) =>
    set((state) => ({
      flows: [...state.flows, { ...flow, id: `f${Date.now()}` }],
    })),

  updateFlow: (flowId, patch) =>
    set((state) => ({
      flows: state.flows.map((f) => (f.id === flowId ? { ...f, ...patch } : f)),
    })),

  toggleFlow: (flowId) =>
    set((state) => ({
      flows: state.flows.map((f) => (f.id === flowId ? { ...f, enabled: !f.enabled } : f)),
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
          ...(status === 'not-linked' ? { accountName: undefined, linkedAt: undefined } : {}),
        },
      },
    })),

  linkIntegration: (provider, accountName) =>
    set((state) => ({
      integrations: {
        ...state.integrations,
        [provider]: {
          status: 'linked',
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
        [provider]: { status: 'not-linked' },
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
      name: 'vantahome-store',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') return {} as State;
        return persistedState as State;
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
      }),
    }
  )
);
