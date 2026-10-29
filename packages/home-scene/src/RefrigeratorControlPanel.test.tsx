// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { RefrigeratorController } from './RefrigeratorControlPanel';
import { FULL_SCENE_ACCESS, EMPTY_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
const id = 'kitchen-fridge'; let container: HTMLDivElement; let root: Root;
/** Render accepted canonical state rather than faking local controller updates. */
function Harness() { const current = useHomeStore((state) => state.deviceStates[id]); return <RefrigeratorController device={getDevice(id)!} current={current} />; }
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
it('keeps independent targets, power and saved preferences through main controls', () => {
  act(() => root.render(<Harness />));
  click('Refrigerator power'); click('Increase fridge target'); click('Decrease freezer target'); click('Eco'); click('Quick cool preference'); click('Quick freeze preference');
  expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { tempC: 5, freezerTempC: -19, fridgeMode: 'eco', fridgeQuickCool: true, fridgeQuickFreeze: true } });
  expect(container.textContent).toContain('Saved cooling preferences');
});
it('formats Fahrenheit from Celsius targets and never changes stored units', () => {
  act(() => useHomeStore.setState({ tempUnit: 'F' })); act(() => root.render(<Harness />));
  expect(container.querySelector('output[aria-label^="Fridge"]')?.textContent).toBe('39°F');
  click('Increase fridge target'); expect(container.querySelector('output[aria-label^="Fridge"]')?.textContent).toBe('41°F');
  expect(useHomeStore.getState().deviceStates[id].settings?.tempC).toBe(5);
});
it('keeps malformed targets unavailable and disables their relative keys', () => {
  act(() => useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: { on: false, level: 0, settings: { tempC: 'bad', freezerTempC: '-18' } } } })));
  act(() => root.render(<Harness />));
  for (const el of container.querySelectorAll<HTMLButtonElement>('[aria-label^="Increase"], [aria-label^="Decrease"]')) expect(el.disabled).toBe(true);
  expect(container.querySelector('output')?.textContent).toContain('—');
});
it('retains More controls and returns focus without changing preferences', () => {
  act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
  const before = useHomeStore.getState().deviceStates[id]; click('More refrigerator settings');
  expect(container.querySelector('[aria-label="Device settings"]')).toBeTruthy();
  expect(document.activeElement?.textContent).toBe('Back to refrigerator console');
  click('Back to refrigerator console'); expect(document.activeElement?.getAttribute('aria-label')).toBe('More refrigerator settings');
  expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
});
it('disables revoked control and removes all content after view revocation', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
  click('Increase fridge target'); click('Quick cool preference'); click('Eco'); expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  expect(container.querySelector('.refrigerator-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
  act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS })); expect(container.textContent).toBe('');
});
it('uses isolated vector paints without extra images, animation loops or duplicate ids', () => {
  act(() => root.render(<><Harness /><Harness /></>));
  const ids = [...container.querySelectorAll('[id]')].map((el) => el.id); expect(new Set(ids).size).toBe(ids.length);
  expect(container.querySelector('svg image,svg filter,svg animate,svg foreignObject')).toBeNull();
});
