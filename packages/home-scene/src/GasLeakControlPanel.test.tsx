// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { GasLeakController } from './GasLeakControlPanel';
import { FULL_SCENE_ACCESS, EMPTY_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
const id = 'kitchen-gas-leak'; let container: HTMLDivElement; let root: Root;
/** Render accepted canonical state rather than faking local controller updates. */
function Harness() { const current = useHomeStore((state) => state.deviceStates[id]); return <GasLeakController device={getDevice(id)!} current={current} />; }
/** Press the same accessible control used by keyboard and touch users. */
function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(button, label).toBeTruthy(); act(() => button!.click());
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
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }); vi.unstubAllGlobals();
});
it('keeps a leak active through silence, self-test and disabled alerts, then clears without reopening', () => {
  act(() => root.render(<Harness />)); click('Simulate gas leak');
  expect(container.textContent).toContain('Leak preview active · alarm active');
  expect(useHomeStore.getState().deviceStates['utility-gas-meter'].settings?.gasValveOpen).toBe(false);
  click('Silence preview alarm'); click('Run preview self-test'); click('Leak alerts');
  expect(container.textContent).toContain('Leak preview active · alarm silenced'); expect(container.textContent).toContain('Preview test passed');
  expect(container.querySelector('.gas-leak-console')?.getAttribute('data-tone')).toBe('alarm');
  expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: true, settings: { gasLeakDetected: true, gasAlarmSilenced: true, gasTestCount: 1, gasLeakAlerts: false } });
  click('Clear leak scenario'); expect(container.textContent).toContain('No leak in this sample');
  expect(useHomeStore.getState().deviceStates['utility-gas-meter'].settings?.gasValveOpen).toBe(false);
});
it('preserves disabled auto-shutoff and closes the linked preview valve only when enabled', () => {
  act(() => root.render(<Harness />)); click('Preview auto-shutoff'); click('Simulate gas leak');
  expect(useHomeStore.getState().deviceStates['utility-gas-meter'].settings?.gasValveOpen ?? true).toBe(true);
  click('Preview auto-shutoff'); expect(useHomeStore.getState().deviceStates['utility-gas-meter'].settings?.gasValveOpen).toBe(false);
  expect(container.textContent).toContain('Leak preview active');
});
it('keeps malformed data unknown and does not allow relative tests or alarm commands on unknown flags', () => {
  act(() => { useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: { on: true, level: 0, settings: { gasLeakDetected: 'false', gasConcentrationPercentLel: '0', gasTestCount: '0' } } } })); });
  act(() => root.render(<Harness />)); expect(container.textContent).toContain('Leak sample unavailable');
  const before = useHomeStore.getState().deviceStates[id];
  click('Run preview self-test'); click('Simulate gas leak'); click('Clear leak scenario'); click('Silence preview alarm'); expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
});
it('preserves state and keyboard focus across More/Back', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  click('More gas detector settings'); expect(document.activeElement?.textContent).toBe('Back to gas detector console');
  click('Back to gas detector console'); expect(document.activeElement?.getAttribute('aria-label')).toBe('More gas detector settings'); expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
});
it('blocks revoked controls and removes information after view revocation', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  act(() => { useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }); });
  click('Simulate gas leak'); click('Run preview self-test'); click('Leak alerts'); expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  expect(container.querySelector('.gas-leak-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
  act(() => { useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }); }); expect(container.textContent).toBe('');
});
it('isolates SVG paints and uses no idle animation or heavy effects', () => {
  act(() => root.render(<><Harness /><Harness /></>)); const ids = [...container.querySelectorAll('[id]')].map((el) => el.id); expect(new Set(ids).size).toBe(ids.length);
  expect(container.querySelector('svg image,svg filter,svg animate,svg foreignObject')).toBeNull();
});
