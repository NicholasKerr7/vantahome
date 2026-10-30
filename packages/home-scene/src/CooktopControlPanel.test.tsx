// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { CooktopController } from './CooktopControlPanel';
import { FULL_SCENE_ACCESS, EMPTY_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
const id = 'kitchen-stove'; let container: HTMLDivElement; let root: Root;
/** Render accepted canonical state rather than faking local controller updates. */
function Harness() { const current = useHomeStore((state) => state.deviceStates[id]); return <CooktopController device={getDevice(id)!} current={current} />; }
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
it('edits shared preferences without starting, and power off keeps every setting', () => {
  act(() => root.render(<Harness />));
  click('Increase cooktop heat'); click('Increase cooktop heat'); click('Cooktop mode: Sear');
  click('Increase cooktop timer'); click('Child-lock preference');
  expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { burnerLevel: 2, stoveTimerMin: 5, stoveMode: 'sear', stoveLock: true } });
  click('Turn cooktop preview on'); expect(container.textContent).toContain('Preview on · shared heat setting');
  click('Increase cooktop heat'); // Saved child-lock preference does not enforce a fictional lock.
  click('Turn cooktop preview off');
  expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { burnerLevel: 3, stoveTimerMin: 5, stoveMode: 'sear', stoveLock: true } });
});
it('shows zero or unavailable heat distinctly and disables malformed relative edits', () => {
  act(() => root.render(<Harness />)); click('Turn cooktop preview on');
  expect(container.textContent).toContain('Preview on · zero heat setting');
  act(() => { useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: { on: true, level: 35, settings: { burnerLevel: '7', stoveTimerMin: 3, stoveLock: 'false' } } } })); });
  const before = useHomeStore.getState().deviceStates[id];
  click('Increase cooktop heat'); click('Increase cooktop timer'); click('Child-lock preference unavailable');
  expect(useHomeStore.getState().deviceStates[id]).toBe(before);
  expect(container.textContent).toContain('Preview on · heat unavailable');
});
it('retains settings and restores focus across More/Back', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  click('More cooktop settings'); expect(document.activeElement?.textContent).toBe('Back to cooktop console');
  expect(container.textContent).toContain('Saved preferences only');
  click('Back to cooktop console'); expect(document.activeElement?.getAttribute('aria-label')).toBe('More cooktop settings');
  expect(useHomeStore.getState().deviceStates[id]).toBe(before);
});
it('blocks revoked controls and removes the sheet after view revocation', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  act(() => { useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }); });
  click('Turn cooktop preview on'); click('Increase cooktop heat'); click('Cooktop mode: Boil');
  expect(useHomeStore.getState().deviceStates[id]).toBe(before);
  expect(container.querySelector('.cooktop-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
  act(() => { useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }); }); expect(container.textContent).toBe('');
});
it('isolates decorative SVG paints without an animation loop or heavy effects', () => {
  act(() => root.render(<><Harness /><Harness /></>));
  const ids = [...container.querySelectorAll('[id]')].map((el) => el.id); expect(new Set(ids).size).toBe(ids.length);
  expect(container.querySelector('svg image,svg filter,svg animate,svg foreignObject')).toBeNull();
});
