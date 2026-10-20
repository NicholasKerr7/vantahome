// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { DeviceControlSheet } from './DeviceControlSheet';
import { SpeakerController } from './SpeakerControlPanel';
import { EMPTY_SCENE_ACCESS, FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;
const id = 'living-speaker';

/** Exercise the actual console over the canonical store instead of a duplicate state fixture. */
function Harness() {
  const current = useHomeStore((state) => state.deviceStates[id]);
  return <SpeakerController device={getDevice(id)!} current={current} />;
}

/** Activate the accessible control through its ordinary click handler. */
function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label);
  expect(button, label).toBeTruthy();
  act(() => button!.click());
}

/** Select an existing catalog preference through its rendered input. */
function choose(label: string, value: string) {
  const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  act(() => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
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
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  vi.unstubAllGlobals();
});

describe('speaker audio console', () => {
  it('distinguishes playing, paused and muted indicators without streaming audio', () => {
    act(() => root.render(<Harness />));
    click('Play speaker preview');
    expect(container.querySelector('.speaker-console')?.getAttribute('data-active')).toBe('true');
    click('Mute speaker');
    expect(container.querySelector('.speaker-console')?.getAttribute('data-active')).toBe('false');
    expect(container.querySelector('[aria-label="Pause speaker preview"]')).toBeTruthy();
    click('Mute speaker'); click('Pause speaker preview');
    expect(container.querySelector('.speaker-console')?.getAttribute('data-active')).toBe('false');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: true, settings: { playbackState: 'paused' } });
    expect(container.textContent).toContain('No audio stream');
  });

  it('preserves volume and preferences while powered off, and does not resume automatically', () => {
    act(() => root.render(<Harness />));
    click('Play speaker preview'); click('Speaker power');
    choose('Speaker source preference', 'AirPlay'); choose('Speaker sound preference', 'Bass');
    click('Increase speaker volume'); click('Mute speaker');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: false, settings: { volume: 33, speakerSource: 'AirPlay', speakerPreset: 'Bass', muted: true, playbackState: 'paused' } });
    click('Speaker power');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: true, settings: { volume: 33, playbackState: 'paused' } });
    expect(container.querySelector('.speaker-console')?.getAttribute('data-active')).toBe('false');
  });

  it('resolves rapid relative volume presses at the bounds without stale captured values', () => {
    act(() => useHomeStore.getState().setDeviceSetting(id, 'volume', 92));
    act(() => root.render(<Harness />));
    const plus = container.querySelector<HTMLButtonElement>('[aria-label="Increase speaker volume"]')!;
    act(() => { plus.click(); plus.click(); plus.click(); });
    expect(useHomeStore.getState().deviceStates[id].settings?.volume).toBe(100);
    expect(plus.disabled).toBe(true);
    act(() => useHomeStore.getState().setDeviceSetting(id, 'volume', 0));
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Decrease speaker volume"]')?.disabled).toBe(true);
    click('Play speaker preview');
    expect(container.querySelector('.speaker-console')?.getAttribute('data-active')).toBe('false');
  });

  it('changes only the sample track and preserves playback and preferences', () => {
    act(() => root.render(<Harness />));
    click('Play speaker preview'); click('Pause speaker preview');
    choose('Speaker sound preference', 'Vocal'); click('Next speaker preview track');
    expect(useHomeStore.getState().deviceStates[id]).toMatchObject({ on: true, settings: { trackIndex: 2, playbackPositionSec: 0, playbackState: 'paused', speakerPreset: 'Vocal' } });
    click('Previous speaker preview track');
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Previous speaker preview track"]')?.disabled).toBe(true);
  });

  it('retains settings through More and Back and restores focus', () => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    choose('Speaker source preference', 'Bluetooth');
    const before = useHomeStore.getState().deviceStates[id];
    click('More speaker settings');
    expect(container.querySelector('[aria-label="Device settings"]')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Back to audio console');
    click('Back to audio console');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More speaker settings');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
  });

  it('does not invent track metadata for malformed samples', () => {
    const states = useHomeStore.getState().deviceStates;
    act(() => useHomeStore.setState({ deviceStates: { ...states, [id]: { ...states[id], settings: { trackIndex: Number.NaN, playbackState: 'unknown' } } } }));
    act(() => root.render(<Harness />));
    expect(container.textContent).toContain('Preview track unavailable');
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Next speaker preview track"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Previous speaker preview track"]')?.disabled).toBe(true);
    expect(container.querySelector('.speaker-console')?.getAttribute('data-active')).toBe('false');
  });

  it('removes advanced contents when visibility is revoked', () => {
    act(() => root.render(<DeviceControlSheet deviceId={id} onClose={() => undefined} />));
    click('More speaker settings');
    act(() => useHomeStore.setState({ access: EMPTY_SCENE_ACCESS }));
    expect(container.textContent).toBe('');
  });

  it('blocks stale controls after authority is removed and retains reduced motion', () => {
    act(() => root.render(<Harness />));
    const before = useHomeStore.getState().deviceStates[id];
    act(() => useHomeStore.setState({ access: { ...FULL_SCENE_ACCESS, controllableDeviceIds: [] }, motionDisabled: true }));
    click('Play speaker preview'); click('Increase speaker volume'); click('Mute speaker'); click('Speaker power');
    choose('Speaker source preference', 'AirPlay');
    expect(useHomeStore.getState().deviceStates[id]).toEqual(before);
    expect(container.querySelector('.speaker-workspace')?.getAttribute('data-motion-disabled')).toBe('true');
  });
});
