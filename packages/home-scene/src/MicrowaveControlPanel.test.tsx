// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { MicrowaveController } from './MicrowaveControlPanel';
import { FULL_SCENE_ACCESS, EMPTY_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
const id = 'kitchen-microwave'; let container: HTMLDivElement; let root: Root;
/** Render accepted canonical state rather than faking local controller updates. */
function Harness() { const current = useHomeStore((state) => state.deviceStates[id]); return <MicrowaveController device={getDevice(id)!} current={current} />; }
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
it('saves mode/power independently, then starts, adds and clears fixed preview time', () => {
  act(() => root.render(<Harness />)); click('Defrost'); click('Increase microwave power');
  expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { microwaveMode: 'Defrost', microwavePower: 8 } });
  click('Start 1 min'); expect(container.querySelector('[aria-label="Saved microwave duration"]')?.textContent).toBe('1:00');
  click('Add 30 seconds and start microwave preview'); expect(container.querySelector('[aria-label="Saved microwave duration"]')?.textContent).toBe('1:30');
  expect(container.textContent).toContain('No countdown in this preview'); click('Stop & clear');
  expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { timeRemainingSec: 0, microwavePower: 8, microwaveMode: 'Defrost' } });
});
it('keeps malformed values unavailable, with explicit Start and Stop recovery', () => {
  act(() => useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: { on: false, level: 0, settings: { microwavePower: '7', timeRemainingSec: '60' } } } })));
  act(() => root.render(<Harness />));
  for (const el of container.querySelectorAll<HTMLButtonElement>('button[aria-label$="microwave power"], button[aria-label^="Add "]')) expect(el.disabled).toBe(true);
  expect(container.querySelector('[aria-label="Saved microwave duration"]')?.textContent).toBe('—:—');
  click('Start 1 min'); expect(container.querySelector('[aria-label="Saved microwave duration"]')?.textContent).toBe('1:00');
});
it('preserves state and restores focus through More/Back', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  click('More microwave settings'); expect(document.activeElement?.textContent).toBe('Back to microwave console');
  click('Back to microwave console'); expect(document.activeElement?.getAttribute('aria-label')).toBe('More microwave settings');
  expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
});
it('rejects revoked controls and hides the real sheet after view revocation', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
  click('Increase microwave power'); click('Grill'); click('Start 1 min'); expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  expect(container.querySelector('.microwave-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
  act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS })); expect(container.textContent).toBe('');
});
it('has isolated vector paints without heavy effects or animation loops', () => {
  act(() => root.render(<><Harness /><Harness /></>));
  const ids = [...container.querySelectorAll('[id]')].map((el) => el.id); expect(new Set(ids).size).toBe(ids.length);
  expect(container.querySelector('svg image,svg filter,svg animate,svg foreignObject')).toBeNull();
});
