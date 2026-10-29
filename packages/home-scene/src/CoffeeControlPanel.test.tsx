// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { CoffeeController } from './CoffeeControlPanel';
import { FULL_SCENE_ACCESS, EMPTY_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
const id = 'kitchen-coffee'; let container: HTMLDivElement; let root: Root;
/** Render accepted canonical state rather than faking local controller updates. */
function Harness() { const current = useHomeStore((state) => state.deviceStates[id]); return <CoffeeController device={getDevice(id)!} current={current} />; }
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
it('saves recipes without brewing and starts/stops only through explicit controls', () => {
  act(() => root.render(<Harness />));
  click('Strong'); click('Save cup size 12 ounces'); click('Increase coffee cups');
  expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { coffeeStrength: 'strong', coffeeSizeOz: 12, coffeeCupCount: 3 } });
  expect(container.querySelector('.coffee-steam')).toBeNull();
  click('Brew preview'); expect(container.querySelector('.coffee-steam')).toBeTruthy();
  click('Stop preview'); expect(container.querySelector('.coffee-steam')).toBeNull();
  expect(useHomeStore.getState().deviceStates[id].settings?.coffeeStrength).toBe('strong');
});
it('keeps unknown cups unavailable and disables relative keys', () => {
  act(() => useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: { on: false, level: 0, settings: { coffeeCupCount: '2', coffeeSizeOz: 7 } } } })));
  act(() => root.render(<Harness />));
  for (const el of container.querySelectorAll<HTMLButtonElement>('[aria-label$="coffee cups"]')) expect(el.disabled).toBe(true);
  expect(container.querySelector('output')?.textContent).toBe('—');
  expect(container.querySelector('.coffee-caption')?.textContent).toContain('7 oz');
});
it('preserves settings and restores focus through More/Back', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  click('More coffee settings'); expect(document.activeElement?.textContent).toBe('Back to coffee console');
  click('Back to coffee console'); expect(document.activeElement?.getAttribute('aria-label')).toBe('More coffee settings');
  expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
});
it('rejects revoked controls and removes the actual sheet after visibility revocation', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
  click('Increase coffee cups'); click('Strong'); click('Brew preview'); expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  expect(container.querySelector('.coffee-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
  act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS })); expect(container.textContent).toBe('');
});
it('uses isolated lightweight SVG paint identifiers', () => {
  act(() => root.render(<><Harness /><Harness /></>));
  const ids = [...container.querySelectorAll('[id]')].map((el) => el.id); expect(new Set(ids).size).toBe(ids.length);
  expect(container.querySelector('svg image,svg filter,svg animate,svg foreignObject')).toBeNull();
});
