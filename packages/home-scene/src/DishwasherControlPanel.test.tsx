// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { DishwasherController } from './DishwasherControlPanel';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;
const deviceId = 'kitchen-dishwasher';

/** Exercise the real guarded state and UI together, including revocation during an open console. */
function Harness() {
  const current = useHomeStore((state) => state.deviceStates[deviceId]);
  return <DishwasherController device={getDevice(deviceId)!} current={current} />;
}

/** Activate a named button through its ordinary click handler. */
function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(button, label).toBeTruthy();
  act(() => button!.click());
}

/** Select a real temperature choice through the controlled select event. */
function selectTemperature(value: string) {
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Temperature preference"]')!;
  act(() => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
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

describe('dishwasher console', () => {
  it('shows a distinct chamber, six programs and truthful static sample readings', () => {
    act(() => root.render(<Harness />));
    expect(container.querySelector('.dishwasher-artwork')).toBeTruthy();
    expect(container.querySelectorAll('.dishwasher-cycle-rail button')).toHaveLength(6);
    expect(container.textContent).toContain('58 min');
    expect(container.textContent).toContain('0% progress · Sample');
    expect(container.textContent).toContain('Time and progress are fixed samples');
    expect(container.querySelector('.dishwasher-artwork')?.getAttribute('data-running')).toBe('false');
  });

  it('saves program, temperature and existing Dry Boost preference without starting or editing another machine', () => {
    const washer = useHomeStore.getState().deviceStates['laundry-washer'];
    act(() => root.render(<Harness />));
    click('Eco'); selectTemperature('Warm'); click('Dry Boost preference');
    expect(useHomeStore.getState().deviceStates[deviceId]).toMatchObject({ on: false, settings: { cycle: 'Eco', washTemp: 'Warm', extraSpin: true } });
    expect(useHomeStore.getState().deviceStates['laundry-washer']).toBe(washer);
    expect(container.querySelector('.dishwasher-caption')?.textContent).toBe('PROGRAM · Eco');
  });

  it('preserves pause through edits and keeps samples unchanged through Resume and Stop', () => {
    act(() => root.render(<Harness />));
    click('Start cycle');
    expect(container.querySelector('.dishwasher-artwork')?.getAttribute('data-running')).toBe('true');
    click('Pause cycle'); click('Intensive'); selectTemperature('Hot');
    expect(container.textContent).toContain('Paused');
    click('Resume cycle'); click('Stop cycle');
    expect(useHomeStore.getState().deviceStates[deviceId]).toMatchObject({ on: false, settings: { dishwasherActivity: 'stopped', cycle: 'Intensive' } });
    expect(container.querySelector('.dishwasher-artwork')?.getAttribute('data-running')).toBe('false');
    expect(container.textContent).toContain('58 min');
    expect(container.textContent).toContain('0% progress · Sample');
  });

  it('does not turn malformed samples into a successful cycle', () => {
    act(() => {
      const deviceStates = useHomeStore.getState().deviceStates;
      useHomeStore.setState({ deviceStates: { ...deviceStates, [deviceId]: { on: false, level: 0, settings: { progress: Number.NaN, remainingMin: -1 } } } });
      root.render(<Harness />);
    });
    expect(container.textContent).toContain('Progress unavailable');
    expect(container.textContent).not.toMatch(/Complete|100%/);
  });

  it('retains the complete advanced panel and keyboard focus through More and Back', () => {
    act(() => root.render(<DeviceControlSheet deviceId={deviceId} onClose={() => undefined} />));
    click('Start cycle'); click('Pause cycle');
    const before = useHomeStore.getState().deviceStates[deviceId];
    click('More dishwasher settings');
    expect(container.querySelector('[aria-label="Device settings"]')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Back to dishwasher console');
    click('Back to dishwasher console');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More dishwasher settings');
    expect(useHomeStore.getState().deviceStates[deviceId]).toEqual(before);
  });

  it('removes an open advanced panel when the view grant is revoked', () => {
    act(() => root.render(<DeviceControlSheet deviceId={deviceId} onClose={() => undefined} />));
    click('More dishwasher settings');
    act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }));
    expect(container.textContent).toBe('');
  });

  it('blocks commands and preferences after control revocation and forwards the motion policy', () => {
    act(() => root.render(<Harness />));
    const before = useHomeStore.getState().deviceStates[deviceId];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
    click('Start cycle'); click('Eco'); click('Dry Boost preference');
    expect(useHomeStore.getState().deviceStates[deviceId]).toBe(before);
    expect(container.querySelector<HTMLSelectElement>('select')?.disabled).toBe(true);
    expect(container.querySelector('.dishwasher-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  });
});
