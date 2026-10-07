import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDefaultState, useHomeStore } from './state';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { DashboardRooms, DashboardDock } from './DashboardChrome';
import { DashboardInspector } from './DashboardInspector';
import { QuickDeviceControls } from './QuickDeviceControls';
import { DeviceControlSheet } from './DeviceControlSheet';
import { SceneViewControls } from './SceneViewControls';
import { roomArtwork } from './cinematicArtwork';

vi.mock('./state', async (importOriginal) => {
  const original = await importOriginal<typeof import('./state')>();
  /** Render the current scoped snapshot in server markup instead of Zustand's initial server snapshot. */
  const readCurrent = <T,>(selector: (state: ReturnType<typeof original.useHomeStore.getState>) => T) => selector(original.useHomeStore.getState());
  return { ...original, useHomeStore: Object.assign(readCurrent, original.useHomeStore) };
});

afterEach(() => useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }));

it('offers an exterior companion and assigned-room entry without empty device controls or floor access', () => {
  useHomeStore.getState().applyAccessSnapshot({}, {
    fullHome: false, propertyOverview: true, interiorLayout: false, roomIds: ['master'], deviceIds: ['master-light'], controllableDeviceIds: ['master-light'],
  });
  const inspector = renderToStaticMarkup(<DashboardInspector onFullControls={() => undefined} onBrowseDevices={() => undefined} />);
  expect(inspector).toContain('Your home, in view.');
  expect(inspector).toContain('Your assigned rooms');
  expect(inspector).toContain('Primary suite');
  expect(inspector).toContain(`data-artwork="${roomArtwork({ id: 'master' })}"`);
  expect(inspector).not.toContain('No device selected');
  expect(inspector).not.toContain('Next devices');
  const controls = renderToStaticMarkup(<SceneViewControls onRooms={() => undefined} />);
  expect(controls).toContain('Property');
  expect(controls).toContain('My rooms');
  expect(controls).not.toContain('Floor plan');
  expect(controls).not.toContain('Immersive');
});

it('labels unassigned shared interiors as layout only without exposing their devices or status', () => {
  useHomeStore.getState().applyAccessSnapshot({}, {
    fullHome: false, propertyOverview: true, interiorLayout: true, roomIds: ['master'], deviceIds: ['master-light'], controllableDeviceIds: [],
  });
  useHomeStore.getState().setRoom('living');
  const rooms = renderToStaticMarkup(<DashboardRooms onBrowse={() => undefined} />);
  expect(rooms).toContain('data-room-id="living"');
  expect(rooms).toContain('Layout only');
  expect(rooms).toContain('Choose floor');
  const inspector = renderToStaticMarkup(<DashboardInspector onFullControls={() => undefined} onBrowseDevices={() => undefined} />);
  expect(inspector).toContain('SHARED INTERIOR TOUR');
  expect(inspector).toContain('Layout only.');
  expect(inspector).not.toContain('Living room light');
  expect(inspector).not.toContain('device-focus-reading');
});

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
