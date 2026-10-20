// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { VacuumController } from './VacuumControlPanel';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;
const id = 'living-vacuum';

/** Subscribe to the same canonical device state as the live controller. */
function Harness() {
  const current = useHomeStore((state) => state.deviceStates[id]);
  return <VacuumController device={getDevice(id)!} current={current} />;
}

/** Click semantic controls, exercising actual event handlers rather than projector internals. */
function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(button, label).toBeTruthy();
  act(() => button!.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() {} });
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount()); container.remove();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  vi.unstubAllGlobals();
});

describe('vacuum cleaning console', () => {
  it('starts, pauses, resumes and docks without pretending to advance samples', () => {
    act(() => root.render(<Harness />));
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Dock vacuum"]')?.disabled).toBe(true);
    click('Start cleaning');
    expect(container.querySelector('.vacuum-console')?.getAttribute('data-activity')).toBe('cleaning');
    click('Pause cleaning');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { status: 'paused' } });
    expect(container.querySelector('.vacuum-readings')?.textContent).toContain('Paused');
    click('Resume cleaning'); click('Dock vacuum');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { status: 'docked' } });
    expect(container.querySelector('[aria-label="Battery sample 86%"]')).toBeTruthy();
    expect(container.textContent).toContain('No cleaning route or progress is simulated.');
  });

  it('keeps paused activity while changing mode, suction, Mop and Quiet', () => {
    act(() => root.render(<Harness />));
    click('Start cleaning'); click('Pause cleaning');
    const plus = container.querySelector<HTMLButtonElement>('[aria-label="Increase suction preference"]')!;
    act(() => { plus.click(); plus.click(); plus.click(); plus.click(); });
    click('Spot'); click('Mop preference'); click('Quiet preference');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { status: 'paused', vacuumSuction: 100, vacuumMode: 'spot', vacuumMop: true, vacuumQuietMode: true } });
    expect(container.querySelector('.vacuum-readings')?.textContent).toContain('Paused');
    expect(plus.disabled).toBe(true);
    click('Resume cleaning');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: true, settings: { vacuumSuction: 100, vacuumMode: 'spot', vacuumMop: true, vacuumQuietMode: true } });
  });

  it('retains activity and settings while navigating More and Back with restored focus', () => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    click('Start cleaning'); click('Pause cleaning'); click('Edge');
    const before = useHomeStore.getState().deviceStates[id];
    click('More vacuum settings');
    expect(container.querySelector('[aria-label="Device settings"]')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Back to cleaning console');
    click('Back to cleaning console');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More vacuum settings');
    expect(container.querySelector('.device-sheet-state')?.textContent).toContain('Paused');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  });

  it('shows unknown battery and a real maintenance sample without inventing readiness', () => {
    const state = useHomeStore.getState().deviceStates;
    act(() => useHomeStore.setState({ deviceStates: { ...state, [id]: { ...state[id], settings: { battery: Number.NaN, vacuumBinFull: true } } } }));
    act(() => root.render(<Harness />));
    expect(container.querySelector('[aria-label="Battery sample unavailable"]')).toBeTruthy();
    expect(container.querySelector('.vacuum-feedback')?.textContent).toContain('Empty bin');
    click('Start cleaning');
    expect(container.querySelector('.vacuum-feedback')?.textContent).toContain('Empty bin');
  });

  it('disables lower suction at the bound and does not move a docked robot', () => {
    act(() => useHomeStore.getState().setDeviceSetting(id, 'vacuumSuction', 0));
    act(() => root.render(<Harness />));
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Decrease suction preference"]')?.disabled).toBe(true);
    click('Mop preference'); click('Room');
    expect(useHomeStore.getState().deviceStates[id].on).toBe(false);
    expect(container.querySelector('.vacuum-console')?.getAttribute('data-activity')).toBe('docked');
  });

  it('removes the console and advanced settings when visibility is revoked', () => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    click('More vacuum settings');
    act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }));
    expect(container.textContent).toBe('');
  });

  it('blocks controls after authority is removed and honors reduced motion', () => {
    act(() => root.render(<Harness />));
    const before = useHomeStore.getState().deviceStates[id];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
    click('Start cleaning'); click('Increase suction preference'); click('Mop preference'); click('Spot');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
    expect(container.querySelector('.vacuum-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  });
});
