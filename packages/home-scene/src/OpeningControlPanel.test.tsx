// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
import { scenePresentationMessage, SCENE_PRESENTATION_CHANNEL } from './scenePresentation';

let container: HTMLDivElement;
let root: Root;
let hidden = false;
const media = Object.assign(new EventTarget(), { matches: false });
const fixtures = [
  { id: 'entry-door', label: 'door', kind: 'door' },
  { id: 'utility-shutter', label: 'garage', kind: 'garage' },
  { id: 'kitchen-window', label: 'window', kind: 'window' },
] as const;

/** Activate a real action through the same button event used by touch and keyboard. */
function click(label: string) {
  const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.getAttribute('aria-label') === label || button.textContent === label);
  expect(target, label).toBeTruthy(); act(() => target!.click());
}
/** Mount the real permission-aware sheet against canonical shared state. */
function render(id: string) { act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />)); }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('ReactNativeWebView', {});
  hidden = false; media.matches = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
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

describe.each(fixtures)('$label opening console', ({ id, label, kind }) => {
  it('routes directly to its own geometry and retains More, routines and focus', () => {
    render(id);
    expect(container.querySelector('.opening-artwork')?.getAttribute('data-kind')).toBe(kind);
    expect(container.querySelector('.device-sheet-primary')).toBeNull();
    const before = useHomeStore.getState().deviceStates[id];
    click(`More ${label} settings`);
    expect(container.textContent).toContain('Routines');
    expect(document.activeElement?.textContent).toBe(`Back to ${label} console`);
    click(`Back to ${label} console`);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(`More ${label} settings`);
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  });
  it('uses canonical position for endpoints and rapid relative steps without fake motor states', () => {
    render(id); click('Open');
    expect(useHomeStore.getState().deviceStates[id].level).toBe(100);
    const openTransform = container.querySelector('.opening-moving-part')?.getAttribute('transform');
    for (let i = 0; i < 3; i++) click(`Decrease ${label} opening by 5 percent`);
    click(`Increase ${label} opening by 5 percent`);
    expect(useHomeStore.getState().deviceStates[id].level).toBe(90);
    expect(container.querySelector('output')?.textContent).toBe('90%');
    expect(container.querySelector('.opening-moving-part')?.getAttribute('transform')).not.toBe(openTransform);
    click('Close');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, level: 0 });
    expect(container.querySelector<HTMLButtonElement>(`[aria-label="Decrease ${label} opening by 5 percent"]`)?.disabled).toBe(true);
    expect(container.textContent).not.toMatch(/Moving|Stopped|Locked|Obstruction|Auto.close/);
  });
  it('reflects external changes and revokes controls immediately without mutating saved state', () => {
    render(id);
    act(() => useHomeStore.getState().setDeviceLevel(id, 45));
    expect(container.querySelector('output')?.textContent).toBe('45%');
    click(`More ${label} settings`);
    const before = useHomeStore.getState().deviceStates[id];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, fullHome: false, roomIds: [getDevice(id)!.roomId], deviceIds: [id], controllableDeviceIds: [] } }));
    expect(container.querySelector('.opening-more')).toBeNull();
    expect(container.querySelector('.opening-console')).toBeNull();
    expect(container.textContent).toContain('View only');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  });
  it('shows unknown positions neutrally and allows an explicit target to repair them', () => {
    useHomeStore.setState({ deviceStates: { ...useHomeStore.getState().deviceStates, [id]: { on: false, level: Number.NaN, settings: {} } } });
    render(id);
    expect(container.querySelector('.opening-artwork')?.getAttribute('data-known')).toBe('false');
    expect(container.querySelector('.opening-moving-part')).toBeNull();
    expect(container.querySelector('output')?.textContent).toBe('—');
    expect(container.querySelector<HTMLInputElement>('input[type="range"]')?.disabled).toBe(true);
    expect(container.querySelector('.opening-status')?.textContent).toContain('Position unavailable');
    click('Open'); expect(container.querySelector('output')?.textContent).toBe('100%');
  });
});

it('retains window Vent 25% without affecting another opening', () => {
  const before = useHomeStore.getState().deviceStates['entry-door'];
  render('kitchen-window'); click('Vent 25%');
  expect(useHomeStore.getState().deviceStates['kitchen-window'].level).toBe(25);
  expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe('Vent 25%');
  expect(useHomeStore.getState().deviceStates['entry-door']).toEqual(before);
});

it('snaps position transitions for reduced motion, page hiding and native host suspension', () => {
  render('entry-door');
  const disabled = () => container.querySelector('.opening-workspace')?.getAttribute('data-motion-disabled');
  expect(disabled()).toBe('false');
  hidden = true; act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(disabled()).toBe('true');
  hidden = false; act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(disabled()).toBe('false');
  media.matches = true; act(() => media.dispatchEvent(new Event('change'))); expect(disabled()).toBe('true');
  media.matches = false; act(() => media.dispatchEvent(new Event('change')));
  act(() => useHomeStore.setState({ motionDisabled: true })); expect(disabled()).toBe('true');
  act(() => useHomeStore.setState({ motionDisabled: false })); expect(disabled()).toBe('false');
  act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(true) }))); expect(disabled()).toBe('true');
  act(() => useHomeStore.getState().setDeviceLevel('entry-door', 50)); expect(container.querySelector('output')?.textContent).toBe('50%');
  act(() => window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(false) }))); expect(disabled()).toBe('false');
});
