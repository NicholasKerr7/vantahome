// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { AirQualityController } from './AirQualityControlPanel';
import { FULL_SCENE_ACCESS, EMPTY_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
const id = 'living-air'; let container: HTMLDivElement; let root: Root;
/** Render accepted canonical state rather than faking local controller updates. */
function Harness() { const current = useHomeStore((state) => state.deviceStates[id]); return <AirQualityController device={getDevice(id)!} current={current} />; }
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
it('checks fixed samples without a power control or changing readings; persists each preference independently', () => {
  act(() => root.render(<Harness />));
  expect(container.querySelector('output')?.textContent).toBe('32');
  expect(container.querySelector('[aria-label*="power"]')).toBeNull();
  click('Air alerts preference'); click('Save AQI alert threshold 150'); click('Check air quality sample');
  expect(useHomeStore.getState().deviceStates[id].settings).toMatchObject({ airAlertsEnabled: false, airAlertAqi: 150, sampleChecked: true });
  expect(container.querySelector('output')?.textContent).toBe('32');
  expect(container.textContent).toContain('Sample checked · values remain simulated');
  expect(container.textContent).toContain('Fixed simulation samples');
});
it('does not conceal a known exceeded limit when alerts are off or another sample is unavailable', () => {
  act(() => useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: { on: true, level: 0, settings: { airQualityIndex: 150, humidity: 'bad', airAlertsEnabled: false } } } })));
  act(() => root.render(<Harness />));
  expect(container.querySelector('.air-quality-console')?.getAttribute('data-tone')).toBe('exceeded');
  expect(container.textContent).toContain('Saved limit exceeded');
  expect(container.querySelector('output')?.textContent).toBe('150');
});
it('keeps malformed preferences/readings unknown and allows explicit preference recovery', () => {
  act(() => useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: { on: true, level: 0, settings: { airQualityIndex: 'bad', airAlertAqi: '100', airAlertsEnabled: 'bad' } } } })));
  act(() => root.render(<Harness />));
  expect(container.querySelector('output')?.textContent).toBe('—'); expect(container.textContent).toContain('Unknown');
  expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
  click('Save AQI alert threshold 75'); click('Air alerts preference');
  expect(useHomeStore.getState().deviceStates[id].settings).toMatchObject({ airAlertAqi: 75, airAlertsEnabled: true, airQualityIndex: 'bad' });
});
it('retains original advanced controls and More/Back focus without mutating samples', () => {
  act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
  const before = useHomeStore.getState().deviceStates[id]; click('More air quality settings');
  expect(container.querySelector('[aria-label="Device settings"]')).toBeTruthy();
  expect(document.activeElement?.textContent).toBe('Back to air quality console');
  click('Back to air quality console'); expect(document.activeElement?.getAttribute('aria-label')).toBe('More air quality settings');
  expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
});
it('blocks view-only commands and removes content when visibility is revoked', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
  for (const label of ['Check air quality sample', 'Air alerts preference', 'Save AQI alert threshold 150']) click(label);
  expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  expect(container.querySelector('.air-quality-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
  act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS })); expect(container.textContent).toBe('');
});
it('uses instance-local SVG paint servers without animation loops, images or filters', () => {
  act(() => root.render(<><Harness /><Harness /></>));
  const ids = [...container.querySelectorAll('linearGradient, radialGradient')].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const artwork of container.querySelectorAll('.air-quality-artwork')) {
    const localIds = new Set([...artwork.querySelectorAll('[id]')].map((element) => element.id));
    for (const painted of artwork.querySelectorAll('[fill^="url"], [stroke^="url"]')) for (const attr of ['fill', 'stroke']) {
      const value = painted.getAttribute(attr); if (value?.startsWith('url')) expect(localIds.has(value.slice(5, -1))).toBe(true);
    }
    expect(artwork.querySelector('image,filter,foreignObject,animate,[tabindex]')).toBeNull();
    expect(artwork.innerHTML).not.toMatch(/NaN|Infinity/);
  }
});
