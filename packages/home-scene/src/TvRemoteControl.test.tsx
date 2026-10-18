// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
import { readTvRemoteState } from './tvRemote';
import { TvRemoteControl } from './TvRemoteControl';

const device = getDevice('family-tv')!;
let container: HTMLDivElement;
let root: Root;

/** Subscribe to the real device state so each click renders its persisted-state input. */
function RemoteHarness() {
  const current = useHomeStore((state) => state.deviceStates[device.id]);
  return <TvRemoteControl device={device} current={current} />;
}

/** Activate a labeled control without interpreting its visual styling. */
function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(button, label).toBeTruthy();
  act(() => button!.click());
}

/** Read the same model exposed in the remote display after a user action. */
function currentRemote() { return readTvRemoteState(device, useHomeStore.getState().deviceStates[device.id]); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() {} });
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  useHomeStore.setState({ deviceStates: { ...useHomeStore.getState().deviceStates, [device.id]: { on: false, level: 35, settings: { volume: 30, channel: 4, source: 'Netflix', muted: false } } } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  vi.unstubAllGlobals();
});

describe('TV remote user flow', () => {
  it('opens the remote directly and keeps uncommon controls behind More with focus recovery', () => {
    act(() => root.render(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />));
    expect(container.querySelector('.tv-remote-body')).toBeTruthy();
    expect(container.querySelector('.device-sheet-primary')).toBeNull();
    expect(container.querySelector('[aria-label="Next controls page"]')).toBeNull();
    click('More TV settings');
    expect(container.querySelector('[aria-label="Next controls page"]')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Back to remote');
    click('Back to remote');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More TV settings');
    expect(currentRemote()).toMatchObject({ on: false, volume: 30, source: 'Netflix' });
  });

  it('sends relative volume, mute, channel and preview navigation without losing other settings', () => {
    act(() => root.render(<RemoteHarness />));
    for (let i = 0; i < 4; i++) click('Volume up');
    click('Mute TV');
    expect(currentRemote()).toMatchObject({ on: false, volume: 50, muted: true, source: 'Netflix', channel: 4 });
    expect(container.textContent).toContain('TV is off');
    click(`${device.name} power`);
    click('TV up');
    click('TV OK');
    expect(currentRemote()).toMatchObject({ on: true, focus: 2, selection: 2 });
    click('TV back');
    expect(currentRemote()).toMatchObject({ focus: 2, selection: 0, source: 'Netflix' });
    click('TV home');
    click('Channel up');
    expect(currentRemote()).toMatchObject({ channel: 5, source: 'Live TV', volume: 50, muted: true });
  });

  it('shows actual playback changes and remembers the selected source without pretending to stream', () => {
    act(() => root.render(<RemoteHarness />));
    const select = container.querySelector<HTMLSelectElement>('select')!;
    act(() => { select.value = 'YouTube'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(currentRemote()).toMatchObject({ on: false, source: 'YouTube' });
    click('Play TV preview');
    click('Forward preview 10 seconds');
    expect(currentRemote()).toMatchObject({ on: true, playing: true, positionSec: 10 });
    click('Pause TV preview');
    click('Next preview track');
    expect(currentRemote()).toMatchObject({ playing: false, positionSec: 0, track: 2 });
    expect(container.textContent).toContain('SIMULATION');
    click(`${device.name} power`);
    expect(container.querySelector('[aria-label="Pause TV preview"]')).toBeNull();
    expect(container.querySelector('.tv-remote-body')?.getAttribute('data-powered')).toBe('false');
  });

  it('removes writable controls on revocation, including when More was open', () => {
    act(() => root.render(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />));
    click('More TV settings');
    const before = useHomeStore.getState().deviceStates[device.id];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, fullHome: false, roomIds: [device.roomId], deviceIds: [device.id], controllableDeviceIds: [] } }));
    expect(container.querySelector('.tv-remote-workspace')).toBeNull();
    expect(container.querySelector('.tv-remote-more')).toBeNull();
    expect(container.textContent).toContain('View only');
    expect(useHomeStore.getState().deviceStates[device.id]).toBe(before);
  });

  it('keeps volume boundaries disabled and honors the in-app reduced-motion choice', () => {
    act(() => { useHomeStore.setState({ motionDisabled: true }); root.render(<RemoteHarness />); });
    act(() => useHomeStore.getState().setDeviceSetting(device.id, 'volume', 100));
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Volume up"]')?.disabled).toBe(true);
    expect(container.querySelector('.tv-remote-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
    act(() => useHomeStore.getState().setDeviceSetting(device.id, 'volume', 0));
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Volume down"]')?.disabled).toBe(true);
  });
});
