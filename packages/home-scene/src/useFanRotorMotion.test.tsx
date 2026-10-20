// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCENE_PRESENTATION_CHANNEL, scenePresentationMessage } from './scenePresentation';
import { useFanRotorMotion } from './useFanRotorMotion';

/** Model the observable Web Animations controls without advancing a synthetic playback clock. */
class RotorAnimation {
  currentTime: number | null = 0;
  direction: PlaybackDirection = 'normal';
  playbackRate = 1;
  paused = true;
  effect = {
    updateTiming: vi.fn((timing: OptionalEffectTiming) => {
      this.direction = timing.direction ?? this.direction;
    }),
  };
  pause = vi.fn(() => { this.paused = true; });
  play = vi.fn(() => { this.paused = false; });
  cancel = vi.fn(() => { this.paused = true; });
  updatePlaybackRate = vi.fn((rate: number) => { this.playbackRate = rate; });
}

/** Deliver actual change events so reduced-motion listeners are exercised and removable. */
class MotionPreference extends EventTarget {
  matches = false;
}

let container: HTMLDivElement;
let root: Root | null;
let animation: RotorAnimation;
let animate: ReturnType<typeof vi.fn>;
let media: MotionPreference;
let hidden: boolean;
let originalAnimate: PropertyDescriptor | undefined;
let originalHidden: PropertyDescriptor | undefined;

/** A stable ref reproduces the mounted artwork while props change around the same rotor. */
function Harness({ velocity, reduced }: { velocity: number; reduced: boolean }) {
  const rotor = useRef<HTMLDivElement>(null);
  useFanRotorMotion(rotor, velocity, reduced);
  return <div ref={rotor} />;
}

/** Commit hook effects synchronously before inspecting the compositor contract. */
function render(velocity: number, reduced = false): void {
  act(() => root!.render(<Harness velocity={velocity} reduced={reduced} />));
}

/** Compare visible rotation, where one full revolution has the same blade position as zero. */
function visiblePhase(): number {
  const elapsed = ((animation.currentTime ?? 0) % 1000) / 1000;
  return animation.direction === 'reverse' ? (1 - elapsed) % 1 : elapsed;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  animation = new RotorAnimation();
  animate = vi.fn(() => animation);
  media = new MotionPreference();
  hidden = false;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
  else Reflect.deleteProperty(document, 'hidden');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fan rotor compositor lifecycle', () => {
  it('preserves the visible phase when reversing and when returning to forward motion', () => {
    render(2 * Math.PI);
    animation.currentTime = 2375;
    const before = visiblePhase();
    render(-2 * Math.PI);
    expect(animation.direction).toBe('reverse');
    expect(visiblePhase()).toBeCloseTo(before);
    expect(animation.currentTime).toBe(2625);
    render(2 * Math.PI);
    expect(animation.direction).toBe('normal');
    expect(visiblePhase()).toBeCloseTo(before);
    expect(animation.currentTime).toBe(2375);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('updates the playback rate without recreating or resetting the rotor animation', () => {
    render(2 * Math.PI);
    animation.currentTime = 412;
    render(4 * Math.PI);
    expect(animation.playbackRate).toBeCloseTo(2);
    expect(animation.currentTime).toBe(412);
    expect(animation.effect.updateTiming).not.toHaveBeenCalled();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animation.paused).toBe(false);
  });

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY])('pauses for inactive or invalid velocity %s and resumes from the same phase', (velocity) => {
    render(2 * Math.PI);
    animation.currentTime = 328;
    render(velocity);
    expect(animation.paused).toBe(true);
    expect(animation.currentTime).toBe(328);
    render(2 * Math.PI);
    expect(animation.paused).toBe(false);
    expect(animation.currentTime).toBe(328);
  });

  it('stays paused while the page is hidden, including intervening speed changes', () => {
    hidden = true;
    render(2 * Math.PI);
    expect(animation.play).not.toHaveBeenCalled();
    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(animation.paused).toBe(false);
    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    render(4 * Math.PI);
    expect(animation.paused).toBe(true);
    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(animation.playbackRate).toBeCloseTo(2);
    expect(animation.paused).toBe(false);
  });

  it('honors both system and profile reduced motion without one preference overriding the other', () => {
    media.matches = true;
    render(2 * Math.PI);
    expect(animation.play).not.toHaveBeenCalled();
    media.matches = false;
    act(() => media.dispatchEvent(new Event('change')));
    expect(animation.paused).toBe(false);
    render(2 * Math.PI, true);
    expect(animation.paused).toBe(true);
    act(() => media.dispatchEvent(new Event('change')));
    expect(animation.paused).toBe(true);
    media.matches = true;
    render(2 * Math.PI, false);
    expect(animation.paused).toBe(true);
    media.matches = false;
    act(() => media.dispatchEvent(new Event('change')));
    expect(animation.paused).toBe(false);
  });

  it('suspends for validated native-host events and preserves phase across a suspended reversal', () => {
    vi.stubGlobal('ReactNativeWebView', {});
    render(2 * Math.PI);
    animation.currentTime = 250;
    act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(true) })));
    expect(animation.paused).toBe(true);
    render(-2 * Math.PI);
    expect(animation.paused).toBe(true);
    expect(animation.currentTime).toBe(250);
    act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, {
      detail: { ...scenePresentationMessage(false), extra: true },
    })));
    expect(animation.paused).toBe(true);
    act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(false) })));
    expect(animation.paused).toBe(false);
    expect(animation.direction).toBe('reverse');
    expect(visiblePhase()).toBeCloseTo(0.25);
  });

  it('ignores native-host presentation events in an ordinary browser document', () => {
    render(2 * Math.PI);
    act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(true) })));
    expect(animation.paused).toBe(false);
  });

  it('cancels the compositor animation and removes every lifecycle listener on unmount', () => {
    vi.stubGlobal('ReactNativeWebView', {});
    const removeMedia = vi.spyOn(media, 'removeEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    render(2 * Math.PI);
    act(() => root!.unmount());
    root = null;
    expect(animation.cancel).toHaveBeenCalledTimes(1);
    expect(removeMedia).toHaveBeenCalledWith('change', expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('message', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith(SCENE_PRESENTATION_CHANNEL, expect.any(Function));
    const playCount = animation.play.mock.calls.length;
    act(() => {
      media.dispatchEvent(new Event('change'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(false) }));
    });
    expect(animation.play).toHaveBeenCalledTimes(playCount);
  });

  it('leaves readable static artwork when Web Animations is unavailable', () => {
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: undefined });
    render(2 * Math.PI);
    expect(container.firstElementChild).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();
  });
});
