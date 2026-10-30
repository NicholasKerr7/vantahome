// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { GasMeterController } from './GasMeterControlPanel';
import { FULL_SCENE_ACCESS, EMPTY_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
const id = 'utility-gas-meter'; let container: HTMLDivElement; let root: Root;
/** Render accepted canonical state rather than faking local controller updates. */
function Harness() { const current = useHomeStore((state) => state.deviceStates[id]); return <GasMeterController device={getDevice(id)!} current={current} />; }
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
it('uses finite samples and preserves usage/alerts when closing and refilling', () => {
  act(() => root.render(<Harness />)); click('Usage alerts'); click('Simulate 30m usage');
  expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: true, settings: { gasRemainingKg: 8.5, gasTodayKg: 1, gasMonthKg: 6.5, gasUsageAlerts: false } });
  click('Close preview valve'); click('Simulate 30m usage'); click('Refill demo supply');
  expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: true, settings: { gasValveOpen: false, gasRemainingKg: 12.5, gasMonthKg: 6.5, gasUsageAlerts: false } });
  expect(container.textContent).toContain('Preview valve closed'); click('Open preview valve');
  expect(useHomeStore.getState().deviceStates[id].settings?.gasValveOpen).toBe(true);
});
it('keeps leak interlocks visible with alerts off, and clearing never reopens a valve', () => {
  act(() => root.render(<Harness />)); click('Usage alerts'); click('Refill alerts');
  act(() => { useHomeStore.getState().runDeviceAction('kitchen-gas-leak', 'gas-leak-simulate-leak'); });
  expect(container.textContent).toContain('Leak preview active · valve closed'); click('Open preview valve'); click('Refill demo supply');
  expect(useHomeStore.getState().deviceStates[id].settings?.gasValveOpen).toBe(false);
  act(() => { useHomeStore.getState().runDeviceAction('kitchen-gas-leak', 'gas-leak-clear-leak'); });
  expect(useHomeStore.getState().deviceStates[id].settings?.gasValveOpen).toBe(false);
});
it('shows malformed quantities as unavailable and blocks usage steps', () => {
  act(() => { useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: { on: true, level: 0, settings: { gasRemainingKg: '8.75', gasValveOpen: 'false' } } } })); });
  act(() => root.render(<Harness />)); expect(container.querySelector('[aria-label="Demo gas remaining"]')?.textContent).toBe('— kg');
  const before = useHomeStore.getState().deviceStates[id]; click('Simulate 30m usage'); click('Open preview valve'); expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
});
it('keeps Close available if a leak preview leaves the valve open with auto-shutoff disabled', () => {
  act(() => {
    useHomeStore.getState().setDeviceSetting('kitchen-gas-leak', 'gasAutoShutoff', false);
    useHomeStore.getState().runDeviceAction('kitchen-gas-leak', 'gas-leak-simulate-leak');
    root.render(<Harness />);
  });
  expect(container.textContent).toContain('Leak preview active · valve still open');
  const before = useHomeStore.getState().deviceStates[id].settings?.gasRemainingKg;
  click('Simulate 30m usage'); expect(useHomeStore.getState().deviceStates[id].settings?.gasRemainingKg).toBe(before);
  click('Close preview valve'); expect(container.textContent).toContain('Leak preview active · valve closed');
});
it('preserves state and keyboard focus through More/Back', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  click('More gas meter settings'); expect(document.activeElement?.textContent).toBe('Back to gas meter console');
  click('Back to gas meter console'); expect(document.activeElement?.getAttribute('aria-label')).toBe('More gas meter settings');
  expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
});
it('blocks revoked controls and removes the sheet when viewing is revoked', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  act(() => { useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }); });
  click('Close preview valve'); click('Usage alerts'); click('Simulate 30m usage'); expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  expect(container.querySelector('.gas-meter-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
  act(() => { useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }); }); expect(container.textContent).toBe('');
});
it('keeps gradient identities local and adds no heavy visual or idle animation', () => {
  act(() => root.render(<><Harness /><Harness /></>));
  const ids = [...container.querySelectorAll('[id]')].map((el) => el.id); expect(new Set(ids).size).toBe(ids.length);
  expect(container.querySelector('svg image,svg filter,svg animate,svg foreignObject')).toBeNull();
});
