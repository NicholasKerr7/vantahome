// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardInspector } from './DashboardInspector';
import { DEVICES } from './data';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { createDefaultState, useHomeStore } from './state';
import { inspectorDeviceCapacity } from './useInspectorDevicePage';

let container: HTMLDivElement;
let root: Root;
let gridHeight: number;
let resize: () => void;
const livingDevices = DEVICES.filter((device) => device.roomId === 'living');

/** Deliver controlled grid geometry changes without a browser layout engine. */
class TestResizeObserver {
  /** Retain the current observer callback for an explicit resize in each test. */
  constructor(callback: () => void) { resize = callback; }
  /** The test's bounding rectangle provides the observed geometry. */
  observe() {}
  /** This synchronous observer has no pending browser work to release. */
  disconnect() {}
}

/** Resize the existing grid without remounting the inspector or its focused controls. */
function resizeGrid(height: number) {
  gridHeight = height;
  act(() => resize());
}

/** Read actual visible device identities, independent of title or status formatting. */
function visibleIds() {
  return [...container.querySelectorAll<HTMLElement>('[data-inspector-device]')].map((element) => element.dataset.inspectorDevice);
}

/** Exercise the real inspector with the current room, selection and access snapshot. */
function renderInspector() {
  act(() => root.render(<DashboardInspector onFullControls={() => undefined} onBrowseDevices={() => undefined} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  gridHeight = 108;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains('device-card-grid') ? gridHeight : 0;
    return { x: 0, y: 0, top: 0, left: 0, right: 242, bottom: height, width: 242, height,
      /** Geometry is inspected directly; serialization is unused in these tests. */
      toJSON() { return {}; },
    };
  });
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  useHomeStore.getState().setRoom('living');
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

describe('room inspector capacity', () => {
  it.each([
    [107, 108, 8, 2], [223.9, 108, 8, 2], [224, 108, 8, 4], [340, 108, 8, 6],
    [194, 93, 8, 4], [170, 81, 8, 4], [0, 108, 8, 2], [Number.NaN, 108, 8, 2],
    [224, Number.NaN, Number.NaN, 4],
  ])('fits complete rows in %s pixels with a %s minimum and %s gap', (height, minimum, gap, expected) => {
    expect(inspectorDeviceCapacity(height, minimum, gap)).toBe(expected);
  });

  it('fills additional rows as the actual remaining grid grows, without changing devices', () => {
    renderInspector();
    const before = useHomeStore.getState();
    expect(visibleIds()).toEqual(livingDevices.slice(0, 2).map((device) => device.id));
    resizeGrid(340);
    expect(visibleIds()).toEqual(livingDevices.slice(0, 6).map((device) => device.id));
    resizeGrid(224);
    expect(visibleIds()).toEqual(livingDevices.slice(0, 4).map((device) => device.id));
    expect(useHomeStore.getState()).toBe(before);
  });

  it('follows a later selected device and keeps it visible through capacity changes', () => {
    renderInspector();
    const selected = livingDevices.at(-1)!;
    act(() => useHomeStore.getState().selectDevice(selected.id));
    expect(visibleIds()).toContain(selected.id);
    resizeGrid(340);
    expect(visibleIds()).toContain(selected.id);
    resizeGrid(108);
    expect(visibleIds()).toContain(selected.id);
    expect(useHomeStore.getState().selectedDevice).toBe(selected.id);
  });

  it('retains an explicitly browsed page when resizing, without changing the selected device', () => {
    renderInspector();
    const before = useHomeStore.getState();
    const next = container.querySelector<HTMLButtonElement>('[aria-label="Next devices"]')!;
    act(() => next.click());
    act(() => next.click());
    expect(visibleIds()).toContain(livingDevices[4].id);
    resizeGrid(224);
    expect(visibleIds()).toContain(livingDevices[4].id);
    resizeGrid(108);
    expect(visibleIds()).toContain(livingDevices[4].id);
    expect(useHomeStore.getState()).toBe(before);
  });

  it('discards old manual paging when returning to a previously selected device', () => {
    renderInspector();
    const first = livingDevices[0].id;
    const last = livingDevices.at(-1)!.id;
    const next = container.querySelector<HTMLButtonElement>('[aria-label="Next devices"]')!;
    act(() => next.click());
    act(() => next.click());
    expect(visibleIds()).not.toContain(first);
    act(() => useHomeStore.getState().selectDevice(last));
    expect(visibleIds()).toContain(last);
    act(() => useHomeStore.getState().selectDevice(first));
    expect(visibleIds()).toContain(first);
  });

  it('keeps an unselected keyboard-focused tile mounted as rows shrink and expand', () => {
    gridHeight = 340;
    renderInspector();
    const focused = container.querySelector<HTMLButtonElement>(`[data-inspector-device="${livingDevices[4].id}"]`)!;
    act(() => focused.focus());
    resizeGrid(108);
    expect(document.activeElement).toBe(focused);
    expect(focused.isConnected).toBe(true);
    resizeGrid(224);
    expect(document.activeElement).toBe(focused);
    expect(focused.isConnected).toBe(true);
  });

  it('retains its last valid capacity while hidden and measures again when visible', () => {
    gridHeight = 340;
    renderInspector();
    const before = visibleIds();
    resizeGrid(0);
    expect(visibleIds()).toEqual(before);
    resizeGrid(108);
    expect(visibleIds()).toHaveLength(2);
  });

  it('follows the new room and never includes devices removed by a permission update', () => {
    gridHeight = 340;
    renderInspector();
    act(() => useHomeStore.getState().setRoom('master'));
    expect(visibleIds().every((id) => DEVICES.find((device) => device.id === id)?.roomId === 'master')).toBe(true);
    act(() => useHomeStore.getState().applyAccessSnapshot({}, {
      fullHome: false, roomIds: ['master'], deviceIds: ['master-light'], controllableDeviceIds: [],
    }));
    expect(visibleIds()).toEqual(['master-light']);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Next devices"]')!.disabled).toBe(true);
    resizeGrid(800);
    expect(visibleIds()).toEqual(['master-light']);
  });

  it('observes a newly mounted grid after leaving the property overview companion', () => {
    act(() => useHomeStore.getState().applyAccessSnapshot({}, {
      fullHome: false, propertyOverview: true, roomIds: ['living'],
      deviceIds: livingDevices.map((device) => device.id), controllableDeviceIds: [],
    }));
    renderInspector();
    expect(container.querySelector('.property-companion')).not.toBeNull();
    gridHeight = 340;
    act(() => useHomeStore.getState().setRoom('living'));
    expect(container.querySelector('.property-companion')).toBeNull();
    expect(visibleIds()).toHaveLength(6);
  });
});
