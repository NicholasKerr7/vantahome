// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { EnergyController } from './EnergyControlPanel';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
import { createEnergyRuntime } from './energySimulation';

let container: HTMLDivElement;
let root: Root;

/** Subscribe as the live embedded inspector does, without separate controller state. */
function Harness({ id }: { id: string }) {
  const current = useHomeStore((state) => state.deviceStates[id]);
  return <EnergyController device={getDevice(id)!} current={current} />;
}

/** Use a visible primary or accessible action rather than invoking a component callback. */
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
  useHomeStore.setState({ ...createDefaultState(), energy: null, energyMode: 'local', powerPausedDeviceIds: [], access: FULL_SCENE_ACCESS });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount()); container.remove();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  useHomeStore.setState({ ...createDefaultState(), energy: null, energyMode: 'local', powerPausedDeviceIds: [], access: FULL_SCENE_ACCESS });
  vi.unstubAllGlobals();
});

describe('selected-device energy consoles', () => {
  it.each(['energy', 'solar', 'battery', 'generator'])('opens %s directly and retains advanced settings and focus', (kind) => {
    const id = `utility-${kind}`;
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    expect(container.querySelector('.energy-console')?.getAttribute('data-kind')).toBe(kind);
    const before = useHomeStore.getState().deviceStates[id];
    click('More energy settings');
    expect(document.activeElement?.textContent).toBe('Back to energy console');
    click('Back to energy console');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More energy settings');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  });

  it('changes battery preferences without editing sampled charge or powering it on', () => {
    act(() => useHomeStore.getState().toggleDevice('utility-battery'));
    const before = useHomeStore.getState().deviceStates['utility-battery'];
    act(() => root.render(<Harness id="utility-battery" />));
    click('40%'); click('Self-Use');
    expect(useHomeStore.getState().deviceStates['utility-battery']).toMatchObject({ on: before.on, level: before.level, settings: { reservePercent: 40, storageMode: 'self-use' } });
    expect(container.querySelector('output')?.textContent).toBe(`${before.level}%`);
    expect(container.textContent).toContain('saved preferences');
    expect(container.querySelector('.energy-reserve input')?.getAttribute('value')).toBe('40');
    click('Enable battery preview');
    expect(useHomeStore.getState().deviceStates['utility-battery']).toMatchObject({ on: true, level: before.level, settings: { reservePercent: 40, storageMode: 'self-use' } });
    click('Disable battery preview');
    expect(useHomeStore.getState().deviceStates['utility-battery']).toMatchObject({ on: false, level: before.level, settings: { reservePercent: 40, storageMode: 'self-use' } });
  });

  it('changes start preference without starting the generator, then reports explicit start and stop', () => {
    act(() => root.render(<Harness id="utility-generator" />));
    click('Manual');
    expect(useHomeStore.getState().deviceStates['utility-generator'].on).toBe(false);
    expect(container.querySelector('output')?.textContent).toBe('0.00kW');
    click('Start simulation');
    expect(container.querySelector('output')?.textContent).toBe('3.90kW');
    click('Stop simulation');
    expect(container.querySelector('output')?.textContent).toBe('0.00kW');
    expect(useHomeStore.getState().deviceStates['utility-generator'].settings?.generatorMode).toBe('manual');
  });

  it('runs grid scenarios on only the selected meter and never infers backup takeover', () => {
    const before = useHomeStore.getState().deviceStates;
    act(() => root.render(<Harness id="utility-energy" />));
    click('Simulate outage');
    expect(container.textContent).toContain('Grid outage · sample');
    expect(container.querySelector('output')?.textContent).toBe('0.68kW');
    expect(useHomeStore.getState().deviceStates['utility-generator']).toEqual(before['utility-generator']);
    expect(useHomeStore.getState().deviceStates['utility-battery']).toEqual(before['utility-battery']);
    expect(container.textContent).toContain('do not start backup equipment');
    click('Restore grid sample');
    expect(useHomeStore.getState().deviceStates['utility-energy'].settings?.gridAvailable).toBe(true);
  });

  it('checks a solar sample without toggling power or inventing newer production', () => {
    const before = useHomeStore.getState().deviceStates['utility-solar'];
    act(() => root.render(<Harness id="utility-solar" />));
    click('Check sample');
    expect(container.querySelector('output')?.textContent).toBe('3.20kW');
    expect(container.textContent).toContain('Sample checked');
    expect(useHomeStore.getState().deviceStates['utility-solar']).toMatchObject({ on: before.on, level: before.level, settings: { sampleChecked: true } });
  });

  it('does not expose a console or default readings after view permission is revoked', () => {
    act(() => root.render(<DeviceControlSheet deviceId="utility-battery" onClose={() => undefined} />));
    click('More energy settings');
    act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }));
    expect(container.querySelector('.energy-console')).toBeNull();
    expect(container.querySelector('.energy-more')).toBeNull();
    expect(container.textContent).not.toContain('13.5');
  });

  it('disables stale control callbacks after authority changes and retains reduced-motion presentation', () => {
    act(() => root.render(<Harness id="utility-generator" />));
    const before = useHomeStore.getState().deviceStates['utility-generator'];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
    click('Start simulation');
    expect(useHomeStore.getState().deviceStates['utility-generator']).toEqual(before);
    expect(container.querySelector('.energy-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  });
});


describe('coordinated property energy console', () => {
  it('inspects source explanations without commands and reverses the storage path while charging', () => {
    act(() => useHomeStore.setState({ night: false }));
    act(() => root.render(<Harness id="utility-energy" />));
    click('Power flow'); click('Start energy simulation');
    const before = useHomeStore.getState();
    const storage = [...container.querySelectorAll<HTMLButtonElement>('.energy-flow-source')].find((button) => button.getAttribute('aria-label')?.startsWith('Storage:'))!;
    act(() => storage.click());
    expect(storage.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.energy-flow-status')?.textContent).toContain('Storage is charging');
    expect(container.querySelector('[data-source="battery"]')?.getAttribute('data-direction')).toBe('out');
    expect(container.querySelector('[data-source="solar"]')?.getAttribute('data-direction')).toBe('in');
    expect(container.querySelector('[data-source="generator"]')).toBeNull();
    expect(useHomeStore.getState().energy).toBe(before.energy);
    expect(useHomeStore.getState().deviceStates).toBe(before.deviceStates);
    act(() => storage.click());
    expect(storage.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.energy-flow-status')?.textContent).toContain('Requested loads are supplied');
    click('Pause energy simulation');
    expect(container.querySelectorAll('.energy-flow-current g')).toHaveLength(0);
  });

  it('removes selected source readings when whole-home access is lost', () => {
    act(() => root.render(<Harness id="utility-energy" />));
    click('Power flow'); click('Start energy simulation');
    const solar = container.querySelector<HTMLButtonElement>('.energy-flow-source')!;
    act(() => solar.click());
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, fullHome: false } }));
    expect(container.querySelector('.energy-flow-home')?.textContent).toContain('—');
    expect(container.querySelectorAll('.energy-flow-current g')).toHaveLength(0);
    expect(container.querySelector('.energy-flow-status')?.textContent).toContain('Power flow is unavailable');
  });

  it('starts and pauses the shared flow without changing requested device settings', () => {
    const before = useHomeStore.getState().deviceStates;
    act(() => root.render(<Harness id="utility-energy" />));
    click('Power flow');
    expect(container.textContent).toContain('Illustrative 12 kW solar');
    click('Start energy simulation');
    expect(useHomeStore.getState().energy?.enabled).toBe(true);
    expect(container.querySelector('.energy-flow-home')?.textContent).toContain('kW');
    expect(useHomeStore.getState().deviceStates).toBe(before);
    act(() => useHomeStore.getState().advanceEnergy(5));
    const runtime = useHomeStore.getState().energy!;
    click('Pause energy simulation');
    expect(useHomeStore.getState().energy).toEqual({ ...runtime, enabled: false });
    expect(useHomeStore.getState().deviceStates).toBe(before);
    expect(container.textContent).toContain('Simulation paused');
    click('Resume energy simulation');
    expect(useHomeStore.getState().energy).toEqual(runtime);
  });

  it('keeps partial grants and shared-home mode from starting local power flow', () => {
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, fullHome: false } }));
    act(() => root.render(<Harness id="utility-energy" />));
    click('Power flow'); click('Start energy simulation');
    expect(useHomeStore.getState().energy).toBeNull();
    act(() => useHomeStore.setState({ access: FULL_SCENE_ACCESS, energyMode: 'shared-paused' }));
    click('Start energy simulation');
    expect(useHomeStore.getState().energy).toBeNull();
    expect(container.textContent).toContain('Power flow is unavailable in shared-home mode');
    expect(container.querySelector('.energy-flow-home')?.textContent).not.toContain('0.00 kW');
  });

  it('shows the actual runtime charge in the battery console and advanced status while preserving intent', () => {
    const state = useHomeStore.getState();
    act(() => useHomeStore.setState({ energy: { ...createEnergyRuntime(state.deviceStates), batteryKwh: 12 } }));
    const before = useHomeStore.getState().deviceStates['utility-battery'];
    act(() => root.render(<Harness id="utility-battery" />));
    expect(container.querySelector('output')?.textContent).toBe('50%');
    click('More energy settings'); click('Status');
    expect(container.textContent).toContain('Linked instantaneous readings');
    expect(container.textContent).toContain('50%');
    expect(useHomeStore.getState().deviceStates['utility-battery']).toEqual(before);
  });
});
