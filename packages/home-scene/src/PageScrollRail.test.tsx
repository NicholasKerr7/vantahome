// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageScrollRail } from './PageScrollRail';
import { useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;
let width: number;
let resize: () => void;
let systemReduced: boolean;
let mediaChanged: () => void;
const onChange = vi.fn();
const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) { this.scrollLeft = options.left ?? 0; });

/** Supply deterministic rail geometry and expose its responsive cancellation boundary. */
class TestResizeObserver {
  constructor(callback: () => void) { resize = callback; }
  observe() {}
  disconnect() {}
}

/** Re-render a controlled page without remounting the pending interaction. */
function renderRail(page = 0, count = 5, resetKey = 'living') {
  act(() => root.render(<PageScrollRail page={page} count={count} onChange={onChange} label="Devices" resetKey={resetKey} />));
  return container.querySelector<HTMLDivElement>('.page-scroll-track')!;
}

/** Simulate native horizontal scrolling; the rail itself never changes device state. */
function wheelTo(element: HTMLDivElement, left: number) {
  act(() => {
    element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 44 }));
    element.scrollLeft = left;
    element.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

/** Let an actual scroll burst settle through the same debounce used by Safari. */
function settle() { act(() => vi.advanceTimersByTime(200)); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  width = 132;
  systemReduced = false;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.stubGlobal('matchMedia', () => ({ get matches() { return systemReduced; }, addEventListener(_event: string, callback: () => void) { mediaChanged = callback; }, removeEventListener() {} }));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
  useHomeStore.setState({ motionDisabled: false });
  onChange.mockClear();
  scrollTo.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('horizontal page rail', () => {
  it('commits one settled page without reacting to programmatic alignment', () => {
    const track = renderRail();
    wheelTo(track, 47);
    act(() => vi.advanceTimersByTime(100));
    wheelTo(track, 91);
    expect(onChange).not.toHaveBeenCalled();
    settle();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
    renderRail(2);
    act(() => track.dispatchEvent(new Event('scroll')));
    settle();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('3 / 5');
  });

  it.each(['scope', 'count', 'page', 'resize'] as const)('cancels an old release when %s changes', (change) => {
    const track = renderRail();
    wheelTo(track, 132);
    if (change === 'scope') renderRail(0, 5, 'kitchen');
    if (change === 'count') renderRail(0, 2);
    if (change === 'page') renderRail(1);
    if (change === 'resize') act(() => { width = 88; resize(); });
    settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(track.scrollLeft).toBe(change === 'page' ? 44 : 0);
  });

  it('waits for touch release and blocks a trailing click after a drag', () => {
    const track = renderRail();
    act(() => {
      track.dispatchEvent(new Event('touchstart', { bubbles: true }));
      track.scrollLeft = 88;
      track.dispatchEvent(new Event('scroll'));
    });
    settle();
    expect(onChange).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('touchend')));
    settle();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(2);
    act(() => container.querySelector<HTMLButtonElement>('[data-scroll-page="1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps pointer release outside the rail from leaving the gesture held', () => {
    const track = renderRail();
    act(() => {
      track.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      track.scrollLeft = 44;
      track.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('pointerup'));
    });
    settle();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('settles at the boundary when the last wheel tick produces no scroll event', () => {
    const track = renderRail();
    wheelTo(track, 176);
    act(() => track.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 44 })));
    settle();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(4);
  });

  it('preserves arrow navigation, current-page semantics and a single tab stop', () => {
    const track = renderRail(1);
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(container.querySelector('[aria-current="page"]')?.getAttribute('aria-label')).toBe('Devices page 2 of 5');
    act(() => track.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' })));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(4);
    expect(document.activeElement?.getAttribute('data-scroll-page')).toBe('4');
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('keeps a single page inert and ignores vertical wheels and zoom gestures', () => {
    const track = renderRail(0, 1);
    wheelTo(track, 100);
    settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
    expect(container.querySelector('button')?.disabled).toBe(true);
    renderRail();
    act(() => {
      track.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 50 }));
      track.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 50, ctrlKey: true }));
      track.scrollLeft = 88;
      track.dispatchEvent(new Event('scroll'));
    });
    settle();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('animates button navigation but independently honors both motion settings', () => {
    renderRail();
    renderRail(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 44, behavior: 'smooth' });
    act(() => useHomeStore.setState({ motionDisabled: true }));
    renderRail(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 88, behavior: 'auto' });
    act(() => { useHomeStore.setState({ motionDisabled: false }); systemReduced = true; mediaChanged(); });
    renderRail(3);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 132, behavior: 'auto' });
  });

  it('releases pending timers when its sheet closes', () => {
    const track = renderRail();
    wheelTo(track, 88);
    act(() => root.render(null));
    settle();
    expect(onChange).not.toHaveBeenCalled();
  });
});
