// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilityControls } from './CapabilityControls';
import { getDevice } from './data';
import { getCapabilities } from './deviceCapabilities';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import type { DeviceState } from './simulationTypes';
import { createDefaultState, useHomeStore } from './state';

let container: HTMLDivElement;
let root: Root;
const fixtures = [
  ['door', 'entry-door'], ['garage', 'utility-shutter'], ['window', 'kitchen-window'],
] as const;

/** Render the real generic More controls without mounting a decorative device console. */
function renderControls(id: string, current: DeviceState): void {
  const device = getDevice(id)!;
  act(() => root.render(<CapabilityControls device={device} current={current} capabilities={getCapabilities(device.kind)} prefix="test-" />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  vi.unstubAllGlobals();
});

describe.each(fixtures)('%s More position controls', (kind, id) => {
  it.each([Number.NaN, Infinity, -Infinity])('keeps malformed %s out of labels and ranges, while explicit commands can recover', (level) => {
    const current = { on: false, level };
    const states = useHomeStore.getState().deviceStates;
    useHomeStore.setState({ deviceStates: { ...states, [id]: current } });
    renderControls(id, current);
    const slider = container.querySelector<HTMLInputElement>('[data-capability-id] input[type="range"]')!;
    expect(slider.disabled).toBe(true);
    expect(slider.valueAsNumber).toBe(0);
    expect(slider.getAttribute('aria-valuetext')).toBe('Position unavailable');
    expect(container.textContent).toContain('Position unavailable');
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    for (const direction of ['up', 'down']) {
      const relative = container.querySelector<HTMLButtonElement>(`[data-capability-id="${kind}-position-${direction}"]`)!;
      expect(relative.disabled).toBe(true);
      act(() => relative.click());
    }
    expect(useHomeStore.getState().deviceStates[id]).toBe(current);
    const recoveryId = kind === 'window' ? 'window-vent' : `${kind}-command-open`;
    const recovery = container.querySelector<HTMLButtonElement>(`[data-capability-id="${recoveryId}"]`)!;
    expect(recovery.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>(`[data-capability-id="${kind}-command-close"]`)!.disabled).toBe(false);
    act(() => recovery.click());
    const accepted = useHomeStore.getState().deviceStates[id];
    expect(accepted.level).toBe(kind === 'window' ? 25 : 100);
    renderControls(id, accepted);
    expect(slider.disabled).toBe(false);
    expect(slider.valueAsNumber).toBe(accepted.level);
    expect(slider.getAttribute('aria-valuetext')).toBe(`${accepted.level}%`);
    expect(container.textContent).not.toContain('Position unavailable');
  });

  it('does not disable independent saved schedule ranges when position is unknown', () => {
    renderControls(id, { on: false, level: Number.NaN });
    const schedule = container.querySelector<HTMLInputElement>(`[data-capability-id="${kind}-scheduleHour"] input`)!;
    expect(schedule.disabled).toBe(false);
    expect(Number.isFinite(schedule.valueAsNumber)).toBe(true);
  });
});
