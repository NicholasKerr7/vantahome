// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IrrigationConsoleArtwork } from './IrrigationConsoleArtwork';
import { scenePresentationMessage, SCENE_PRESENTATION_CHANNEL } from './scenePresentation';

/** Dispatch actual system preference events while retaining the ordinary listener contract. */
class MotionPreference extends EventTarget { matches = false; }
let root: Root; let container: HTMLDivElement; let media: MotionPreference; let hidden = false;
let originalHidden: PropertyDescriptor | undefined;
let originalAnimate: PropertyDescriptor | undefined;
const cancel = vi.fn(); const animate = vi.fn(() => ({ cancel }));
/** Commit a real conditional spray layer so off/on ref changes are part of the test. */
function render(on: boolean, reduced = false) { act(() => root.render(<IrrigationConsoleArtwork on={on} reduced={reduced} />)); }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); media = new MotionPreference(); hidden = false;
  vi.stubGlobal('matchMedia', () => media); animate.mockClear(); cancel.mockClear();
  originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden'); originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove();
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden); else Reflect.deleteProperty(document, 'hidden');
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate); else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  vi.unstubAllGlobals();
});
it('creates no loop while off and cancels it when accepted power turns off', () => {
  render(false); expect(animate).not.toHaveBeenCalled(); render(true); expect(animate).toHaveBeenCalledTimes(1);
  render(false); expect(cancel).toHaveBeenCalledTimes(1); expect(container.querySelector('.irrigation-spray')).toBeNull();
});
it('keeps still spray for system or profile reduced motion and resumes only when both allow it', () => {
  media.matches = true; render(true); expect(animate).not.toHaveBeenCalled();
  act(() => { media.matches = false; media.dispatchEvent(new Event('change')); }); expect(animate).toHaveBeenCalledTimes(1);
  render(true, true); expect(cancel).toHaveBeenCalledTimes(1); expect(container.querySelector('.irrigation-spray')).toBeTruthy();
  act(() => media.dispatchEvent(new Event('change'))); expect(animate).toHaveBeenCalledTimes(1);
});
it('cancels background motion and resumes only while visible', () => {
  render(true); hidden = true; act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(cancel).toHaveBeenCalledTimes(1);
  hidden = false; act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(animate).toHaveBeenCalledTimes(2);
});
it('respects host suspension and detaches callbacks when the component unmounts', () => {
  vi.stubGlobal('ReactNativeWebView', {});
  render(true);
  act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(true) })));
  expect(cancel).toHaveBeenCalledTimes(1);
  act(() => root.render(null)); const before = animate.mock.calls.length;
  act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(false) })));
  expect(animate).toHaveBeenCalledTimes(before);
});
