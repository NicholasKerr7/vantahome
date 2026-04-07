import {
  selectCanManageHousehold,
  selectCanManageSecurity,
  selectControllableDevices,
  selectVisibleDevices,
  selectVisibleFlows,
  selectVisibleRules,
  selectRunnableScenes,
  selectVisibleScenes,
  useHomeStore,
  type AutomationFlow,
  type AutomationRule,
  type Device,
  type Scene,
  type Room,
} from "./useHomeStore";

function cloneRooms(rooms: Room[]) {
  return rooms.map((r) => ({ ...r }));
}

function cloneDevices(devices: Device[]) {
  return devices.map((d) => ({ ...d }));
}

function cloneRules(rules: AutomationRule[]) {
  return rules.map((r) => ({
    ...r,
    trigger: { ...r.trigger },
    action: { ...(r.action as any) },
  }));
}

function cloneFlows(flows: AutomationFlow[]) {
  return flows.map((f) => ({
    ...f,
    triggers: f.triggers.map((t) => ({ ...t })),
    conditions: f.conditions.map((c) => ({ ...c })),
    actions: f.actions.map((a) => ({ ...a })),
  }));
}

function cloneScenes(scenes: Scene[]) {
  return scenes.map((s) => ({
    ...s,
    actions: s.actions.map((a) => {
      if (a.type === "patch") return { ...a, patch: { ...a.patch } };
      return { ...a };
    }),
  }));
}

function cloneIntegrations(integrations: any) {
  const copy: any = {};
  Object.keys(integrations).forEach((k) => {
    copy[k] = { ...integrations[k] };
  });
  return copy;
}

// Snapshot the seed data once and reset between tests so store mutations don't leak.
const seed = useHomeStore.getState();

beforeEach(() => {
  useHomeStore.setState({
    userName: seed.userName,
    profile: { ...seed.profile },
    notifications: seed.notifications.map((notification) => ({
      ...notification,
    })),
    outdoor: { ...seed.outdoor },
    indoor: { ...seed.indoor },
    rooms: cloneRooms(seed.rooms),
    devices: cloneDevices(seed.devices),
    rules: cloneRules(seed.rules),
    flows: cloneFlows(seed.flows),
    scenes: cloneScenes(seed.scenes),
    activeSceneId: seed.activeSceneId,
    lastSceneRun: seed.lastSceneRun,
    integrations: cloneIntegrations(seed.integrations),
    preferences: { ...seed.preferences },
    realtime: { ...seed.realtime },
    household: seed.household.map((m) => ({ ...m })),
    roomMembers: seed.roomMembers.map((entry) => ({
      ...entry,
      roomIds: [...entry.roomIds],
    })),
    activeMemberId: seed.activeMemberId,
  });
});

describe("useHomeStore", () => {
  it("addRoom appends a new room with the provided name", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(123);
    const beforeLen = useHomeStore.getState().rooms.length;
    useHomeStore.getState().addRoom("Office");
    const rooms = useHomeStore.getState().rooms;
    expect(rooms).toHaveLength(beforeLen + 1);
    expect(rooms[rooms.length - 1].name).toBe("Office");
    expect(rooms[rooms.length - 1].id).toBe("r123");
    now.mockRestore();
  });

  it("renameRoom updates the room name in place", () => {
    const roomId = useHomeStore.getState().rooms[0].id;
    useHomeStore.getState().renameRoom(roomId, "Studio");
    expect(
      useHomeStore.getState().rooms.find((r) => r.id === roomId)?.name,
    ).toBe("Studio");
  });

  it("moveRoom reorders rooms within bounds", () => {
    useHomeStore.setState({
      rooms: [
        { id: "r1", name: "Room 1" },
        { id: "r2", name: "Room 2" },
        { id: "r3", name: "Room 3" },
      ],
    });

    useHomeStore.getState().moveRoom("r2", -1);
    expect(useHomeStore.getState().rooms.map((r) => r.id)).toEqual([
      "r2",
      "r1",
      "r3",
    ]);

    useHomeStore.getState().moveRoom("r2", -1);
    // No change when already at top.
    expect(useHomeStore.getState().rooms.map((r) => r.id)).toEqual([
      "r2",
      "r1",
      "r3",
    ]);

    useHomeStore.getState().moveRoom("r1", 1);
    expect(useHomeStore.getState().rooms.map((r) => r.id)).toEqual([
      "r2",
      "r3",
      "r1",
    ]);
  });

  it("removeRoom reassigns devices to the first remaining room and removes room scenes", () => {
    useHomeStore.setState({
      rooms: [
        { id: "r1", name: "Room 1" },
        { id: "r2", name: "Room 2" },
      ],
      devices: [
        { id: "d1", name: "Lamp", kind: "light", roomId: "r2", isOn: true },
        { id: "d2", name: "AC", kind: "ac", roomId: "r1", isOn: true },
      ],
      scenes: [
        { id: "s1", roomId: "r2", name: "Scene", actions: [] },
        { id: "s2", roomId: "r1", name: "Scene 2", actions: [] },
      ],
    });

    useHomeStore.getState().removeRoom("r2");

    const rooms = useHomeStore.getState().rooms.map((r) => r.id);
    expect(rooms).toEqual(["r1"]);

    const movedDevice = useHomeStore
      .getState()
      .devices.find((d) => d.id === "d1");
    expect(movedDevice?.roomId).toBe("r1");

    const scenes = useHomeStore.getState().scenes.map((s) => s.id);
    expect(scenes).toEqual(["s2"]);
  });

  it("removeRoom does nothing when only one room remains", () => {
    useHomeStore.setState({
      rooms: [{ id: "r1", name: "Solo" }],
    });
    useHomeStore.getState().removeRoom("r1");
    expect(useHomeStore.getState().rooms).toEqual([{ id: "r1", name: "Solo" }]);
  });

  it("guest visibility hides cameras and limits control to guest-safe devices", () => {
    useHomeStore.setState({
      rooms: [{ id: "r1", name: "Guest Suite" }],
      household: [
        { id: "m-guest", name: "Guest User", role: "Guest", status: "home" },
      ],
      roomMembers: [{ memberId: "m-guest", roomIds: ["r1"] }],
      activeMemberId: "m-guest",
      devices: [
        { id: "light1", name: "Lamp", kind: "light", roomId: "r1", isOn: true },
        { id: "tv1", name: "TV", kind: "tv", roomId: "r1", isOn: false },
        {
          id: "window1",
          name: "Window",
          kind: "window",
          roomId: "r1",
          isOn: false,
          openPercent: 0,
        },
        {
          id: "door1",
          name: "Door",
          kind: "door",
          roomId: "r1",
          isOn: false,
          openPercent: 0,
        },
        { id: "cam1", name: "Camera", kind: "camera", roomId: "r1", isOn: true },
      ],
    });

    const state = useHomeStore.getState();
    expect(selectVisibleDevices(state).map((device) => device.id)).toEqual([
      "light1",
      "tv1",
      "window1",
      "door1",
    ]);
    expect(selectControllableDevices(state).map((device) => device.id)).toEqual([
      "light1",
      "tv1",
      "window1",
    ]);
    expect(selectCanManageHousehold(state)).toBe(false);
    expect(selectCanManageSecurity(state)).toBe(false);
  });

  it("tenant can view assigned-room cameras but cannot automate or control security devices", () => {
    useHomeStore.setState({
      rooms: [{ id: "r1", name: "Bedroom" }],
      household: [
        { id: "m-tenant", name: "Tenant User", role: "Tenant", status: "home" },
      ],
      roomMembers: [{ memberId: "m-tenant", roomIds: ["r1"] }],
      activeMemberId: "m-tenant",
      devices: [
        { id: "light1", name: "Lamp", kind: "light", roomId: "r1", isOn: true },
        {
          id: "camera1",
          name: "Bedroom Camera",
          kind: "camera",
          roomId: "r1",
          isOn: true,
        },
        {
          id: "door1",
          name: "Bedroom Door",
          kind: "door",
          roomId: "r1",
          isOn: false,
          openPercent: 0,
        },
      ],
      scenes: [
        {
          id: "scene-light",
          roomId: "r1",
          name: "Light Scene",
          actions: [{ type: "toggle", deviceId: "light1", on: true }],
        },
        {
          id: "scene-camera",
          roomId: "r1",
          name: "Camera Scene",
          actions: [{ type: "toggle", deviceId: "camera1", on: true }],
        },
      ],
      rules: [
        {
          id: "rule-light",
          name: "Light Rule",
          enabled: true,
          trigger: { type: "time", hour: 8, minute: 0 },
          action: { type: "toggle", deviceId: "light1", on: true },
        },
        {
          id: "rule-camera",
          name: "Camera Rule",
          enabled: true,
          trigger: { type: "time", hour: 9, minute: 0 },
          action: { type: "toggle", deviceId: "camera1", on: true },
        },
      ],
      flows: [
        {
          id: "flow-light",
          name: "Light Flow",
          enabled: true,
          triggers: [{ type: "device", deviceId: "light1", state: "on" }],
          conditions: [],
          actions: [{ type: "toggle", deviceId: "light1", on: false }],
        },
        {
          id: "flow-camera",
          name: "Camera Flow",
          enabled: true,
          triggers: [{ type: "device", deviceId: "camera1", state: "on" }],
          conditions: [],
          actions: [{ type: "toggle", deviceId: "camera1", on: false }],
        },
      ],
    });

    const state = useHomeStore.getState();
    expect(selectVisibleDevices(state).map((device) => device.id)).toEqual([
      "light1",
      "camera1",
      "door1",
    ]);
    expect(selectControllableDevices(state).map((device) => device.id)).toEqual([
      "light1",
    ]);
    expect(selectVisibleScenes(state).map((scene) => scene.id)).toEqual([
      "scene-light",
      "scene-camera",
    ]);
    expect(selectRunnableScenes(state).map((scene) => scene.id)).toEqual([
      "scene-light",
    ]);
    expect(selectVisibleRules(state).map((rule) => rule.id)).toEqual([
      "rule-light",
    ]);
    expect(selectVisibleFlows(state).map((flow) => flow.id)).toEqual([
      "flow-light",
    ]);
  });

  it("member keeps full device control but not household or security management", () => {
    useHomeStore.setState({
      household: [
        { id: "m-member", name: "Member User", role: "Member", status: "home" },
      ],
      roomMembers: [],
      activeMemberId: "m-member",
      rooms: [
        { id: "r1", name: "Living" },
        { id: "r2", name: "Bedroom" },
      ],
      devices: [
        { id: "light1", name: "Lamp", kind: "light", roomId: "r1", isOn: true },
        { id: "camera1", name: "Camera", kind: "camera", roomId: "r2", isOn: true },
      ],
    });

    const state = useHomeStore.getState();
    expect(selectVisibleDevices(state).map((device) => device.id)).toEqual([
      "light1",
      "camera1",
    ]);
    expect(selectControllableDevices(state).map((device) => device.id)).toEqual([
      "light1",
      "camera1",
    ]);
    expect(selectCanManageHousehold(state)).toBe(false);
    expect(selectCanManageSecurity(state)).toBe(false);
  });

  it("seeds include extended device kinds", () => {
    const kinds = new Set(useHomeStore.getState().devices.map((d) => d.kind));
    expect(kinds.has("fridge")).toBe(true);
    expect(kinds.has("garage")).toBe(true);
    expect(kinds.has("camera")).toBe(true);
  });

  it("setDevice patches only the targeted device", () => {
    const before = useHomeStore.getState().devices;
    const beforeD3 = before.find((d) => d.id === "d3");
    expect(beforeD3).toBeTruthy();

    useHomeStore.getState().setDevice("d2", { brightness: 10, isOn: true });

    const after = useHomeStore.getState().devices;
    const d2 = after.find((d) => d.id === "d2");
    const d3 = after.find((d) => d.id === "d3");

    expect(d2?.brightness).toBe(10);
    expect(d2?.isOn).toBe(true);

    // Unrelated device remains unchanged.
    expect(d3).toEqual(beforeD3);
  });

  it("toggleDevice flips isOn", () => {
    const initial = useHomeStore.getState().devices.find((d) => d.id === "d3");
    expect(initial).toBeTruthy();

    useHomeStore.getState().toggleDevice("d3");
    expect(
      useHomeStore.getState().devices.find((d) => d.id === "d3")?.isOn,
    ).toBe(!initial!.isOn);

    useHomeStore.getState().toggleDevice("d3");
    expect(
      useHomeStore.getState().devices.find((d) => d.id === "d3")?.isOn,
    ).toBe(initial!.isOn);
  });

  it("clearNotifications removes all inbox items", () => {
    expect(useHomeStore.getState().notifications.length).toBeGreaterThan(0);
    useHomeStore.getState().clearNotifications();
    expect(useHomeStore.getState().notifications).toEqual([]);
  });

  it("addNotification prepends a new inbox item", () => {
    const before = useHomeStore.getState().notifications.length;
    const now = jest.spyOn(Date, "now").mockReturnValue(456);
    useHomeStore.getState().addNotification({
      title: "Power outage",
      body: "Main power offline.",
      category: "alert",
    });
    const [first] = useHomeStore.getState().notifications;
    expect(useHomeStore.getState().notifications).toHaveLength(before + 1);
    expect(first.id).toBe("n456");
    expect(first.createdAt).toBe(456);
    expect(first.title).toBe("Power outage");
    now.mockRestore();
  });

  it("quickScheduleDevice creates a toggle rule for non-AC devices", () => {
    const beforeLen = useHomeStore.getState().rules.length;

    useHomeStore.getState().quickScheduleDevice("d2", { hour: 21, minute: 0 }); // light

    const rules = useHomeStore.getState().rules;
    expect(rules).toHaveLength(beforeLen + 1);

    const last = rules[rules.length - 1];
    expect(last.action.type).toBe("toggle");
    if (last.action.type !== "toggle") throw new Error("Expected toggle rule");
    expect(last.action.deviceId).toBe("d2");
    expect(last.action.on).toBe(true);
    expect(last.trigger.hour).toBe(21);
    expect(last.trigger.minute).toBe(0);
    expect(last.name).toContain("ON @ 21:00");
  });

  it("quickScheduleDevice creates a set-ac rule using the current AC settings", () => {
    useHomeStore.getState().setDevice("d1", { tempC: 23, mode: "fan" });

    const beforeLen = useHomeStore.getState().rules.length;
    useHomeStore.getState().quickScheduleDevice("d1", { hour: 7, minute: 0 });

    const rules = useHomeStore.getState().rules;
    expect(rules).toHaveLength(beforeLen + 1);

    const last = rules[rules.length - 1];
    expect(last.action.type).toBe("set-ac");
    if (last.action.type !== "set-ac") throw new Error("Expected set-ac rule");
    expect(last.action.deviceId).toBe("d1");
    expect(last.action.tempC).toBe(23);
    expect(last.action.mode).toBe("fan");
    expect(last.name).toContain("07:00");
  });

  it("runScene applies patch/toggle actions to the right devices", () => {
    // Sanity: at least one of these is initially ON in seed data.
    const before = useHomeStore.getState().devices;
    expect(before.find((d) => d.id === "d1")?.isOn).toBe(true);

    useHomeStore.getState().runScene("s3"); // All Off (room r1)

    const after = useHomeStore.getState().devices;
    const r1Ids = new Set(["d1", "d2", "d3", "d4"]);
    for (const id of r1Ids) {
      expect(after.find((d) => d.id === id)?.isOn).toBe(false);
    }

    // Devices outside the scene are not forced off (e.g. Bedroom AC stays on).
    expect(after.find((d) => d.id === "d6")?.isOn).toBe(true);
  });

  it("addScene appends a new scene with a deterministic id", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(4242);
    const beforeLen = useHomeStore.getState().scenes.length;

    useHomeStore.getState().addScene({
      roomId: "r1",
      name: "Evening",
      actions: [
        {
          type: "patch",
          deviceId: "d2",
          patch: { isOn: true, brightness: 40 },
        },
      ],
    });

    const scenes = useHomeStore.getState().scenes;
    expect(scenes).toHaveLength(beforeLen + 1);
    expect(scenes[scenes.length - 1].id).toBe("s4242");
    expect(scenes[scenes.length - 1].name).toBe("Evening");

    now.mockRestore();
  });

  it("addRule assigns a deterministic id prefix", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1234567890);

    const beforeLen = useHomeStore.getState().rules.length;
    useHomeStore.getState().addRule({
      name: "Test rule",
      enabled: true,
      trigger: { type: "time", hour: 12, minute: 34 },
      action: { type: "toggle", deviceId: "d2", on: true },
    });

    const rules = useHomeStore.getState().rules;
    expect(rules).toHaveLength(beforeLen + 1);
    expect(rules[rules.length - 1].id).toBe("a1234567890");

    now.mockRestore();
  });

  it("link/unlink integration toggles status and resync updates lastSyncAt", () => {
    expect(useHomeStore.getState().integrations.alexa.status).toBe(
      "not-linked",
    );
    useHomeStore.getState().setIntegrationStatus("alexa", "linking");
    expect(useHomeStore.getState().integrations.alexa.status).toBe("linking");
    useHomeStore.getState().linkIntegration("alexa", "Test Account");
    const linked = useHomeStore.getState().integrations.alexa;
    expect(linked.status).toBe("linked");
    expect(linked.accountName).toBe("Test Account");

    const beforeSync = linked.lastSyncAt;
    useHomeStore.getState().resyncIntegration("alexa");
    const afterSync = useHomeStore.getState().integrations.alexa.lastSyncAt;
    expect(typeof afterSync).toBe("number");
    if (beforeSync && afterSync)
      expect(afterSync).toBeGreaterThanOrEqual(beforeSync);

    useHomeStore.getState().unlinkIntegration("alexa");
    expect(useHomeStore.getState().integrations.alexa.status).toBe(
      "not-linked",
    );
  });

  it("setSecurityMode away closes entries and arms all cameras", () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(9000);

    useHomeStore.setState({
      profile: {
        ...useHomeStore.getState().profile,
        securityMode: "home",
        securityModeSource: "manual",
      },
      devices: [
        {
          id: "door1",
          name: "Front Door",
          kind: "door",
          roomId: "r1",
          isOn: true,
          openPercent: 65,
        },
        {
          id: "gate1",
          name: "Front Gate",
          kind: "gate",
          roomId: "r1",
          isOn: true,
          openPercent: 100,
          autoOpenEnabled: true,
        },
        {
          id: "garage1",
          name: "Garage",
          kind: "garage",
          roomId: "r1",
          isOn: true,
          openPercent: 30,
        },
        {
          id: "cam-entry",
          name: "Entry Camera",
          kind: "camera",
          roomId: "r1",
          isOn: false,
          armed: false,
          motionAlerts: false,
          recording: false,
          nightVision: false,
        },
        {
          id: "cam-office",
          name: "Office Camera",
          kind: "camera",
          roomId: "r4",
          isOn: false,
          armed: false,
          motionAlerts: false,
          recording: false,
          nightVision: false,
        },
      ],
    });

    useHomeStore.getState().setSecurityMode("away", { source: "presence" });

    const state = useHomeStore.getState();
    expect(state.profile.securityMode).toBe("away");
    expect(state.profile.securityModeSource).toBe("presence");
    expect(state.profile.securityLastModeChangeAt).toBe(9000);
    expect(state.devices.find((device) => device.id === "door1")?.openPercent).toBe(
      0,
    );
    expect(state.devices.find((device) => device.id === "gate1")?.openPercent).toBe(
      0,
    );
    expect(
      state.devices.find((device) => device.id === "gate1")?.autoOpenEnabled,
    ).toBe(false);
    expect(
      state.devices.find((device) => device.id === "garage1")?.openPercent,
    ).toBe(0);

    const entryCamera = state.devices.find((device) => device.id === "cam-entry");
    const officeCamera = state.devices.find(
      (device) => device.id === "cam-office",
    );
    expect(entryCamera?.isOn).toBe(true);
    expect(entryCamera?.armed).toBe(true);
    expect(entryCamera?.motionAlerts).toBe(true);
    expect(entryCamera?.nightVision).toBe(true);
    expect(entryCamera?.recording).toBe(true);
    expect(entryCamera?.lastSeenAt).toBe(9000);
    expect(officeCamera?.isOn).toBe(true);
    expect(officeCamera?.armed).toBe(true);
    expect(officeCamera?.motionAlerts).toBe(true);
    expect(officeCamera?.nightVision).toBe(true);
    now.mockRestore();
  });

  it("setSecurityMode home and night preserve perimeter focus", () => {
    useHomeStore.setState({
      profile: {
        ...useHomeStore.getState().profile,
        securityMode: "away",
        securityModeSource: "presence",
      },
      devices: [
        {
          id: "cam-entry",
          name: "Entry Camera",
          kind: "camera",
          roomId: "r1",
          isOn: true,
          armed: true,
          motionAlerts: true,
          recording: true,
          nightVision: true,
        },
        {
          id: "cam-office",
          name: "Office Camera",
          kind: "camera",
          roomId: "r4",
          isOn: true,
          armed: true,
          motionAlerts: true,
          recording: true,
          nightVision: true,
        },
      ],
    });

    useHomeStore.getState().setSecurityMode("home", { source: "manual" });

    let state = useHomeStore.getState();
    expect(state.devices.find((device) => device.id === "cam-entry")?.armed).toBe(
      true,
    );
    expect(
      state.devices.find((device) => device.id === "cam-entry")?.recording,
    ).toBe(false);
    expect(
      state.devices.find((device) => device.id === "cam-office")?.armed,
    ).toBe(false);
    expect(
      state.devices.find((device) => device.id === "cam-office")?.motionAlerts,
    ).toBe(false);

    useHomeStore.getState().setSecurityMode("night", { source: "manual" });
    state = useHomeStore.getState();
    expect(state.profile.securityMode).toBe("night");
    expect(
      state.devices.find((device) => device.id === "cam-entry")?.recording,
    ).toBe(true);
    expect(
      state.devices.find((device) => device.id === "cam-office")?.armed,
    ).toBe(false);
    expect(
      state.devices.find((device) => device.id === "cam-office")?.recording,
    ).toBe(false);
  });
});
