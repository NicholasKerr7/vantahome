// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { IrrigationController } from './IrrigationControlPanel';
import { FULL_SCENE_ACCESS, EMPTY_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';

const id = 'grounds-sprinkler';
let container: HTMLDivElement; let root: Root;
/** Render the real state-backed console, with no fake copy of the reducer. */
function Harness() { const current = useHomeStore((state) => state.deviceStates[id]); return <IrrigationController device={getDevice(id)!} current={current} />; }
/** Activate an accessible control by its actual user-facing label. */
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
  useHomeStore.getState().setDeviceSetting(id, 'isOn', false);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS }); vi.unstubAllGlobals();
});
describe('irrigation console', () => {
  it('saves preferences while off and adds spray only after explicit Start', () => {
    act(() => root.render(<Harness />));
    click('Zone preference: Garden'); click('Save irrigation duration 30 min');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { zone: 'Garden', durationMin: 30 } });
    expect(container.querySelector('.irrigation-spray')).toBeNull();
    click('Start irrigation simulation'); expect(container.querySelector('.irrigation-spray')).toBeTruthy();
    click('Stop irrigation simulation'); expect(container.querySelector('.irrigation-spray')).toBeNull();
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { zone: 'Garden', durationMin: 30 } });
    expect(container.textContent).toContain('Zone and duration save only');
  });
  it('keeps repeated duration changes atomic and disables exhausted controls', () => {
    act(() => root.render(<Harness />)); const plus = container.querySelector<HTMLButtonElement>('[aria-label="Increase irrigation duration"]')!;
    act(() => { plus.click(); plus.click(); plus.click(); });
    expect(useHomeStore.getState().deviceStates[id].settings?.durationMin).toBe(30);
    act(() => useHomeStore.getState().setDeviceSetting(id, 'durationMin', 60)); expect(plus.disabled).toBe(true);
  });
  it('leaves invalid preferences unselected and offers deliberate recovery', () => {
    act(() => useHomeStore.setState((state) => ({ deviceStates: { ...state.deviceStates, [id]: { on: false, level: 50, settings: { durationMin: 'bad', zone: 'bad' } } } })));
    act(() => root.render(<Harness />));
    expect(container.querySelector('output')?.textContent).toBe('—min');
    expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
    click('Increase irrigation duration'); expect(useHomeStore.getState().deviceStates[id].settings?.durationMin).toBe('bad');
    click('Save irrigation duration 5 min'); click('Zone preference: Back yard');
    expect(container.textContent).not.toContain('unavailable');
  });
  it('retains all advanced settings and restores More/Back focus without changing the device', () => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    const before = useHomeStore.getState().deviceStates[id]; click('More irrigation settings');
    expect(container.querySelector('[aria-label="Device settings"]')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Back to irrigation console');
    click('Back to irrigation console'); expect(document.activeElement?.getAttribute('aria-label')).toBe('More irrigation settings');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  });
  it('removes a revoked dialog and blocks captured controls under read-only grants', () => {
    act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
    for (const label of ['Start irrigation simulation', 'Increase irrigation duration', 'Save irrigation duration 30 min', 'Zone preference: Garden']) click(label);
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
    expect(container.querySelector('.irrigation-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS })); expect(container.textContent).toBe('');
  });
  it('uses isolated local SVG paint references and no images, filters, focusable decoration or unsafe markup', () => {
    act(() => root.render(<><Harness /><Harness /></>)); click('Start irrigation simulation');
    const ids = [...container.querySelectorAll('linearGradient, radialGradient')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const artwork of container.querySelectorAll('.irrigation-artwork')) {
      const localIds = new Set([...artwork.querySelectorAll('[id]')].map((element) => element.id));
      for (const painted of artwork.querySelectorAll('[fill^="url"], [stroke^="url"]')) {
        for (const attribute of ['fill', 'stroke']) { const value = painted.getAttribute(attribute); if (value?.startsWith('url')) expect(localIds.has(value.slice(5, -1))).toBe(true); }
      }
      expect(artwork.querySelector('image, filter, foreignObject, animate, [tabindex]')).toBeNull();
      expect(artwork.innerHTML).not.toMatch(/NaN|Infinity/);
    }
  });
});
