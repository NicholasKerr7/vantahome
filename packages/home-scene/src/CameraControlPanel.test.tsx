// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeviceControlSheet } from './DeviceControlSheet';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
import { scenePresentationMessage, SCENE_PRESENTATION_CHANNEL } from './scenePresentation';

let container: HTMLDivElement;
let root: Root;
const media = Object.assign(new EventTarget(), { matches: false });
/** Exercise native button semantics against the real guarded simulation store. */
function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(button, label).toBeTruthy(); act(() => button!.click());
}
/** Mount the real full-controls entry point rather than a standalone visual mock. */
function render(id = 'entry-camera') { act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />)); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('ReactNativeWebView', {});
  media.matches = false;
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() {} });
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it.each(['entry-camera', 'drive-camera', 'terrace-camera'])('routes %s to an explicitly illustrative console with complete More and focus', (id) => {
  render(id);
  expect(container.querySelector('.camera-console')).not.toBeNull();
  expect(container.textContent).toContain('SAMPLE PREVIEW');
  expect(container.textContent).toContain('NO LIVE FEED CONNECTED');
  expect(container.textContent).toContain('No video or audio captured');
  expect(container.querySelector('video, audio, img, canvas')).toBeNull();
  const before = useHomeStore.getState().deviceStates[id];
  click('More camera settings');
  expect(container.textContent).toContain('Routines');
  expect(document.activeElement?.textContent).toBe('Back to camera console');
  click('Back to camera console');
  expect(document.activeElement?.getAttribute('aria-label')).toBe('More camera settings');
  expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
});

it('changes arming without changing saved preferences or treating disarm as a privacy shutter', () => {
  render();
  const before = useHomeStore.getState().deviceStates['entry-camera'];
  const art = container.querySelector('.camera-study')?.innerHTML;
  click('Camera armed');
  expect(useHomeStore.getState().deviceStates['entry-camera'].on).toBe(!before.on);
  expect(container.querySelector('.camera-study')?.innerHTML).toBe(art);
  expect(container.textContent).toContain('Disarmed preview');
  click('Night vision preference'); click('Motion alerts preference');
  const next = useHomeStore.getState().deviceStates['entry-camera'];
  expect(next.on).toBe(false);
  expect(next.settings).toMatchObject({ nightVision: false, motionAlerts: false });
  click('Night vision preference'); click('Night vision preference');
  expect(useHomeStore.getState().deviceStates['entry-camera'].settings?.nightVision).toBe(false);
});

it('records only a local sample event, preserving other devices and settings', () => {
  render();
  const before = useHomeStore.getState().deviceStates;
  click('Simulate snapshot');
  expect(container.querySelector('.camera-event')?.textContent).toContain('Simulated snapshot');
  const after = useHomeStore.getState().deviceStates;
  expect(after['entry-camera'].settings?.cameraPreviewEvent).toBe('Simulated snapshot');
  expect(after['entry-camera'].on).toBe(before['entry-camera'].on);
  for (const id of Object.keys(before).filter((id) => id !== 'entry-camera')) expect(after[id]).toEqual(before[id]);
});

it('removes controls immediately on revoked control authority and removes the view when camera scope is revoked', () => {
  render(); click('More camera settings');
  const before = useHomeStore.getState().deviceStates['entry-camera'];
  act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, fullHome: false, roomIds: ['grounds'], deviceIds: ['entry-camera'], controllableDeviceIds: [] } }));
  expect(container.querySelector('.camera-more, .camera-console')).toBeNull();
  expect(container.textContent).toContain('View only');
  act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, fullHome: false, roomIds: [], deviceIds: [], controllableDeviceIds: [] } }));
  expect(container.querySelector('dialog')).toBeNull();
  expect(useHomeStore.getState().deviceStates['entry-camera']).toEqual(before);
});

it('handles an unknown event without displaying injected or fabricated camera observations', () => {
  useHomeStore.setState({ deviceStates: { ...useHomeStore.getState().deviceStates, 'entry-camera': { on: true, level: 0, settings: { cameraPreviewEvent: 'Someone at your door! http://private.invalid' } } } });
  render();
  expect(container.querySelector('.camera-event')?.textContent).toContain('Preview event unavailable');
  expect(container.textContent).not.toContain('private.invalid');
  click('Simulate snapshot');
  expect(container.querySelector('.camera-event')?.textContent).toContain('Simulated snapshot');
});

it('honors reduced motion and host suspension without losing accepted preferences', () => {
  render();
  const disabled = () => container.querySelector('.camera-workspace')?.getAttribute('data-motion-disabled');
  expect(disabled()).toBe('false');
  act(() => useHomeStore.setState({ motionDisabled: true })); expect(disabled()).toBe('true');
  act(() => useHomeStore.setState({ motionDisabled: false }));
  act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(true) }))); expect(disabled()).toBe('true');
  click('Night vision preference'); expect(container.querySelector('.camera-study')?.getAttribute('data-night')).toBe('false');
  act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(false) }))); expect(disabled()).toBe('false');
  media.matches = true; act(() => media.dispatchEvent(new Event('change'))); expect(disabled()).toBe('true');
});
