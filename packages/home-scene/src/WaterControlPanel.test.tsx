// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { WaterController } from './WaterControlPanel';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;

/** Subscribe to the same canonical state used by the live embedded inspector. */
function Harness({ id }: { id: string }) {
  const current = useHomeStore((state) => state.deviceStates[id]);
  return <WaterController device={getDevice(id)!} current={current} />;
}

/** Activate visible semantic controls so the event wiring is exercised. */
function click(label: string): void {
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

describe('water console full controls', () => {
  it.each(['utility-water', 'utility-water-heater'])('opens %s with its correct art, More/Back and focus retention', (id) => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    expect(container.querySelector('.water-console')?.getAttribute('data-kind')).toBe(getDevice(id)!.kind);
    const before = useHomeStore.getState().deviceStates[id];
    click('More water settings');
    expect(document.activeElement?.textContent).toBe('Back to water console');
    expect(container.querySelector('[aria-label="Device settings"]')).toBeTruthy();
    click('Back to water console');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More water settings');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  });

  it('preserves heater power while rapidly changing the target, mode and recirculation', () => {
    const id = 'utility-water-heater';
    act(() => useHomeStore.getState().toggleDevice(id));
    act(() => root.render(<Harness id={id} />));
    const increase = container.querySelector<HTMLButtonElement>('[aria-label="Increase water target temperature"]')!;
    act(() => { increase.click(); increase.click(); increase.click(); });
    click('Boost'); click('Recirculation preference');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { tempC: 55, heaterMode: 'boost', recirculation: false } });
    click('Water heater power');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: true, settings: { tempC: 55, heaterMode: 'boost', recirculation: false } });
    expect(container.textContent).toContain('No tank temperature');
  });

  it('uses Fahrenheit in the target and sheet header while keeping one-degree Celsius actions', () => {
    act(() => useHomeStore.setState({ tempUnit: 'F' }));
    act(() => root.render(<DeviceControlSheet deviceId="utility-water-heater" onClose={() => undefined} />));
    expect(container.querySelector('output')?.textContent).toBe('126°F');
    expect(container.querySelector('.device-sheet-state')?.textContent).toContain('Target 126°F');
    click('Increase water target temperature');
    expect(container.querySelector('output')?.textContent).toBe('127°F');
    expect(useHomeStore.getState().deviceStates['utility-water-heater'].settings?.tempC).toBe(53);
  });

  it('disables adjustments at heater and budget limits', () => {
    act(() => useHomeStore.getState().setDeviceSetting('utility-water-heater', 'tempC', 70));
    act(() => root.render(<Harness id="utility-water-heater" />));
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Increase water target temperature"]')?.disabled).toBe(true);
    act(() => useHomeStore.getState().setDeviceSetting('utility-water', 'waterBudgetL', 100));
    act(() => root.render(<Harness id="utility-water" />));
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Decrease water budget"]')?.disabled).toBe(true);
  });

  it('changes meter preferences without changing sample readings, heater state or meter power', () => {
    act(() => root.render(<Harness id="utility-water" />));
    const before = useHomeStore.getState().deviceStates;
    click('Increase water budget'); click('Increase water budget'); click('Leak alert preference'); click('Pressure alert preference'); click('Check sample');
    const meter = useHomeStore.getState().deviceStates['utility-water'];
    expect(meter).toMatchObject({ on: before['utility-water'].on, level: before['utility-water'].level, settings: { waterBudgetL: 260, waterLeakAlerts: false, waterPressureAlerts: false, sampleChecked: true } });
    expect(container.querySelector('.water-reading output')?.textContent).toBe('8L/min');
    expect(container.textContent).toContain('Sample checked');
    expect(container.textContent).toContain('No live meter or shutoff valve');
    expect(useHomeStore.getState().deviceStates['utility-water-heater']).toEqual(before['utility-water-heater']);
  });

  it('retains leak warnings after sample checks and shows unknown data explicitly', () => {
    const before = useHomeStore.getState().deviceStates;
    act(() => useHomeStore.setState({ deviceStates: { ...before, 'utility-water': { ...before['utility-water'], settings: { ...before['utility-water'].settings, waterLeakDetected: true, waterLpm: Number.NaN } } } }));
    act(() => root.render(<Harness id="utility-water" />));
    click('Check sample');
    expect(container.querySelector('.water-reading output')?.textContent).toBe('—');
    expect(container.querySelector('.water-leak-state')?.textContent).toBe('Leak detected in sample');
    expect(container.querySelector('.water-leak-state')?.getAttribute('data-alert')).toBe('true');
    expect(container.querySelector('.water-reading p')?.textContent).toBe('Leak detected · sample');
  });

  it.each(['utility-water', 'utility-water-heater'])('removes %s console and advanced settings when visibility is revoked', (id) => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    click('More water settings');
    act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }));
    expect(container.textContent).toBe('');
  });

  it('blocks revoked control callbacks and preserves reduced-motion preference', () => {
    act(() => root.render(<Harness id="utility-water-heater" />));
    const before = useHomeStore.getState().deviceStates['utility-water-heater'];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
    click('Increase water target temperature'); click('Water heater power'); click('Vacation');
    expect(useHomeStore.getState().deviceStates['utility-water-heater']).toEqual(before);
    expect(container.querySelector('.water-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  });
});
