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
  expect(selectVisibleDevices(useHomeStore.getState()).length).toBeGreaterThan(
    0,
  );
});

test("legacy cache migration removes camera URLs without losing unowned automations", async () => {
  await AsyncStorage.setItem(
    "vantahome-store",
    JSON.stringify({
      version: 4,
      state: {
        devices: snapshot("alice").devices,
        flows: [{ id: "old-flow", name: "Saved locally" }],
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
  while (!pendingRead) await Promise.resolve();
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
  spy.mockRestore();
});
