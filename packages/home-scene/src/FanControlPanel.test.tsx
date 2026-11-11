// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { FanController } from './FanControlPanel';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;
const id = 'living-fan';

/** Exercise real guarded state and rendered controls without a parallel implementation. */
function Harness({ deviceId = id }: { deviceId?: string }) {
  const current = useHomeStore((state) => state.deviceStates[deviceId]);
  return <FanController device={getDevice(deviceId)!} current={current} />;
}

/** Activate an ordinary accessible control. */
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

describe('fan airflow console', () => {
  it('keeps the ceiling housing outside the rotating tilted blade plane', () => {
    act(() => root.render(<Harness />));
    const artwork = container.querySelector('.fan-suspended')!;
    const rotor = artwork.querySelector('.fan-ceiling-rotor')!;
    expect(rotor.parentElement?.className).toBe('fan-ceiling-plane');
    expect(artwork.querySelector('.fan-suspended-housing')?.parentElement).toBe(artwork);
    expect(artwork.querySelector('.fan-suspended-hub')?.parentElement).toBe(artwork);
    expect(rotor.querySelectorAll('svg > g[transform]')).toHaveLength(3);
    const paintIds = [...artwork.querySelectorAll('defs [id]')].map((paint) => paint.id);
    expect(new Set(paintIds).size).toBe(paintIds.length);
    expect(artwork.querySelector('.fan-extractor-grille')).toBeNull();
  });

  it('preserves power when editing speed, direction and sleep and restores the accepted preview', () => {
    act(() => root.render(<Harness />));
    click('Fan power'); click('Balanced fan speed 60%'); click('Fan direction reverse'); click('Fan sleep mode');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, level: 60, settings: { fanDirection: 'reverse', fanSleepMode: true } });
    expect(container.querySelector('.fan-instrument')?.getAttribute('data-running')).toBe('false');
    click('Fan power');
    expect(container.textContent).toContain('Sleep caps preview at 35% · Now 35%');
    expect(container.querySelector('output')?.textContent).toBe('60%');
    expect(container.querySelector('.fan-instrument')?.getAttribute('data-running')).toBe('true');
  });

  it('keeps Sleep visible when a higher speed preset is selected', () => {
    act(() => root.render(<Harness />));
    click('Fan sleep mode'); click('Boost fan speed 100%');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: true, level: 100, settings: { fanSleepMode: true } });
    expect(container.textContent).toContain('Now 35%');
    click('Fan sleep mode');
    expect(container.textContent).toContain('Preview airflow 100%');
  });

  it('resolves rapid steps against current state and handles zero without a running indicator', () => {
    act(() => root.render(<Harness />));
    const plus = container.querySelector<HTMLButtonElement>('[aria-label="Increase fan speed"]')!;
    act(() => { plus.click(); plus.click(); plus.click(); });
    expect(useHomeStore.getState().deviceStates[id].level).toBe(65);
    click('Boost fan speed 100%');
    expect(plus.disabled).toBe(true);
    act(() => useHomeStore.getState().setDeviceSetting(id, 'speed', 0));
    expect(container.textContent).toContain('Stopped at 0%');
    expect(container.querySelector('.fan-instrument')?.getAttribute('data-running')).toBe('false');
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Decrease fan speed"]')?.disabled).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6, 7])('presents bathroom %s as a one-way extractor rather than a reversible ceiling fan', (bathroom) => {
    act(() => root.render(<Harness deviceId={`bath-${bathroom}-fan`} />));
    expect(container.querySelector('.fan-instrument')?.getAttribute('data-extractor')).toBe('true');
    expect(container.querySelector('.fan-extractor-grille')).toBeTruthy();
    expect(container.textContent).toContain('VENTILATION');
    expect(container.querySelector('[aria-label="One-way exhaust from bathroom to outdoors"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Ventilation quiet mode"]')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Forward|Reverse|Oscillation|Integrated light|Sleep/);
  });

  it('keeps existing extractor settings while presenting a quiet, power-preserving exhaust preview', () => {
    const deviceId = 'bath-1-fan';
    const saved = { ...useHomeStore.getState().deviceStates[deviceId], on: false, level: 60, settings: { fanDirection: 'reverse', fanSleepMode: false, fanTimerMin: 15 } };
    act(() => useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [deviceId]: saved } })));
    act(() => root.render(<Harness deviceId={deviceId} />));
    expect(useHomeStore.getState().deviceStates[deviceId]).toEqual(saved);
    click('Ventilation quiet mode'); click('Boost fan speed 100%');
    expect(useHomeStore.getState().deviceStates[deviceId]).toMatchObject({ on: false, level: 100, settings: { fanDirection: 'reverse', fanSleepMode: true, fanTimerMin: 15 } });
    expect(container.querySelector('.fan-instrument')?.getAttribute('data-running')).toBe('false');
    click('Ventilation power');
    expect(container.textContent).toContain('Quiet caps preview at 35% · Now 35%');
    expect(container.querySelector('.fan-instrument')?.getAttribute('data-running')).toBe('true');
    click('Ventilation quiet mode'); click('Normal fan speed 60%');
    expect(container.textContent).toContain('Preview airflow 60%');
    click('Quiet fan speed 35%');
    expect(container.querySelector('output')?.textContent).toBe('35%');
    expect(useHomeStore.getState().deviceStates[deviceId].settings?.fanTimerMin).toBe(15);
  });

  it('keeps inappropriate extractor controls out of every More page and restores focus on return', () => {
    act(() => root.render(<Harness deviceId="bath-1-fan" />));
    click('More ventilation settings');
    const before = useHomeStore.getState().deviceStates['bath-1-fan'];
    for (const group of ['Controls', 'Modes', 'Routines', 'Status']) {
      click(group);
      for (let page = 0; page < 20; page += 1) {
        expect(container.textContent).not.toMatch(/Forward|Reverse|Oscillation|Integrated light|Auto mode/);
        const next = container.querySelector<HTMLButtonElement>('[aria-label="Next controls page"]');
        if (!next || next.disabled) break;
        act(() => next.click());
      }
    }
    click('Back to ventilation console');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More ventilation settings');
    expect(useHomeStore.getState().deviceStates['bath-1-fan']).toEqual(before);
  });

  it('keeps extractor controls guarded and readable with motion disabled', () => {
    act(() => root.render(<Harness deviceId="bath-1-fan" />));
    const before = useHomeStore.getState().deviceStates['bath-1-fan'];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
    for (const label of ['Ventilation power', 'Increase fan speed', 'Boost fan speed 100%', 'Ventilation quiet mode']) click(label);
    expect(useHomeStore.getState().deviceStates['bath-1-fan']).toEqual(before);
    expect(container.querySelector('.fan-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  });

  it('preserves settings and focus through More and Back', () => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    click('Fan direction reverse');
    const before = useHomeStore.getState().deviceStates[id];
    click('More fan settings');
    expect(container.querySelector('[aria-label="Device settings"]')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Back to airflow console');
    click('Back to airflow console');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More fan settings');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  });

  it('removes an advanced sheet when visibility is revoked', () => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    click('More fan settings');
    act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }));
    expect(container.textContent).toBe('');
  });

  it('blocks stale actions after authority changes while keeping reduced-motion presentation', () => {
    act(() => root.render(<Harness />));
    const before = useHomeStore.getState().deviceStates[id];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
    for (const label of ['Fan power', 'Increase fan speed', 'Boost fan speed 100%', 'Fan direction reverse', 'Fan sleep mode']) click(label);
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
    expect(container.querySelector('.fan-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  });
});
