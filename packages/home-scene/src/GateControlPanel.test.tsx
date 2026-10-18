// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { GateController } from './GateControlPanel';
import { DeviceControlSheet } from './DeviceControlSheet';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { advanceGateSafety, normalizeRestoredGateState } from './gateSafetySimulation';
import { createDefaultState, useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;
const id = 'entry-gate';

/** Subscribe to canonical state just like the full-controls inspector. */
function Harness() {
  const current = useHomeStore((state) => state.deviceStates[id]);
  return <GateController device={getDevice(id)!} current={current} />;
}

/** Find a visible action by its user-facing name. */
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(found, label).toBeTruthy();
  return found!;
}

/** Exercise UI events rather than bypassing the controller's command route. */
function click(label: string): void { act(() => button(label).click()); }

/** Supply a single existing simulation-clock sample, without creating a component timer. */
function tick(seconds: number): void {
  act(() => useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: advanceGateSafety(state.deviceStates[id], seconds) } })));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() {} });
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  act(() => useHomeStore.getState().setDeviceSetting(id, 'openPercent', 0));
  tick(4);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount()); container.remove();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }); vi.unstubAllGlobals();
});

describe('entry gate console', () => {
  it('opens from full controls and restores More/Back focus without changing state', () => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    expect(container.querySelector('.gate-console')).not.toBeNull();
    const before = useHomeStore.getState().deviceStates[id];
    click('More gate settings');
    expect(document.activeElement?.textContent).toBe('Back to gate console');
    expect(container.textContent).toContain('Controls');
    click('Back to gate console');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More gate settings');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  });

  it('shows accepted position rather than jumping directly to the closing target', () => {
    act(() => root.render(<Harness />));
    click('Open'); click('Close');
    expect(container.querySelector('output')?.textContent).toBe('100%');
    expect(button('Open').disabled).toBe(false);
    tick(1);
    expect(container.querySelector('output')?.textContent).toBe('75%');
    expect(container.querySelector('[data-testid="gate-sliding-leaf"]')?.getAttribute('transform')).toBe('translate(-121.5 0)');
    click('Open');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ level: 100, settings: { gatePhase: 'idle' } });
  });

  it('holds open and releases without disguising hold as stop', () => {
    act(() => root.render(<Harness />));
    click('Hold open');
    expect(container.querySelector('output')?.textContent).toBe('100%');
    expect(button('Close').disabled).toBe(true);
    expect(button('Release hold').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).not.toContain('Stop');
    click('Release hold');
    expect(button('Close').disabled).toBe(false);
  });

  it.each(['gateBeamBlocked', 'gateVehiclePresent'])('blocks Open/Close on %s and reflects obstruction reopening', (field) => {
    act(() => root.render(<Harness />));
    click('Open'); click('Close'); tick(1);
    act(() => useHomeStore.getState().setDeviceSetting(id, field, true));
    expect(container.querySelector('output')?.textContent).toBe('100%');
    expect(button('Open').disabled).toBe(true);
    expect(button('Close').disabled).toBe(true);
    expect(container.querySelector('.gate-feedback')?.getAttribute('data-safety')).toBe('blocked');
  });

  it('preserves fault-paused position and requires a fresh explicit close after recovery', () => {
    act(() => root.render(<Harness />));
    click('Open'); click('Close'); tick(1);
    act(() => useHomeStore.getState().setDeviceSetting(id, 'gateSensorFault', true));
    tick(1);
    expect(container.querySelector('output')?.textContent).toBe('75%');
    expect(container.textContent).toContain('Sensor fault');
    expect(button('Close').disabled).toBe(true);
    act(() => useHomeStore.getState().setDeviceSetting(id, 'gateSensorFault', false));
    expect(container.textContent).toContain('Preview paused');
    expect(container.textContent).not.toContain('Resume auto-close');
    click('Close'); tick(1);
    expect(container.querySelector('output')?.textContent).toBe('50%');
  });

  it('uses countdown samples and offers only a fresh fully-open timer after restoration', () => {
    act(() => root.render(<Harness />));
    act(() => useHomeStore.getState().setDeviceSetting(id, 'autoCloseEnabled', true));
    click('Open'); tick(2);
    expect(container.querySelector('.gate-timer strong')?.textContent).toBe('28s');
    act(() => useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: normalizeRestoredGateState(state.deviceStates[id]) } })));
    expect(container.querySelector('.gate-timer strong')?.textContent).toBe('Paused');
    click('Resume auto-close');
    expect(container.querySelector('.gate-timer strong')?.textContent).toBe('30s');
  });

  it('does not release an active emergency hold', () => {
    act(() => useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: advanceGateSafety(state.deviceStates[id], 1, true) } })));
    act(() => root.render(<Harness />));
    expect(button('Release hold').disabled).toBe(true);
    expect(button('Close').disabled).toBe(true);
    expect(container.textContent).toContain('Emergency hold');
  });

  it('removes selected readings when view access is revoked', () => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    click('More gate settings');
    act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }));
    expect(container.textContent).toBe('');
  });

  it('disables actions after control revocation and respects reduced motion', () => {
    act(() => root.render(<Harness />));
    const before = useHomeStore.getState().deviceStates[id];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
    click('Open'); click('Hold open');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
    expect(container.querySelector('.gate-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  });
});
