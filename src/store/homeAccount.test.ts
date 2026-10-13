import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  hydrateHomeAccount,
  invalidateHomeMembership,
  selectVisibleDevices,
  useHomeStore,
} from "./useHomeStore";
import {
  applyMembershipSnapshot,
  type MembershipSyncResult,
} from "../services/membership";
import { authorizeLocalDeviceCommand } from "../security/localCommandAuthorization";
import { DEVICES, ROOMS } from '../../packages/home-scene/src/data';

const snapshot = (
  userId: string,
  homeId = `${userId}-home`,
): MembershipSyncResult => ({
  homeId,
  activeMemberId: userId,
  household: [{ id: userId, name: userId, role: "Owner", status: "home" }],
  roomMembers: [],
  permissionOverrides: [],
  rooms: [{ id: `${userId}-room`, name: "Room" }],
  devices: [
    {
      id: `${userId}-camera`,
      name: "Camera",
      kind: "camera",
      roomId: `${userId}-room`,
      isOn: true,
      streamUrl: "https://camera.example.test/live?token=test",
    },
  ],
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await hydrateHomeAccount(null);
});

test.each(['{broken', '{"state":null}', '{"state":{"profile":null},"version":6}', '{"state":{"devices":{}},"version":6}',
  '{"state":{"profile":{"name":7}},"version":6}', '{"state":{"preferences":{"notifications":"false"}},"version":6}',
  '{"state":{"accountUserId":"bob"},"version":6}'])(
  'keeps malformed account cache intact and blocks writes until validated retry: %s', async (raw) => {
    const key = 'vantahome-store:user:alice';
    await AsyncStorage.setItem(key, raw);
    await expect(hydrateHomeAccount('alice')).rejects.toMatchObject({ reason: 'corrupt' });
    expect(useHomeStore.getState().membershipReady).toBe(false);
    await useHomeStore.setState({ userName: 'Do not overwrite unread data' });
    expect(await AsyncStorage.getItem(key)).toBe(raw);
    const original = JSON.stringify({ version: 6, state: { accountUserId: 'alice', userName: 'Restored Alice', preferences: { haptics: false, notifications: false } } });
    await AsyncStorage.setItem(key, original);
    expect(await hydrateHomeAccount('alice')).toBe(true);
    expect(useHomeStore.getState().userName).toBe('Restored Alice');
    expect(useHomeStore.getState().preferences).toEqual({ haptics: false, notifications: false });
    await useHomeStore.setState({ userName: 'Saved after recovery' });
    expect(await AsyncStorage.getItem(key)).toContain('Saved after recovery');
  },
);

test('surfaces transient account storage errors instead of treating unread data as missing', async () => {
  const key = 'vantahome-store:user:alice';
  const original = JSON.stringify({ version: 6, state: { accountUserId: 'alice', userName: 'Original Alice' } });
  await AsyncStorage.setItem(key, original);
  const read = (AsyncStorage.getItem as jest.Mock).getMockImplementation()!;
  const failure = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((name) => name === key ? Promise.reject(new Error('temporarily locked')) : read(name));
  try {
    await expect(hydrateHomeAccount('alice')).rejects.toMatchObject({ reason: 'unavailable' });
    await useHomeStore.setState({ userName: 'Unsaved defaults' });
    expect(await read(key)).toBe(original);
  } finally { failure.mockImplementation(read); }
  expect(await hydrateHomeAccount('alice')).toBe(true);
  expect(useHomeStore.getState().userName).toBe('Original Alice');
});

test('a confirmed missing account cache allows a first save and keeps a different account at defaults', async () => {
  await hydrateHomeAccount('alice');
  applyMembershipSnapshot(snapshot('alice'));
  await useHomeStore.getState().setProfile({ name: 'First Alice' });
  await useHomeStore.setState({ preferences: { haptics: false, notifications: false } });
  expect(await AsyncStorage.getItem('vantahome-store:user:alice')).toContain('First Alice');
  await hydrateHomeAccount('bob');
  expect(useHomeStore.getState().preferences).toEqual({ haptics: true, notifications: true });
});

test('a delayed legacy cleanup cannot overwrite a newer demo session', async () => {
  const key = 'vantahome-store';
  const legacy = JSON.stringify({ version: 6, state: { accountUserId: null, userName: 'Old demo', devices: [snapshot('demo').devices[0]] } });
  await AsyncStorage.setItem(key, legacy);
  const read = (AsyncStorage.getItem as jest.Mock).getMockImplementation()!;
  let release!: (value: string | null) => void;
  let delayed = false;
  const mock = jest.spyOn(AsyncStorage, 'getItem').mockImplementation((name) => {
    if (name === key && !delayed) { delayed = true; return new Promise((resolve) => { release = resolve; }); }
    return read(name);
  });
  try {
    const earlier = hydrateHomeAccount('alice');
    await hydrateHomeAccount(null, true);
    await useHomeStore.setState({ userName: 'Newer demo edits' });
    const latest = await read(key);
    release(legacy);
    expect(await earlier).toBe(false);
    expect(await read(key)).toBe(latest);
    expect(useHomeStore.getState().userName).toBe('Newer demo edits');
  } finally { mock.mockImplementation(read); }
});

test("logout clears private data synchronously; another account cannot restore it", async () => {
  await hydrateHomeAccount("alice");
  applyMembershipSnapshot(snapshot("alice"));
  useHomeStore
    .getState()
    .setProfile({ name: "Alice", email: "alice@example.test" });
  const logout = hydrateHomeAccount(null);
  expect(useHomeStore.getState().devices).toEqual([]);
  expect(useHomeStore.getState().profile.email).toBeUndefined();
  expect(useHomeStore.getState().flows).toEqual([]);
  await logout;
  await hydrateHomeAccount("bob");
  expect(selectVisibleDevices(useHomeStore.getState())).toEqual([]);
  applyMembershipSnapshot(snapshot("bob"));
  expect(
    selectVisibleDevices(useHomeStore.getState()).map((device) => device.id),
  ).toEqual(["bob-camera"]);
});

test("separate account caches retain local automation but do not persist camera URLs", async () => {
  await hydrateHomeAccount("alice");
  applyMembershipSnapshot(snapshot("alice"));
  useHomeStore
    .getState()
    .addFlow({
      name: "Evening",
      enabled: false,
      triggers: [],
      conditions: [],
      actions: [],
    });
  await hydrateHomeAccount(null);
  const saved = await AsyncStorage.getItem("vantahome-store:user:alice");
  expect(saved).toContain("Evening");
  expect(saved).not.toContain("token=test");
  await hydrateHomeAccount("bob");
  expect(useHomeStore.getState().flows).toEqual([]);
  await hydrateHomeAccount("alice");
  expect(useHomeStore.getState().flows[0].name).toBe("Evening");
  expect(selectVisibleDevices(useHomeStore.getState())).toEqual([]);
  expect(useHomeStore.getState().activeMemberId).toBe("");
});

test("late membership from a previous identity cannot install a policy or registry", async () => {
  await hydrateHomeAccount("bob");
  expect(applyMembershipSnapshot(snapshot("alice"))).toBe(false);
  expect(useHomeStore.getState().devices).toEqual([]);
});

test("revocation removes local authorization and never falls back to another owner", async () => {
  await hydrateHomeAccount("alice");
  applyMembershipSnapshot(snapshot("alice"));
  invalidateHomeMembership();
  expect(selectVisibleDevices(useHomeStore.getState())).toEqual([]);
  expect(
    authorizeLocalDeviceCommand({
      op: "toggle",
      deviceId: "alice-camera",
      on: true,
    }).allowed,
  ).toBe(false);
  useHomeStore.setState({
    household: [{ id: "other", name: "Other", role: "Owner", status: "home" }],
    membershipReady: true,
    activeMemberId: "missing",
  });
  expect(selectVisibleDevices(useHomeStore.getState())).toEqual([]);
});

test("membership snapshot installs explicit permission overrides atomically", async () => {
  await hydrateHomeAccount("alice");
  const result = snapshot("alice");
  result.household[0].role = "Admin";
  result.permissionOverrides = [
    { memberId: "alice", permission: "camera.live", allowed: false },
  ];
  applyMembershipSnapshot(result);
  expect(useHomeStore.getState().memberPermissionOverrides).toEqual(
    result.permissionOverrides,
  );
  expect(selectVisibleDevices(useHomeStore.getState())).toEqual([]);
});

test("a delayed registry snapshot cannot roll back a newer live observation", async () => {
  await hydrateHomeAccount("alice");
  const initial = snapshot("alice");
  initial.devices[0].observedAt = 100;
  applyMembershipSnapshot(initial);
  useHomeStore
    .getState()
    .setDevice("alice-camera", { isOn: false, observedAt: 300 });
  const older = snapshot("alice");
  older.devices[0].name = "Renamed camera";
  older.devices[0].observedAt = 200;
  applyMembershipSnapshot(older);
  expect(useHomeStore.getState().devices[0]).toMatchObject({
    name: "Renamed camera",
    isOn: false,
    observedAt: 300,
  });
});

test("membership refresh retains air-quality history while adding newer observations", async () => {
  await hydrateHomeAccount("alice");
  const first = snapshot("alice");
  first.devices = [
    {
      id: "air",
      kind: "air",
      roomId: "alice-room",
      name: "Air",
      isOn: true,
      airQualityIndex: 20,
      observedAt: 1000,
    },
  ];
  applyMembershipSnapshot(first);
  const next = snapshot("alice");
  next.devices = [
    { ...first.devices[0], airQualityIndex: 30, observedAt: 2000 },
  ];
  applyMembershipSnapshot(next);
  expect(
    useHomeStore.getState().devices[0].airHistory?.map((sample) => sample.aqi),
  ).toEqual([20, 30]);
});

test("the explicitly selected demo remains available without an account", async () => {
  await hydrateHomeAccount(null, true);
  const state = useHomeStore.getState();
  expect(state.modelCatalogVersion).toBe(1);
  expect(state.rooms).toEqual(ROOMS.map(({ id, name }) => ({ id, name })));
  expect(selectVisibleDevices(state).map(({ id, name, roomId, kind }) => ({ id, name, roomId, kind })))
    .toEqual(DEVICES.map(({ id, name, roomId, kind }) => ({ id, name, roomId, kind })));
  expect(state.devices.filter((device) => device.kind === 'camera').map((device) => device.id))
    .toEqual(['entry-camera', 'drive-camera', 'terrace-camera']);
  const cache = JSON.parse((await AsyncStorage.getItem('vantahome-store'))!);
  expect(cache.state.modelCatalogVersion).toBe(1);
  expect(cache.state.devices).toHaveLength(92);
});

test('a model demo survives reopening without leaking its catalog into an account', async () => {
  await hydrateHomeAccount(null, true);
  const first = useHomeStore.getState();
  await hydrateHomeAccount(null, true);
  expect(useHomeStore.getState().sessionEpoch).toBeGreaterThan(first.sessionEpoch);
  expect(useHomeStore.getState().devices.map((device) => device.id)).toEqual(first.devices.map((device) => device.id));
  await hydrateHomeAccount('real-owner');
  expect(useHomeStore.getState().modelCatalogVersion).toBeUndefined();
  expect(useHomeStore.getState().modelCatalogArchive).toBeUndefined();
  expect(useHomeStore.getState().devices).toEqual([]);
  applyMembershipSnapshot(snapshot('real-owner'));
  expect(useHomeStore.getState().devices.map((device) => device.id)).toEqual(['real-owner-camera']);
});

test("legacy cache migration removes camera URLs without losing unowned automations", async () => {
  await AsyncStorage.setItem(
    "vantahome-store",
    JSON.stringify({
      version: 4,
      state: {
        devices: snapshot("alice").devices,
        flows: [{ id: "old-flow", name: "Saved locally", enabled: false, triggers: [], conditions: [], actions: [] }],
      },
    }),
  );
  await hydrateHomeAccount("bob");
  const legacy = await AsyncStorage.getItem("vantahome-store");
  expect(legacy).toContain("Saved locally");
  expect(legacy).not.toContain("token=test");
  expect(useHomeStore.getState().flows).toEqual([]);
});

test("an old hydration cannot overwrite a newer session, even when returning to the first account", async () => {
  const originalGet = (
    AsyncStorage.getItem as jest.Mock
  ).getMockImplementation()!;
  let release: (value: string | null) => void = () => {};
  let pendingRead = false;
  const spy = jest.spyOn(AsyncStorage, "getItem").mockImplementation((key) => {
    if (key === "vantahome-store:user:alice" && !pendingRead) {
      pendingRead = true;
      return new Promise((resolve) => {
        release = resolve;
      });
    }
    return originalGet(key);
  });
  const first = hydrateHomeAccount("alice");
  for (let turn = 0; turn < 20 && !pendingRead; turn += 1) await Promise.resolve();
  expect(pendingRead).toBe(true);
  await hydrateHomeAccount("bob");
  await hydrateHomeAccount("alice");
  applyMembershipSnapshot(snapshot("alice"));
  useHomeStore.getState().setProfile({ name: "Current Alice" });
  release(
    JSON.stringify({
      version: 5,
      state: { accountUserId: "alice", profile: { name: "Outdated Alice" } },
    }),
  );
  await first;
  expect(useHomeStore.getState().profile.name).toBe("Current Alice");
  expect(useHomeStore.getState().membershipReady).toBe(true);
  spy.mockImplementation(originalGet);
});


test('verification state is never restored from cache or treated as authorization', async () => {
  await hydrateHomeAccount('alice');
  applyMembershipSnapshot(snapshot('alice'));
  invalidateHomeMembership('checking');
  expect(useHomeStore.getState().membershipVerification).toBe('checking');
  expect(authorizeLocalDeviceCommand({ op: 'toggle', deviceId: 'alice-camera', on: true }).allowed).toBe(false);
  const partial = useHomeStore.persist.getOptions().partialize!(useHomeStore.getState());
  expect(partial).not.toHaveProperty('membershipVerification');
  const merged = useHomeStore.persist.getOptions().merge!({
    accountUserId: 'alice',
    membershipReady: true,
    membershipVerification: 'checking',
    activeHomeId: 'alice-home',
  }, useHomeStore.getState());
  expect(merged.membershipReady).toBe(false);
  expect(merged.membershipVerification).toBe('idle');
  expect(merged.activeHomeId).toBeNull();
  await hydrateHomeAccount('bob');
  expect(useHomeStore.getState().membershipVerification).toBe('idle');
});
