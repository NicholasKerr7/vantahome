// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdleCinematic } from './useIdleCinematic';
import { useCinematicStore } from './cinematicStore';
import { CINEMATIC_IDLE_MS } from './idleCinematic';
import { CinematicTourOverlay } from './CinematicTourOverlay';

let container: HTMLDivElement;
let root: Root;
let hidden = false;
const command = vi.fn();

/** Exercise the real event controller without mounting WebGL or issuing hardware commands. */
function Harness({ eligible = true, scope = 'owner:home', overlay = false }: { eligible?: boolean; scope?: string; overlay?: boolean }) {
  useIdleCinematic({ eligible, scopeKey: scope });
  const showcase = useCinematicStore((state) => state.showcase);
  return <><button onClick={command}>Device command</button><input aria-label="Device name" />{overlay && showcase ? <CinematicTourOverlay /> : null}</>;
}
/** Advance real timer callbacks while flushing the hook's React store subscribers. */
function wait(milliseconds = CINEMATIC_IDLE_MS) { act(() => vi.advanceTimersByTime(milliseconds)); }
/** JSDOM lacks PointerEvent in some runtimes, so attach its stable pointer identity to a mouse-shaped event. */
function pointer(type: string, target: EventTarget, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  act(() => target.dispatchEvent(event));
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  useCinematicStore.setState({ showcase: false, idleEnabled: true, preferenceError: false });
  command.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('idle property tour interaction', () => {
  it('waits for readiness, resets on scope/blocker changes, and cancels immediately when eligibility is lost', () => {
    act(() => root.render(<Harness eligible={false} />));
    wait(CINEMATIC_IDLE_MS * 2);
    expect(useCinematicStore.getState().showcase).toBe(false);
    act(() => root.render(<Harness />));
    wait(CINEMATIC_IDLE_MS - 1);
    act(() => root.render(<Harness scope="guest:living" />));
    wait(CINEMATIC_IDLE_MS - 1);
    expect(useCinematicStore.getState().showcase).toBe(false);
    wait(1);
    expect(useCinematicStore.getState().showcase).toBe(true);
    act(() => root.render(<Harness eligible={false} scope="guest:living" />));
    expect(useCinematicStore.getState().showcase).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cannot start underneath a held pointer and consumes the whole returning tap before allowing a new action', () => {
    act(() => root.render(<Harness />));
    const button = container.querySelector('button')!;
    pointer('pointerdown', button);
    wait(CINEMATIC_IDLE_MS * 2);
    expect(useCinematicStore.getState().showcase).toBe(false);
    pointer('pointerup', button);
    wait();
    expect(useCinematicStore.getState().showcase).toBe(true);
    expect(pointer('pointerdown', button).defaultPrevented).toBe(true);
    expect(useCinematicStore.getState().showcase).toBe(false);
    pointer('pointerup', button);
    act(() => button.click());
    expect(command).not.toHaveBeenCalled();
    pointer('pointerdown', button);
    pointer('pointerup', button);
    act(() => button.click());
    expect(command).toHaveBeenCalledOnce();
    wait(CINEMATIC_IDLE_MS - 1);
    expect(useCinematicStore.getState().showcase).toBe(false);
    wait(1);
    expect(useCinematicStore.getState().showcase).toBe(true);
  });

  it('does not count hidden time and always waits again after foreground recovery', () => {
    act(() => root.render(<Harness />));
    wait();
    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(useCinematicStore.getState().showcase).toBe(false);
    wait(CINEMATIC_IDLE_MS * 4);
    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    wait(CINEMATIC_IDLE_MS - 1);
    expect(useCinematicStore.getState().showcase).toBe(false);
    wait(1);
    expect(useCinematicStore.getState().showcase).toBe(true);
  });

  it('leaves editing and open dialogs alone, then rearms after focus returns', async () => {
    act(() => root.render(<Harness />));
    const input = container.querySelector('input')!;
    await act(async () => { input.focus(); });
    wait(CINEMATIC_IDLE_MS * 2);
    expect(useCinematicStore.getState().showcase).toBe(false);
    await act(async () => { input.blur(); });
    const dialog = document.createElement('dialog');
    dialog.open = true;
    container.append(dialog);
    wait();
    expect(useCinematicStore.getState().showcase).toBe(false);
    dialog.remove();
    await act(async () => { container.querySelector('button')!.focus(); });
    wait();
    expect(useCinematicStore.getState().showcase).toBe(true);
  });

  it('consumes keyboard and wheel exit input without forwarding it to device controls', () => {
    act(() => root.render(<Harness />));
    wait();
    const button = container.querySelector('button')!;
    const key = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => button.dispatchEvent(key));
    expect(key.defaultPrevented).toBe(true);
    act(() => button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true })));
    act(() => button.click());
    expect(command).not.toHaveBeenCalled();
    wait();
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true });
    act(() => button.dispatchEvent(wheel));
    expect(wheel.defaultPrevented).toBe(true);
    expect(useCinematicStore.getState().showcase).toBe(false);
  });

  it('focuses the accessible return shield without treating its own focus as user activity', async () => {
    act(() => root.render(<Harness overlay />));
    await act(async () => { vi.advanceTimersByTime(CINEMATIC_IDLE_MS); });
    const shield = document.querySelector<HTMLButtonElement>('[data-cinematic-return]')!;
    expect(shield.textContent).toContain('Touch to return');
    expect(document.activeElement).toBe(shield);
    expect(useCinematicStore.getState().showcase).toBe(true);
    act(() => shield.click());
    expect(useCinematicStore.getState().showcase).toBe(false);
    expect(document.querySelector('[data-cinematic-return]')).toBeNull();
    expect(command).not.toHaveBeenCalled();
  });
});
