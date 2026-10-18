// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice, DEVICES } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
import { readClimateControllerState } from './climateController';
import { ClimateController } from './ClimateControlPanel';

const device = getDevice('master-ac')!;
let container: HTMLDivElement;
let root: Root;

/** Subscribe to the canonical state so the controller reacts to real reducer outcomes. */
function ClimateHarness() {
  const current = useHomeStore((state) => state.deviceStates[device.id]);
  return <ClimateController device={device} current={current} />;
}

/** Activate a visible labeled key through its ordinary button event. */
function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(button, label).toBeTruthy();
  act(() => button!.click());
}

/** Inspect the same canonical projection displayed in both controller surfaces. */
function currentClimate() { return readClimateControllerState(device, useHomeStore.getState().deviceStates[device.id]); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() {} });
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS, tempUnit: 'C' });
  useHomeStore.setState({ deviceStates: { ...useHomeStore.getState().deviceStates, [device.id]: { on: false, level: 50, settings: { tempC: 22, mode: 'cold', acFanSpeed: 60, acSwingMode: 'both' } } } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount()); container.remove();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS, tempUnit: 'C' });
  vi.unstubAllGlobals();
});

describe('climate controller user flow', () => {
  it('opens the controller directly and returns from More without changing settings', () => {
    act(() => root.render(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />));
    expect(container.querySelector('.climate-console')).toBeTruthy();
    expect(container.querySelector('.device-sheet-primary')).toBeNull();
    expect(container.querySelector('[aria-label="Next controls page"]')).toBeNull();
    click('More climate settings');
    expect(container.querySelector('.climate-more')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Back to climate');
    expect(container.textContent).toContain('Routines');
    click('Back to climate');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More climate settings');
    expect(currentClimate()).toMatchObject({ on: false, targetC: 22, fanSpeed: 60, mode: 'cold', swing: 'both' });
  });

  it('handles repeated temperature and fan presses without turning on or overwriting other settings', () => {
    act(() => root.render(<ClimateHarness />));
    for (let i = 0; i < 3; i++) click('Increase target temperature');
    click('Decrease target temperature');
    click('Increase fan speed'); click('Decrease fan speed');
    expect(currentClimate()).toMatchObject({ on: false, targetC: 24, fanSpeed: 60, mode: 'cold', swing: 'both', airflowStrength: 0 });
    expect(container.textContent).toContain('Your settings are remembered');
    expect(container.querySelector('.climate-console')?.getAttribute('data-powered')).toBe('false');
  });

  it('uses exclusive airflow presets and clears them on a manual fan change', () => {
    act(() => root.render(<ClimateHarness />));
    click(`${device.name} power`); click('Quiet');
    expect(currentClimate()).toMatchObject({ on: true, fanSpeed: 60, preset: 'quiet', airflowStrength: .3 });
    expect(container.textContent).toContain('Preview airflow 30%');
    click('Turbo');
    expect(currentClimate()).toMatchObject({ preset: 'turbo', airflowStrength: 1 });
    click('Eco');
    expect(currentClimate()).toMatchObject({ preset: 'eco', airflowStrength: .5 });
    click('Decrease fan speed');
    expect(currentClimate()).toMatchObject({ fanSpeed: 50, preset: 'normal', airflowStrength: .5 });
    click('Quiet'); click('Normal');
    expect(currentClimate()).toMatchObject({ preset: 'normal', fanSpeed: 50 });
    click(`${device.name} power`);
    expect(currentClimate()).toMatchObject({ on: false, airflowStrength: 0, targetC: 22 });
  });

  it('keeps actual supported modes and swing choices on the primary surface', () => {
    act(() => root.render(<ClimateHarness />));
    click('Dry');
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Airflow swing"]')!;
    act(() => { select.value = 'horizontal'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(currentClimate()).toMatchObject({ on: false, mode: 'dry', swing: 'horizontal' });
    click('Fan');
    expect(currentClimate().mode).toBe('fan');
    expect(container.textContent).not.toContain('Heat');
  });

  it('updates Fahrenheit presentation without mutating the Celsius setpoint or remounting the controller', () => {
    act(() => root.render(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />));
    const original = container.querySelector('.climate-console');
    act(() => useHomeStore.setState({ tempUnit: 'F' }));
    expect(container.querySelector('.climate-console')).toBe(original);
    expect(container.querySelector('[aria-label="Target temperature in degrees Fahrenheit"]')?.textContent).toBe('72°F');
    expect(container.querySelector('.device-sheet-state')?.textContent).toContain('Target 72°F');
    expect(currentClimate().targetC).toBe(22);
    click('Increase target temperature');
    expect(currentClimate().targetC).toBe(23);
    expect(container.querySelector('.climate-reading output')?.textContent).toBe('73°F');
  });

  it('removes writable controls immediately after access revocation even while More is open', () => {
    act(() => root.render(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />));
    click('More climate settings');
    const before = useHomeStore.getState().deviceStates[device.id];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, fullHome: false, roomIds: [device.roomId], deviceIds: [device.id], controllableDeviceIds: [] } }));
    expect(container.querySelector('.climate-more')).toBeNull();
    expect(container.querySelector('.climate-console')).toBeNull();
    expect(container.textContent).toContain('View only');
    expect(useHomeStore.getState().deviceStates[device.id]).toBe(before);
  });

  it('bounds keys and preserves reduced-motion presentation', () => {
    act(() => { useHomeStore.setState({ motionDisabled: true }); root.render(<ClimateHarness />); });
    act(() => { useHomeStore.getState().setDeviceSetting(device.id, 'tempC', 28); useHomeStore.getState().setDeviceSetting(device.id, 'acFanSpeed', 100); });
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Increase target temperature"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Increase fan speed"]')?.disabled).toBe(true);
    expect(container.querySelector('.climate-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
    act(() => { useHomeStore.getState().setDeviceSetting(device.id, 'tempC', 15); useHomeStore.getState().setDeviceSetting(device.id, 'acFanSpeed', 0); });
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Decrease target temperature"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Decrease fan speed"]')?.disabled).toBe(true);
  });

  it('opens a newly selected AC on its own controller rather than retaining another device More page', () => {
    act(() => root.render(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />));
    click('More climate settings');
    const other = DEVICES.find((candidate) => candidate.kind === 'ac' && candidate.id !== device.id)!;
    act(() => root.render(<DeviceControlSheet deviceId={other.id} onClose={() => undefined} />));
    expect(container.querySelector('.climate-more')).toBeNull();
    expect(container.querySelector('.climate-console')).toBeTruthy();
    expect(container.querySelector('.device-sheet-identity h2')?.textContent).toBe(other.name);
  });
});
