import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDefaultState, useHomeStore } from './state';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { DashboardRooms, DashboardDock } from './DashboardChrome';
import { DashboardInspector } from './DashboardInspector';
import { QuickDeviceControls } from './QuickDeviceControls';
import { DeviceControlSheet } from './DeviceControlSheet';

vi.mock('./state', async (importOriginal) => {
  const original = await importOriginal<typeof import('./state')>();
  /** Render the current scoped snapshot in server markup instead of Zustand's initial server snapshot. */
  const readCurrent = <T,>(selector: (state: ReturnType<typeof original.useHomeStore.getState>) => T) => selector(original.useHomeStore.getState());
  return { ...original, useHomeStore: Object.assign(readCurrent, original.useHomeStore) };
});

afterEach(() => useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }));

it('renders only assigned room navigation and visible device cards, without full-floor controls', () => {
  useHomeStore.getState().applyAccessSnapshot({}, {
    fullHome: false, roomIds: ['master'], deviceIds: ['master-light'], controllableDeviceIds: [],
  });
  const states = useHomeStore.getState().deviceStates;
  useHomeStore.setState({ deviceStates: { ...states, 'master-light': { ...states['master-light'], on: true }, 'living-light': { ...states['living-light'], on: true } } });
  const rooms = renderToStaticMarkup(<DashboardRooms onBrowse={() => undefined} />);
  expect(rooms).toContain('data-room-id="master"');
  expect(rooms).not.toContain('data-room-id="living"');
  expect(rooms).not.toContain('Choose floor');
  const inspector = renderToStaticMarkup(<DashboardInspector onFullControls={() => undefined} onBrowseDevices={() => undefined} />);
  expect(inspector).toContain('View only');
  expect(inspector).not.toContain('Master blinds');
  expect(inspector).toContain('disabled=""');
  const dock = renderToStaticMarkup(<DashboardDock onRooms={() => undefined} onDevices={() => undefined} />);
  expect(dock).toContain('1 devices active');
});

it('removes revoked hotspot sheets and hides editable controls for view-only devices', () => {
  useHomeStore.getState().applyAccessSnapshot({}, { fullHome: false, roomIds: ['master'], deviceIds: ['master-light'], controllableDeviceIds: [] });
  expect(renderToStaticMarkup(<QuickDeviceControls deviceId="living-light" onClose={() => undefined} onFullControls={() => undefined} />)).toBe('');
  expect(renderToStaticMarkup(<DeviceControlSheet deviceId="living-light" onClose={() => undefined} />)).toBe('');
  const sheet = renderToStaticMarkup(<DeviceControlSheet deviceId="master-light" onClose={() => undefined} />);
  expect(sheet).toContain('View only.');
  expect(sheet).not.toContain('type="range"');
});
