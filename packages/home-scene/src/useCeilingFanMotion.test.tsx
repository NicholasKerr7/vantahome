// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCENE_PRESENTATION_CHANNEL, scenePresentationMessage } from './scenePresentation';
import { useCeilingFanMotion } from './useCeilingFanMotion';

/** Model only observable compositor operations; finite transition time is controlled separately. */
class RotorAnimation {
  currentTime = 375;
  direction: PlaybackDirection = 'normal';
  playbackRate = 0;
  paused = true;
  effect = { updateTiming: vi.fn((timing: OptionalEffectTiming) => { this.direction = timing.direction ?? this.direction; }) };
  pause = vi.fn(() => { this.paused = true; });
  play = vi.fn(() => { this.paused = false; });
  cancel = vi.fn(() => { this.paused = true; });
  updatePlaybackRate = vi.fn((rate: number) => { this.playbackRate = rate; });
}
/** Exercise live system preference events rather than a frozen matchMedia result. */
class MotionPreference extends EventTarget { matches = false; }
let container: HTMLDivElement;
let root: Root | null;
let animation: RotorAnimation;
let media: MotionPreference;
let hidden: boolean;
let time: number;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
let originalAnimate: PropertyDescriptor | undefined;
let originalHidden: PropertyDescriptor | undefined;

/** Keep the artwork ref stable while incoming accepted velocity changes. */
function Harness({ speed, reduced }: { speed: number; reduced: boolean }) {
  const rotor = useRef<HTMLDivElement>(null);
  useCeilingFanMotion(rotor, speed, reduced);
  return <div ref={rotor} />;
}
/** Commit the same mounted artwork without recreating its compositor animation. */
function render(speed: number, reduced = false): void { act(() => root!.render(<Harness speed={speed} reduced={reduced} />)); }
/** Run one browser frame at an explicit time and retain newly scheduled work for the next frame. */
function frameAt(nextTime: number): void {
  time = nextTime;
  const callbacks = [...frames.values()]; frames.clear();
  act(() => callbacks.forEach((callback) => callback(time)));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  animation = new RotorAnimation(); media = new MotionPreference(); hidden = false; time = 0; nextFrame = 1; frames = new Map();
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { const id = nextFrame++; frames.set(id, callback); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { frames.delete(id); }));
  vi.stubGlobal('matchMedia', () => media);
  originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn(() => animation) });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => {
  if (root) act(() => root!.unmount()); root = null; container.remove();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate); else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden); else Reflect.deleteProperty(document, 'hidden');
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('ceiling fan compositor momentum', () => {
  it('accelerates once, cruises without JavaScript frames and coasts to a stationary phase', () => {
    render(8); expect(animation.paused).toBe(true);
    frameAt(250); expect(animation.playbackRate).toBeCloseTo(4 / (2 * Math.PI));
    frameAt(500); expect(animation.playbackRate).toBeCloseTo(8 / (2 * Math.PI)); expect(frames.size).toBe(0);
    render(0); frameAt(710); expect(animation.playbackRate).toBeCloseTo(4 / (2 * Math.PI));
    frameAt(920); expect(animation.paused).toBe(true); expect(frames.size).toBe(0); expect(animation.currentTime).toBe(375);
  });

  it('comes to rest before reversing and preserves the visible blade angle', () => {
    render(8); frameAt(500); render(-8);
    frameAt(710); expect(animation.direction).toBe('normal');
    frameAt(920); expect(animation.paused).toBe(true);
    frameAt(960); expect(animation.paused).toBe(true); expect(animation.direction).toBe('normal');
    frameAt(1250); expect(animation.direction).toBe('reverse'); expect(animation.currentTime).toBe(625);
    expect(animation.playbackRate).toBeCloseTo(4 / (2 * Math.PI));
    frameAt(1500); expect(frames.size).toBe(0); expect(animation.playbackRate).toBeCloseTo(8 / (2 * Math.PI));
  });

  it('rapid commands cancel prior transitions and continue from the speed actually shown', () => {
    render(10); frameAt(200); render(6);
    expect(frames.size).toBe(1);
    frameAt(380); expect(animation.playbackRate).toBeCloseTo(5 / (2 * Math.PI));
    render(-6); frameAt(800); expect(animation.paused).toBe(true);
    render(4); frameAt(1050); expect(animation.direction).toBe('normal'); expect(animation.playbackRate).toBeCloseTo(2 / (2 * Math.PI));
    frameAt(1300); expect(frames.size).toBe(0);
  });

  it('stops immediately for reduced motion, background, native cover and unmount', () => {
    vi.stubGlobal('ReactNativeWebView', {});
    render(8); frameAt(250); render(8, true);
    expect(frames.size).toBe(0); expect(animation.paused).toBe(true);
    render(8); frameAt(500); hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(frames.size).toBe(0); expect(animation.paused).toBe(true);
    hidden = false; act(() => document.dispatchEvent(new Event('visibilitychange')));
    frameAt(750);
    act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(true) })));
    expect(frames.size).toBe(0); expect(animation.paused).toBe(true);
    render(-8); expect(frames.size).toBe(0);
    act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(false) })));
    expect(frames.size).toBe(1);
    act(() => root!.unmount()); root = null;
    expect(frames.size).toBe(0); expect(animation.cancel).toHaveBeenCalledTimes(1);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(frames.size).toBe(0);
  });

  it('keeps system-reduced and invalid-speed presentations still', () => {
    media.matches = true; render(8); expect(frames.size).toBe(0);
    media.matches = false; act(() => media.dispatchEvent(new Event('change')));
    frameAt(250); render(Number.NaN); expect(frames.size).toBe(0); expect(animation.paused).toBe(true);
    render(8); frameAt(500); media.matches = true;
    act(() => media.dispatchEvent(new Event('change')));
    expect(frames.size).toBe(0); expect(animation.paused).toBe(true);
  });
});
