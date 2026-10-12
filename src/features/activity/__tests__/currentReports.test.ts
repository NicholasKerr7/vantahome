import { DEVICES } from '../../../../packages/home-scene/src/data';
import { createDefaultSimulationSnapshot } from '../../../../packages/home-scene/src/simulationBridgeProtocol';
import { useHomeStore, type HomeState } from '../../../store/useHomeStore';
import { CONDITION_REPORT_FRESHNESS_MS, selectCurrentReports } from '../currentReports';

const NOW = 1_800_000_000_000;

/** Physical reports stay independent of the model and contain no generated telemetry defaults. */
function home(): HomeState {
  return { ...useHomeStore.getState(), accountUserId: 'owner', authenticatedUserId: 'owner',
    accountHomeId: 'home', activeHomeId: 'home', membershipReady: true, activeMemberId: 'owner',
    household: [{ id: 'owner', name: 'Owner', role: 'Owner', status: 'home' }],
    rooms: [{ id: 'public', name: 'Utility' }, { id: 'private', name: 'Private' }],
    roomMembers: [], memberPermissionOverrides: [],
    devices: [
      { id: 'energy', roomId: 'public', name: 'Energy', kind: 'energy', isOn: true, gridAvailable: false, observedAt: NOW - 1000 },
      { id: 'water', roomId: 'public', name: 'Water', kind: 'water', isOn: true, waterLeakDetected: true,
        waterPressurePsi: 90, waterPressureHighPsi: 80, waterTodayL: 500, waterBudgetL: 400, observedAt: NOW - CONDITION_REPORT_FRESHNESS_MS },
      { id: 'entry', roomId: 'private', name: 'Private gate', kind: 'gate', isOn: true, openPercent: 60 },
    ] };
}

test('retains continuing grid, leak, pressure, budget and entry reports with honest observation age', () => {
  const reports = selectCurrentReports(home(), null, 'production', NOW);
  expect(reports).toHaveLength(5);
  expect(reports.find((report) => report.id.endsWith(':grid'))).toMatchObject({ simulated: false, age: 'recent', title: 'Grid unavailable in last report' });
  expect(reports.find((report) => report.id.endsWith(':leak'))).toMatchObject({ age: 'stale', title: 'Leak flagged in last report' });
  expect(reports.find((report) => report.id.endsWith(':opening'))).toMatchObject({ age: 'unknown', timeLabel: 'Device report time unknown' });
  expect(JSON.stringify(reports)).not.toContain('Just now');
  expect(JSON.stringify(reports)).not.toContain('locked');
});

test('does not use missing, future or invalid observation timestamps or default missing thresholds', () => {
  const state = home();
  state.devices[0].observedAt = NOW + 1;
  state.devices[1].observedAt = 1e100;
  state.devices[1].waterLeakDetected = undefined;
  state.devices[1].waterPressureHighPsi = undefined;
  state.devices[1].waterBudgetL = undefined;
  const reports = selectCurrentReports(state, null, 'production', NOW);
  expect(reports.map((report) => report.id)).toEqual(['condition:energy:grid', 'condition:entry:opening']);
  expect(reports[0].age).toBe('unknown');
  state.devices[0].gridAvailable = undefined;
  state.devices[2].openPercent = NaN;
  expect(selectCurrentReports(state, null, 'production', NOW)).toEqual([]);
});

test('includes zero-pressure readings when a configured lower limit exists', () => {
  const state = home();
  state.devices[1].waterPressurePsi = 0;
  state.devices[1].waterPressureLowPsi = 35;
  expect(selectCurrentReports(state, null, 'production', NOW).find((report) => report.id.endsWith('pressure-low'))?.detail)
    .toContain('0 PSI');
});

test('rechecks assigned rooms, expired membership and the verified identity before revealing reports', () => {
  const state = home();
  state.household[0].role = 'Guest';
  state.roomMembers = [{ memberId: 'owner', roomIds: ['public'] }];
  expect(selectCurrentReports(state, null, 'production', NOW).some((report) => report.deviceName === 'Private gate')).toBe(false);
  expect(selectCurrentReports({ ...state, membershipReady: false }, null, 'production', NOW)).toEqual([]);
  expect(selectCurrentReports({ ...state, authenticatedUserId: 'other' }, null, 'production', NOW)).toEqual([]);
  state.household[0].accessExpiresAt = new Date(Date.now() - 1000).toISOString();
  expect(selectCurrentReports(state, null, 'production', NOW)).toEqual([]);
});

test('uses canonical simulation state only for explicitly bound virtual devices in a mixed household', () => {
  const state = home();
  const definition = DEVICES.find((device) => device.kind === 'water')!;
  state.rooms[0].modelRoomId = definition.roomId;
  state.devices[1] = { ...state.devices[1], simulationOnly: true, modelDeviceId: definition.id,
    waterLeakDetected: false, waterTodayL: 0, waterPressurePsi: 0 };
  const simulation = createDefaultSimulationSnapshot();
  simulation.deviceStates[definition.id] = { on: true, level: 0, settings: { waterLeakDetected: true } };
  const reports = selectCurrentReports(state, simulation, 'production', NOW);
  expect(reports.find((report) => report.id.endsWith(':grid'))?.simulated).toBe(false);
  expect(reports.find((report) => report.id.endsWith(':leak'))).toMatchObject({ simulated: true, age: 'simulation', title: 'Simulated water leak',
    timeLabel: 'Current local model · no physical report' });
  expect(selectCurrentReports(state, null, 'production', NOW).some((report) => report.deviceName === 'Water')).toBe(false);
  // A dismissed alert preference cannot erase an ongoing condition from this read-only report view.
  state.devices[0].gridOutageAlerts = false;
  expect(selectCurrentReports(state, simulation, 'production', NOW).some((report) => report.id.endsWith(':grid'))).toBe(true);
});
