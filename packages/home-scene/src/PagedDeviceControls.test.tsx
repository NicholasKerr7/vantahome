// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevice } from './data';
import { PagedDeviceControls } from './PagedDeviceControls';

let container: HTMLDivElement;
let root: Root;
let panelHeight: number;
let resize: () => void;

/** Report a measured sheet resize without relying on a browser layout engine. */
class TestResizeObserver {
  /** Capture the observer notification so each test controls its layout transition. */
  constructor(private callback: () => void) {}
  /** Measurements come from the panel's clientHeight getter in this test. */
  observe(element: HTMLElement) { if (element.classList.contains('device-control-page')) resize = this.callback; }
  /** The synchronous stub has no pending notifications to release. */
  disconnect() {}
}

/** Resize the existing panel and flush its capacity update without remounting controls. */
function resizePanel(height: number) {
  panelHeight = height;
  act(() => resize());
}

/** Open the device's real shared controls with reproducible simulation defaults. */
function renderControls(deviceId: string) {
  const device = getDevice(deviceId)!;
  act(() => root.render(<PagedDeviceControls device={device} current={{ on: device.defaultOn, level: device.defaultLevel }} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  panelHeight = 400;
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('device-control-page') ? panelHeight : 400;
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('full-control focus during resizing', () => {
  it('browses with the footer rail without moving focus into a device field', () => {
    renderControls('living-fan');
    act(() => container.querySelector<HTMLButtonElement>('[data-control-group="modes"]')!.click());
    const target = container.querySelector<HTMLButtonElement>('[data-scroll-page="1"]')!;
    act(() => { target.focus(); target.click(); });
    expect(container.textContent).toContain('Direction');
    expect(document.activeElement).toBe(target);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('2 / 4');
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Previous controls page"]')?.disabled).toBe(false);
  });

  it('explains saved-only fan settings and clears that explanation when the working direction control is shown', () => {
    renderControls('living-fan');
    act(() => container.querySelector<HTMLButtonElement>('[data-control-group="modes"]')!.click());
    expect(container.querySelector('[role="note"]')?.textContent).toContain('this fixed fan has no oscillation or lamp');
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Next controls page"]')!.click());
    expect(container.querySelector('[role="note"]')).toBeNull();
    expect(container.textContent).toContain('Direction');
  });

  it('keeps a focused later field mounted as the page shrinks and expands', () => {
    renderControls('living-light');
    const temperature = container.querySelector<HTMLInputElement>('#sheet-living-light-light-colorTempK')!;
    act(() => temperature.focus());

    resizePanel(130);
    expect(container.querySelectorAll('.device-control-page input')).toHaveLength(1);
    expect(document.activeElement).toBe(temperature);
    expect(temperature.isConnected).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('3 /');

    resizePanel(400);
    expect(document.activeElement).toBe(temperature);
    expect(container.querySelectorAll('.device-control-page input, .device-control-page select')).toHaveLength(3);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('1 /');
  });

  it('keeps a focused compact action mounted when fewer actions fit', () => {
    renderControls('family-tv');
    const next = container.querySelector<HTMLButtonElement>('[aria-label="Next controls page"]')!;
    while (!container.querySelector('.device-control-page.is-compact') && !next.disabled) act(() => next.click());
    const actions = container.querySelectorAll<HTMLButtonElement>('.device-control-page .capability-action');
    expect(actions.length).toBeGreaterThan(2);
    const action = actions[actions.length - 1];
    act(() => action.focus());

    resizePanel(130);
    expect(container.querySelectorAll('.device-control-page .capability-action').length).toBeLessThanOrEqual(2);
    expect(document.activeElement).toBe(action);
    expect(action.isConnected).toBe(true);

    resizePanel(400);
    expect(document.activeElement).toBe(action);
    expect(action.isConnected).toBe(true);
  });
});
