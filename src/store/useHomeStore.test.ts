import {
  useHomeStore,
  type AutomationFlow,
  type AutomationRule,
  type Device,
  type Scene,
  type Room,
} from './useHomeStore';

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
      if (a.type === 'patch') return { ...a, patch: { ...a.patch } };
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
  });
});

describe('useHomeStore', () => {
  it('addRoom appends a new room with the provided name', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(123);
    const beforeLen = useHomeStore.getState().rooms.length;
    useHomeStore.getState().addRoom('Office');
    const rooms = useHomeStore.getState().rooms;
    expect(rooms).toHaveLength(beforeLen + 1);
    expect(rooms[rooms.length - 1].name).toBe('Office');
    expect(rooms[rooms.length - 1].id).toBe('r123');
    now.mockRestore();
  });

  it('renameRoom updates the room name in place', () => {
    const roomId = useHomeStore.getState().rooms[0].id;
    useHomeStore.getState().renameRoom(roomId, 'Studio');
    expect(useHomeStore.getState().rooms.find((r) => r.id === roomId)?.name).toBe('Studio');
  });

  it('moveRoom reorders rooms within bounds', () => {
    useHomeStore.setState({
      rooms: [
        { id: 'r1', name: 'Room 1' },
        { id: 'r2', name: 'Room 2' },
        { id: 'r3', name: 'Room 3' },
      ],
    });

    useHomeStore.getState().moveRoom('r2', -1);
    expect(useHomeStore.getState().rooms.map((r) => r.id)).toEqual(['r2', 'r1', 'r3']);

    useHomeStore.getState().moveRoom('r2', -1);
    // No change when already at top.
    expect(useHomeStore.getState().rooms.map((r) => r.id)).toEqual(['r2', 'r1', 'r3']);

    useHomeStore.getState().moveRoom('r1', 1);
    expect(useHomeStore.getState().rooms.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('removeRoom reassigns devices to the first remaining room and removes room scenes', () => {
    useHomeStore.setState({
      rooms: [
        { id: 'r1', name: 'Room 1' },
        { id: 'r2', name: 'Room 2' },
      ],
      devices: [
        { id: 'd1', name: 'Lamp', kind: 'light', roomId: 'r2', isOn: true },
        { id: 'd2', name: 'AC', kind: 'ac', roomId: 'r1', isOn: true },
      ],
      scenes: [
        { id: 's1', roomId: 'r2', name: 'Scene', actions: [] },
        { id: 's2', roomId: 'r1', name: 'Scene 2', actions: [] },
      ],
    });

    useHomeStore.getState().removeRoom('r2');

    const rooms = useHomeStore.getState().rooms.map((r) => r.id);
    expect(rooms).toEqual(['r1']);

    const movedDevice = useHomeStore.getState().devices.find((d) => d.id === 'd1');
    expect(movedDevice?.roomId).toBe('r1');

    const scenes = useHomeStore.getState().scenes.map((s) => s.id);
    expect(scenes).toEqual(['s2']);
  });

  it('removeRoom does nothing when only one room remains', () => {
    useHomeStore.setState({
      rooms: [{ id: 'r1', name: 'Solo' }],
    });
    useHomeStore.getState().removeRoom('r1');
    expect(useHomeStore.getState().rooms).toEqual([{ id: 'r1', name: 'Solo' }]);
  });

  it('seeds include extended device kinds', () => {
    const kinds = new Set(useHomeStore.getState().devices.map((d) => d.kind));
    expect(kinds.has('fridge')).toBe(true);
    expect(kinds.has('garage')).toBe(true);
    expect(kinds.has('camera')).toBe(true);
  });

  it('setDevice patches only the targeted device', () => {
    const before = useHomeStore.getState().devices;
    const beforeD3 = before.find((d) => d.id === 'd3');
    expect(beforeD3).toBeTruthy();

    useHomeStore.getState().setDevice('d2', { brightness: 10, isOn: true });

    const after = useHomeStore.getState().devices;
    const d2 = after.find((d) => d.id === 'd2');
    const d3 = after.find((d) => d.id === 'd3');

    expect(d2?.brightness).toBe(10);
    expect(d2?.isOn).toBe(true);

    // Unrelated device remains unchanged.
    expect(d3).toEqual(beforeD3);
  });

  it('toggleDevice flips isOn', () => {
    const initial = useHomeStore.getState().devices.find((d) => d.id === 'd3');
    expect(initial).toBeTruthy();

    useHomeStore.getState().toggleDevice('d3');
    expect(useHomeStore.getState().devices.find((d) => d.id === 'd3')?.isOn).toBe(!initial!.isOn);

    useHomeStore.getState().toggleDevice('d3');
    expect(useHomeStore.getState().devices.find((d) => d.id === 'd3')?.isOn).toBe(initial!.isOn);
  });

  it('quickScheduleDevice creates a toggle rule for non-AC devices', () => {
    const beforeLen = useHomeStore.getState().rules.length;

    useHomeStore.getState().quickScheduleDevice('d2', { hour: 21, minute: 0 }); // light

    const rules = useHomeStore.getState().rules;
    expect(rules).toHaveLength(beforeLen + 1);

    const last = rules[rules.length - 1];
    expect(last.action.type).toBe('toggle');
    if (last.action.type !== 'toggle') throw new Error('Expected toggle rule');
    expect(last.action.deviceId).toBe('d2');
    expect(last.action.on).toBe(true);
    expect(last.trigger.hour).toBe(21);
    expect(last.trigger.minute).toBe(0);
    expect(last.name).toContain('ON @ 21:00');
  });

  it('quickScheduleDevice creates a set-ac rule using the current AC settings', () => {
    useHomeStore.getState().setDevice('d1', { tempC: 23, mode: 'fan' });

    const beforeLen = useHomeStore.getState().rules.length;
    useHomeStore.getState().quickScheduleDevice('d1', { hour: 7, minute: 0 });

    const rules = useHomeStore.getState().rules;
    expect(rules).toHaveLength(beforeLen + 1);

    const last = rules[rules.length - 1];
    expect(last.action.type).toBe('set-ac');
    if (last.action.type !== 'set-ac') throw new Error('Expected set-ac rule');
    expect(last.action.deviceId).toBe('d1');
    expect(last.action.tempC).toBe(23);
    expect(last.action.mode).toBe('fan');
    expect(last.name).toContain('07:00');
  });

  it('runScene applies patch/toggle actions to the right devices', () => {
    // Sanity: at least one of these is initially ON in seed data.
    const before = useHomeStore.getState().devices;
    expect(before.find((d) => d.id === 'd1')?.isOn).toBe(true);

    useHomeStore.getState().runScene('s3'); // All Off (room r1)

    const after = useHomeStore.getState().devices;
    const r1Ids = new Set(['d1', 'd2', 'd3', 'd4']);
    for (const id of r1Ids) {
      expect(after.find((d) => d.id === id)?.isOn).toBe(false);
    }

    // Devices outside the scene are not forced off (e.g. Bedroom AC stays on).
    expect(after.find((d) => d.id === 'd6')?.isOn).toBe(true);
  });

  it('addScene appends a new scene with a deterministic id', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(4242);
    const beforeLen = useHomeStore.getState().scenes.length;

    useHomeStore.getState().addScene({
      roomId: 'r1',
      name: 'Evening',
      actions: [{ type: 'patch', deviceId: 'd2', patch: { isOn: true, brightness: 40 } }],
    });

    const scenes = useHomeStore.getState().scenes;
    expect(scenes).toHaveLength(beforeLen + 1);
    expect(scenes[scenes.length - 1].id).toBe('s4242');
    expect(scenes[scenes.length - 1].name).toBe('Evening');

    now.mockRestore();
  });

  it('addRule assigns a deterministic id prefix', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1234567890);

    const beforeLen = useHomeStore.getState().rules.length;
    useHomeStore.getState().addRule({
      name: 'Test rule',
      enabled: true,
      trigger: { type: 'time', hour: 12, minute: 34 },
      action: { type: 'toggle', deviceId: 'd2', on: true },
    });

    const rules = useHomeStore.getState().rules;
    expect(rules).toHaveLength(beforeLen + 1);
    expect(rules[rules.length - 1].id).toBe('a1234567890');

    now.mockRestore();
  });

  it('link/unlink integration toggles status and resync updates lastSyncAt', () => {
    expect(useHomeStore.getState().integrations.alexa.status).toBe('not-linked');
    useHomeStore.getState().setIntegrationStatus('alexa', 'linking');
    expect(useHomeStore.getState().integrations.alexa.status).toBe('linking');
    useHomeStore.getState().linkIntegration('alexa', 'Test Account');
    const linked = useHomeStore.getState().integrations.alexa;
    expect(linked.status).toBe('linked');
    expect(linked.accountName).toBe('Test Account');

    const beforeSync = linked.lastSyncAt;
    useHomeStore.getState().resyncIntegration('alexa');
    const afterSync = useHomeStore.getState().integrations.alexa.lastSyncAt;
    expect(typeof afterSync).toBe('number');
    if (beforeSync && afterSync) expect(afterSync).toBeGreaterThanOrEqual(beforeSync);

    useHomeStore.getState().unlinkIntegration('alexa');
    expect(useHomeStore.getState().integrations.alexa.status).toBe('not-linked');
  });
});
