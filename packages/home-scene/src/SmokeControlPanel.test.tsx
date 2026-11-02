// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { SmokeController } from './SmokeControlPanel';
import { FULL_SCENE_ACCESS, EMPTY_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
const id = 'family-smoke'; let container: HTMLDivElement; let root: Root;
/** Render accepted canonical state rather than faking local controller updates. */
function Harness() { const current = useHomeStore((state) => state.deviceStates[id]); return <SmokeController device={getDevice(id)!} current={current} />; }
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
it('keeps an active source visible after sample checks, silence and acknowledgment, then preserves the latch', () => {
  act(() => root.render(<Harness />)); click('Check sample');
  expect(container.textContent).toContain('Sample checked · no physical test');
  click('Simulate smoke'); click('Silence preview'); click('Acknowledge sensor'); click('Check sample');
  expect(container.textContent).toContain('Smoke simulation active');
  expect(container.textContent).toContain('Preview silenced · Acknowledged');
  expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: true, settings: { smokeDetected: true, fireIncidentActive: true, smokeSilenced: true, fireIncidentAcknowledged: true } });
  expect(useHomeStore.getState().deviceStates['entry-gate'].settings?.gateEmergencyHold).toBe(true);
  click('Clear this sensor'); expect(container.textContent).toContain('Sources clear · reset pending');
  expect(container.querySelector('.smoke-console')?.getAttribute('data-tone')).toBe('alarm');
  act(() => useHomeStore.getState().resetFire());
  expect(container.textContent).toContain('No alarm in this sample');
  expect(useHomeStore.getState().deviceStates['entry-gate'].settings?.gateEmergencyHold).toBe(true);
});
it('clears only the selected sensor and cannot reset another active source', () => {
  act(() => root.render(<Harness />)); click('Simulate CO');
  act(() => useHomeStore.getState().runDeviceAction('master-smoke', 'smoke-test-alarm'));
  click('Clear this sensor'); act(() => useHomeStore.getState().runDeviceAction(id, 'smoke-reset'));
  expect(useHomeStore.getState().deviceStates['master-smoke'].settings?.smokeDetected).toBe(true);
  expect(useHomeStore.getState().deviceStates[id].settings?.fireIncidentActive).toBe(true);
});
it('blocks property-wide scenarios for partial grants while retaining an authorized sample check', () => {
  act(() => { useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [id] } }); root.render(<Harness />); });
  click('Simulate smoke'); click('Simulate CO');
  expect(useHomeStore.getState().deviceStates[id].settings?.fireIncidentActive ?? false).toBe(false);
  click('Check sample'); expect(useHomeStore.getState().deviceStates[id].settings?.sampleChecked).toBe(true);
});
it('preserves focus and original advanced controls through More/Back', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  click('More smoke detector settings'); expect(document.activeElement?.textContent).toBe('Back to smoke detector console');
  click('Back to smoke detector console'); expect(document.activeElement?.getAttribute('aria-label')).toBe('More smoke detector settings');
  expect(useHomeStore.getState().deviceStates[id]).toBe(before);
});
it('rejects revoked controls and removes the selected sheet after view revocation', () => {
  act(() => root.render(<Harness />)); const before = useHomeStore.getState().deviceStates[id];
  act(() => { useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }); });
  click('Simulate smoke'); click('Check sample'); expect(useHomeStore.getState().deviceStates[id]).toBe(before);
  expect(container.querySelector('.smoke-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
  act(() => { useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }); }); expect(container.textContent).toBe('');
});
it('keeps local SVG paints unique without flashing or heavy effects', () => {
  act(() => root.render(<><Harness /><Harness /></>)); const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
  expect(new Set(ids).size).toBe(ids.length); expect(container.querySelector('svg image,svg filter,svg animate,svg foreignObject')).toBeNull();
});
