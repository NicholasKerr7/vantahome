// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HorizontalCardScroller } from './HorizontalCardScroller';
import { useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;
let width: number;
let resize: () => void;
let systemReduced: boolean;
let mediaChanged: () => void;
const onChange = vi.fn();
const action = vi.fn();
/** Model programmatic browser movement while leaving user scroll events explicit. */
const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) { this.scrollLeft = options.left ?? 0; });

/** Expose the actual card viewport's resize notification to deterministic tests. */
class TestResizeObserver {
  constructor(callback: () => void) { resize = callback; }
  observe() {}
  disconnect() {}
}

/** Render the real keyed card collection with only its current and neighboring pages mounted. */
function renderCards(page = 0, count = 5, resetKey = 'living', pageSize = 2) {
  act(() => root.render(<HorizontalCardScroller page={page} count={count} pageSize={pageSize} onChange={onChange} label="Devices" resetKey={resetKey}>
    {Array.from({ length: count * pageSize }, (_, index) => <button key={`device-${index}`} data-device={index} onClick={action}>Device {index}</button>)}
  </HorizontalCardScroller>));
  return container.querySelector<HTMLDivElement>('[data-card-scroller]')!;
}

/** Deliver the browser's native content movement after a real input starts the gesture. */
function wheelTo(element: HTMLDivElement, left: number) {
  act(() => {
    element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 44 }));
    element.scrollLeft = left;
    element.dispatchEvent(new Event('scroll'));
  });
}

/** Add mouse pointer identity to jsdom's available mouse event implementation. */
function pointer(type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
  return event;
}

/** Let the final momentum tail complete without running unrelated application timers. */
function settle() { act(() => vi.advanceTimersByTime(220)); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  width = 300;
  systemReduced = false;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width } as DOMRect));
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ columnGap: '8px' } as CSSStyleDeclaration);
  vi.stubGlobal('matchMedia', () => ({ get matches() { return systemReduced; }, addEventListener(_event: string, callback: () => void) { mediaChanged = callback; }, removeEventListener() {} }));
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
  useHomeStore.setState({ motionDisabled: false });
  onChange.mockClear(); action.mockClear(); scrollTo.mockClear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount()); container.remove();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('actual horizontal card movement', () => {
  it('moves the same card surface for arrow navigation and ignores its programmatic scroll events', () => {
    const track = renderCards();
    renderCards(2);
    expect(track.scrollLeft).toBe(616);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 616, behavior: 'smooth' });
    act(() => track.dispatchEvent(new Event('scroll')));
    settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(track.querySelectorAll('.card-scroll-item:not([inert]) button')).toHaveLength(2);
    expect(track.querySelector('[data-device="0"]')).toBeNull();
  });

  it('settles touch/trackpad movement into the existing page callback without running a card', () => {
    const track = renderCards();
    wheelTo(track, 320);
    expect(track.scrollLeft).toBe(320);
    expect(onChange).not.toHaveBeenCalled();
    expect(track.querySelectorAll('.card-scroll-item:not([inert]) button')).toHaveLength(0);
    settle();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
    expect(action).not.toHaveBeenCalled();
    renderCards(1);
    expect(track.querySelector('.card-scroll-item:not([inert]) button')?.textContent).toBe('Device 2');
  });

  it('supports mouse dragging on the actual card while blocking its trailing open/run click', () => {
    const track = renderCards();
    const card = track.querySelector<HTMLButtonElement>('[data-device="0"]')!;
    act(() => {
      card.dispatchEvent(pointer('pointerdown', 250));
      track.dispatchEvent(pointer('pointermove', -65));
      window.dispatchEvent(pointer('pointerup', -65));
      card.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    expect(track.scrollLeft).toBe(315);
    settle();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
    expect(action).not.toHaveBeenCalled();
    act(() => { card.dispatchEvent(pointer('pointerdown', 120)); card.click(); });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it.each(['scope', 'count', 'page', 'resize'] as const)('cancels delayed navigation when %s changes', (change) => {
    const track = renderCards();
    wheelTo(track, 620);
    if (change === 'scope') renderCards(0, 5, 'kitchen');
    if (change === 'count') renderCards(0, 2);
    if (change === 'page') renderCards(1);
    if (change === 'resize') act(() => { width = 300.5; resize(); });
    settle();
    expect(onChange).not.toHaveBeenCalled();
    expect(track.scrollLeft).toBe(change === 'page' ? 308 : 0);
  });

  it('retains keyed focused cards when resizing repartitions them into another page', () => {
    renderCards(0, 3, 'large', 4);
    const focused = container.querySelector<HTMLButtonElement>('[data-device="2"]')!;
    act(() => focused.focus());
    renderCards(1, 6, 'small', 2);
    expect(document.activeElement).toBe(focused);
    expect(focused.isConnected).toBe(true);
    expect(focused.closest('[inert]')).toBeNull();
  });

  it('keeps offscreen pages inert and bounds mounted cards during long collections', () => {
    const track = renderCards(0, 30);
    expect(track.querySelectorAll('button')).toHaveLength(4);
    expect(track.querySelectorAll('.card-scroll-item:not([inert]) button')).toHaveLength(2);
    wheelTo(track, 20 * 308);
    expect(track.querySelectorAll('button').length).toBeLessThanOrEqual(8);
    expect(track.querySelector('[data-device="40"]')).not.toBeNull();
  });

  it('honors both motion settings while retaining direct touch movement', () => {
    renderCards();
    act(() => useHomeStore.setState({ motionDisabled: true }));
    renderCards(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 308, behavior: 'auto' });
    act(() => { useHomeStore.setState({ motionDisabled: false }); systemReduced = true; mediaChanged(); });
    const track = renderCards(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 616, behavior: 'auto' });
    wheelTo(track, 924);
    settle();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('settles a boundary wheel tail and cancels pending work on close', () => {
    const track = renderCards();
    wheelTo(track, 4 * 308);
    act(() => track.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 30 })));
    settle();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(4);
    onChange.mockClear();
    wheelTo(track, 308);
    act(() => root.render(null));
    settle();
    expect(onChange).not.toHaveBeenCalled();
  });
});
