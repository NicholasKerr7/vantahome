// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { LaundryController } from './LaundryControlPanel';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;
const washerId = 'laundry-washer';
const dryerId = 'laundry-dryer';

/** Exercise controls against the real guarded store rather than a parallel state implementation. */
function Harness({ id = washerId }: { id?: string }) {
  const current = useHomeStore((state) => state.deviceStates[id]);
  return <LaundryController device={getDevice(id)!} current={current} />;
}

/** Activate a visible named control through its normal event handler. */
function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(button, label).toBeTruthy();
  act(() => button!.click());
}

/** Select an actual catalog choice while preserving its original numeric or string type. */
function select(label: string, value: string) {
  const input = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  expect(input).toBeTruthy();
  act(() => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); });
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

describe('independent laundry consoles', () => {
  it('shows the authored stack with only the selected washer controls and no companion readings', () => {
    act(() => root.render(<Harness />));
    expect(container.querySelector('.laundry-stack')?.getAttribute('aria-label')).toContain('washer below');
    expect(container.querySelectorAll('.laundry-stack-unit[data-selected="true"]')).toHaveLength(1);
    expect(container.textContent).toContain('Lower washer · Independent controls');
    expect(container.querySelector('select[aria-label="Temperature preference"]')).toBeTruthy();
    expect(container.querySelector('select[aria-label="Heat preference"]')).toBeNull();
    expect(container.textContent).toContain('42 min');
    expect(container.textContent).not.toContain('45 min');
  });

  it('saves washer preferences while stopped without starting the washer or editing the dryer', () => {
    const dryer = useHomeStore.getState().deviceStates[dryerId];
    act(() => root.render(<Harness />));
    click('Delicate'); select('Temperature preference', 'Cold'); select('Spin preference', '800');
    expect(useHomeStore.getState().deviceStates[washerId]).toMatchObject({ on: false, settings: { cycle: 'Delicate', washTemp: 'Cold', spinSpeedRpm: 800 } });
    expect(useHomeStore.getState().deviceStates[dryerId]).toBe(dryer);
  });

  it('retains Pause through preference edits and independently resumes and stops the drum', () => {
    act(() => root.render(<Harness />));
    click('Start cycle');
    expect(container.querySelector('.laundry-machine')?.getAttribute('data-running')).toBe('true');
    click('Pause cycle'); click('Quick'); select('Temperature preference', 'Warm');
    expect(container.textContent).toContain('Paused');
    click('Resume cycle');
    expect(useHomeStore.getState().deviceStates[washerId].on).toBe(true);
    click('Stop cycle');
    expect(container.textContent).toContain('Stopped');
    expect(container.querySelector('.laundry-machine')?.getAttribute('data-running')).toBe('false');
    expect(container.textContent).toContain('42 min');
    expect(container.textContent).toContain('0% progress · Sample');
  });

  it('uses dryer-specific preferences and a separately selected upper machine', () => {
    const washer = useHomeStore.getState().deviceStates[washerId];
    act(() => root.render(<Harness id={dryerId} />));
    expect(container.querySelector('.laundry-stack')?.getAttribute('aria-label')).toContain('dryer above');
    expect(container.querySelector('select[aria-label="Spin preference"]')).toBeNull();
    click('Air Fluff'); select('Heat preference', 'Low'); select('Dryness preference', 'Damp'); click('Start cycle');
    expect(useHomeStore.getState().deviceStates[dryerId]).toMatchObject({ on: true, settings: { cycle: 'Air Fluff', heatLevel: 'Low', drynessLevel: 'Damp' } });
    expect(useHomeStore.getState().deviceStates[washerId]).toBe(washer);
    expect(container.textContent).toContain('Drying preview');
    expect(container.textContent).toContain('45 min');
  });

  it('labels unknown samples and maintenance without claiming healthy or completed operation', () => {
    act(() => {
      const deviceStates = useHomeStore.getState().deviceStates;
      useHomeStore.setState({ deviceStates: { ...deviceStates, [dryerId]: { ...deviceStates[dryerId], settings: { remainingMin: -1, progress: Number.NaN, lintFilterOk: false } } } });
      root.render(<Harness id={dryerId} />);
    });
    expect(container.textContent).toContain('Progress unavailable');
    expect(container.textContent).toContain('lint filter needs cleaning');
    expect(container.textContent).not.toMatch(/Complete|100%/);
  });

  it('retains full advanced controls, settings and keyboard focus through More and Back', () => {
    act(() => root.render(<DeviceControlSheet deviceId={washerId} onClose={() => undefined} />));
    click('Start cycle'); click('Pause cycle');
    const before = useHomeStore.getState().deviceStates[washerId];
    click('More laundry settings');
    expect(container.querySelector('[aria-label="Device settings"]')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Back to laundry console');
    click('Back to laundry console');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More laundry settings');
    expect(useHomeStore.getState().deviceStates[washerId]).toEqual(before);
  });

  it('removes the entire sheet on revoked visibility, including an open advanced panel', () => {
    act(() => root.render(<DeviceControlSheet deviceId={dryerId} onClose={() => undefined} />));
    click('More laundry settings');
    act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }));
    expect(container.textContent).toBe('');
  });

  it('blocks revoked actions and exposes profile motion policy to the shared motion lifecycle', () => {
    act(() => root.render(<Harness />));
    const before = useHomeStore.getState().deviceStates[washerId];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
    click('Start cycle'); click('Quick');
    expect(useHomeStore.getState().deviceStates[washerId]).toBe(before);
    expect(container.querySelector('.laundry-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
    expect([...container.querySelectorAll('select')].every((item) => item.disabled)).toBe(true);
  });
});
