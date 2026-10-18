// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { LightingController } from './LightingControlPanel';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';

const device = getDevice('living-light')!;
let container: HTMLDivElement;
let root: Root;

/** Render canonical state changes as the embedded Home controller receives them. */
function Harness() {
  const current = useHomeStore((state) => state.deviceStates[device.id]);
  return <LightingController device={device} current={current} />;
}

/** Exercise a visible control rather than invoking its callback outside the component. */
function click(label: string): void {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(button, label).toBeTruthy();
  act(() => button!.click());
}

/** Read the same state consumed by the model, host bridge and persisted snapshot. */
function current() { return useHomeStore.getState().deviceStates[device.id]; }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() {} });
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  useHomeStore.setState({ deviceStates: { ...useHomeStore.getState().deviceStates, [device.id]: { on: false, level: 50, settings: { color: '#FFD166', colorTempK: 3200, lightColorMode: 'color', lightEffect: 'none', autoOffMin: 15 } } } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount()); container.remove();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  vi.unstubAllGlobals();
});

describe('tactile lighting controller', () => {
  it('opens directly and keeps advanced settings and More/Back keyboard focus', () => {
    act(() => root.render(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />));
    expect(container.querySelector('.lighting-console')).toBeTruthy();
    expect(container.querySelector('.device-sheet-primary')).toBeNull();
    const before = current();
    click('More lighting settings');
    expect(container.textContent).toContain('Routines');
    expect(document.activeElement?.textContent).toBe('Back to lighting');
    click('Back to lighting');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More lighting settings');
    expect(current()).toEqual(before);
  });

  it('preserves power-off brightness, colors and preferences through rapid adjustments', () => {
    act(() => root.render(<Harness />));
    for (let index = 0; index < 3; index++) click('Brighten light by 5 percent');
    click('Dim light by 5 percent');
    expect(current()).toMatchObject({ on: false, level: 60, settings: { color: '#FFD166', autoOffMin: 15 } });
    expect(container.querySelector('output')?.textContent).toBe('60%');
    expect(container.querySelector('.lighting-console')?.getAttribute('data-lit')).toBe('false');
    expect(container.textContent).toContain('Power off');
    click(`${device.name} power`);
    expect(current()).toMatchObject({ on: true, level: 60 });
    expect(container.querySelector('.lighting-console')?.getAttribute('data-lit')).toBe('true');
  });

  it('selects white temperature and color without turning the fixture on', () => {
    act(() => root.render(<Harness />));
    click('White'); click('Warm2400 K');
    expect(current()).toMatchObject({ on: false, level: 50, settings: { lightColorMode: 'temperature', colorTempK: 2400, autoOffMin: 15 } });
    expect(container.querySelector('.lighting-white-presets [aria-pressed="true"]')?.textContent).toBe('Warm2400 K');
    click('Color'); click('Rose');
    expect(current()).toMatchObject({ on: false, settings: { lightColorMode: 'color', color: '#FF9AA2', colorTempK: 2400 } });
    expect(container.querySelector('.lighting-colors [aria-pressed="true"]')?.textContent).toBe('Rose');
  });

  it('shows external effects honestly, then clears the effect for manual palette selection', () => {
    act(() => root.render(<Harness />));
    act(() => {
      useHomeStore.getState().toggleDevice(device.id);
      useHomeStore.getState().setDeviceSetting(device.id, 'lightEffect', 'party');
    });
    expect(container.querySelector('output')?.textContent).toBe('50%');
    expect(container.textContent).toContain('Party effect');
    expect(container.querySelector('.lighting-colors [aria-pressed="true"]')).toBeNull();
    expect(container.querySelector('.lighting-modes [aria-pressed="true"]')).toBeNull();
    expect(container.querySelector('.lighting-ring-value')?.getAttribute('stroke')).toBe('#B38CFF');
    click('Color');
    expect(current().settings?.lightEffect).toBe('none');
    expect(container.querySelector('.lighting-colors [aria-pressed="true"]')?.textContent).toBe('Amber');
  });

  it('keeps zero brightness visually dark while the power remains on', () => {
    act(() => root.render(<Harness />));
    act(() => {
      useHomeStore.getState().toggleDevice(device.id);
      useHomeStore.getState().setDeviceSetting(device.id, 'brightness', 0);
    });
    expect(container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('.lighting-console')?.getAttribute('data-lit')).toBe('false');
    expect(container.textContent).toContain('On · zero brightness');
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Dim light by 5 percent"]')?.disabled).toBe(true);
    act(() => useHomeStore.getState().setDeviceSetting(device.id, 'brightness', 100));
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Brighten light by 5 percent"]')?.disabled).toBe(true);
  });

  it('uses the existing reduced-motion preference without adding an animation loop', () => {
    act(() => root.render(<Harness />));
    act(() => useHomeStore.setState({ motionDisabled: true }));
    expect(container.querySelector('.lighting-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  });

  it('removes writable settings when room authority is revoked during More', () => {
    act(() => root.render(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />));
    click('More lighting settings');
    const before = current();
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, fullHome: false, roomIds: [device.roomId], deviceIds: [device.id], controllableDeviceIds: [] } }));
    expect(container.querySelector('.lighting-console')).toBeNull();
    expect(container.querySelector('.lighting-more')).toBeNull();
    expect(container.textContent).toContain('View only');
    expect(current()).toEqual(before);
  });
});
