// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
import { BlindsController } from './BlindsControlPanel';

const device = getDevice('master-blinds')!;
let container: HTMLDivElement;
let root: Root;

/** Render updates from the canonical store rather than an optimistic local controller copy. */
function Harness() {
  const current = useHomeStore((state) => state.deviceStates[device.id]);
  return <BlindsController device={device} current={current} />;
}

/** Activate a real labeled action through the same DOM event as a pointer or keyboard press. */
function click(label: string) {
  const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.getAttribute('aria-label') === label || button.textContent === label);
  expect(target, label).toBeTruthy();
  act(() => target!.click());
}

/** Read the persisted model state used by the house, quick controls and native inspector. */
function position() { return useHomeStore.getState().deviceStates[device.id]; }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() {} });
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  useHomeStore.setState({ deviceStates: { ...useHomeStore.getState().deviceStates, [device.id]: { on: true, level: 50, settings: { scheduleEnabled: true } } } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount()); container.remove();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  vi.unstubAllGlobals();
});

describe('tactile blinds controller', () => {
  it('opens directly and returns from More with focus and settings preserved', () => {
    act(() => root.render(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />));
    expect(container.querySelector('.blinds-console')).toBeTruthy();
    expect(container.querySelector('.device-sheet-primary')).toBeNull();
    const before = position();
    click('More blinds settings');
    expect(container.textContent).toContain('Routines');
    expect(document.activeElement?.textContent).toBe('Back to blinds');
    click('Back to blinds');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More blinds settings');
    expect(position()).toEqual(before);
  });

  it('uses latest state for rapid relative actions and preserves advanced settings', () => {
    act(() => root.render(<Harness />));
    for (let i = 0; i < 3; i++) click('Raise blinds by 5 percent');
    click('Lower blinds by 5 percent');
    expect(position()).toMatchObject({ on: true, level: 60, settings: { scheduleEnabled: true } });
    expect(container.querySelector('output')?.textContent).toBe('60%');
    expect(container.querySelector('input')?.value).toBe('60');
  });

  it('closes and opens coherently and disables only actions at the endpoint', () => {
    act(() => root.render(<Harness />));
    click('Close');
    expect(position()).toMatchObject({ on: false, level: 0 });
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Lower blinds by 5 percent"]')?.disabled).toBe(true);
    click('Open');
    expect(position()).toMatchObject({ on: true, level: 100 });
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Raise blinds by 5 percent"]')?.disabled).toBe(true);
    expect(container.textContent).not.toContain('Moving');
    expect(container.textContent).not.toContain('Stop');
  });

  it('derives presets and illustration from external state without overwriting it', () => {
    act(() => root.render(<Harness />));
    click('Privacy25%');
    expect(position().level).toBe(25);
    expect(container.querySelector('.blinds-preset[aria-pressed="true"]')?.textContent).toBe('Privacy25%');
    const lastSlat = container.querySelector('.blinds-slat:last-child')?.getAttribute('y');
    act(() => useHomeStore.getState().setDeviceLevel(device.id, 72));
    expect(container.querySelector('output')?.textContent).toBe('72%');
    expect(container.querySelector('.blinds-preset[aria-pressed="true"]')).toBeNull();
    expect(container.querySelector('.blinds-slat:last-child')?.getAttribute('y')).not.toBe(lastSlat);
  });

  it('keeps the reduced-motion presentation bound to the existing preference', () => {
    act(() => root.render(<Harness />));
    act(() => useHomeStore.setState({ motionDisabled: true }));
    expect(container.querySelector('.blinds-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  });

  it('removes writable controls immediately after authority is revoked in More', () => {
    act(() => root.render(<DeviceControlSheet deviceId={device.id} onClose={() => undefined} />));
    click('More blinds settings');
    const before = position();
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, fullHome: false, roomIds: [device.roomId], deviceIds: [device.id], controllableDeviceIds: [] } }));
    expect(container.querySelector('.blinds-console')).toBeNull();
    expect(container.querySelector('.blinds-more')).toBeNull();
    expect(container.textContent).toContain('View only');
    expect(position()).toEqual(before);
  });
});
