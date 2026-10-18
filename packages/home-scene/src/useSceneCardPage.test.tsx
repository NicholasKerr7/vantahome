// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSceneCardPage } from './useSceneCardPage';

let container: HTMLDivElement;
let root: Root;
let rowWidth: number;
let labelWidth: number;
let labelVisible: boolean;
let resize: () => void;
let pagination: ReturnType<typeof useSceneCardPage>;
const observed = vi.fn();
const disconnected = vi.fn();
const scenes = Array.from({ length: 7 }, (_, index) => ({ id: `scene-${index}` }));

/** Deliver explicit row and label size changes without depending on jsdom layout. */
class TestResizeObserver {
  /** Retain the hook's measurement callback for a simulated browser resize. */
  constructor(callback: () => void) { resize = callback; }
  /** Record every surface whose geometry can change the available card width. */
  observe(element: Element) { observed(element); }
  /** Record cleanup so unmounted rows cannot retain observation work. */
  disconnect() { disconnected(); }
}

/** Keep keyed cards mounted while exposing which identities the hook makes reachable. */
function SceneRow({ items }: { items: readonly { id: string }[] }) {
  pagination = useSceneCardPage(items);
  return <section ref={pagination.rowRef} onFocusCapture={pagination.onFocusCapture} onBlurCapture={pagination.onBlurCapture} onKeyDown={pagination.onKeyDown} tabIndex={-1} className="dashboard-scenes">
    <span className="dashboard-scenes-label">Scenes</span>
    {items.map((scene, index) => <button key={scene.id} data-scene-id={scene.id}
      data-visible={Math.floor(index / pagination.pageSize) === pagination.page}>{scene.id}</button>)}
  </section>;
}

/** Update only the inventory, preserving the existing row and keyed button identities. */
function renderScenes(items: readonly { id: string }[] = scenes) {
  act(() => root.render(<SceneRow items={items} />));
}

/** Resize the actual row geometry, including independent changes to the visible label. */
function resizeRow(width: number) {
  rowWidth = width;
  act(() => resize());
}

/** Return the current page's scene identities independently of card text. */
function visibleIds() {
  return [...container.querySelectorAll<HTMLElement>('[data-scene-id][data-visible="true"]')].map((element) => element.dataset.sceneId);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  rowWidth = 366;
  labelWidth = 72;
  labelVisible = false;
  observed.mockClear();
  disconnected.mockClear();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.classList.contains('dashboard-scenes-label') ? labelWidth : rowWidth;
    return { width } as DOMRect;
  });
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => ({
    columnGap: '6px',
    display: element.classList.contains('dashboard-scenes-label') && !labelVisible ? 'none' : 'flex',
    visibility: 'visible',
    /** Supply the same layout tokens used by the dashboard stylesheet. */
    getPropertyValue(property: string) {
      return ({ '--scene-card-min-width': '144px', '--scene-card-gap': '6px' } as Record<string, string>)[property] ?? '';
    },
  }) as CSSStyleDeclaration);
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

describe('responsive dashboard scene pages', () => {
  it.each([
    [280, 7, 1, 7], [296, 0, 1, 1], [296, 1, 1, 1], [296, 4, 2, 2], [296, 5, 2, 3], [296, 7, 2, 4],
    [366, 4, 2, 2], [366, 5, 2, 3], [366, 7, 2, 4],
    [458, 4, 3, 2], [458, 5, 3, 2], [458, 7, 3, 3], [744, 7, 4, 2],
  ])('fits %s pixels and %s scenes into %s-card pages', (width, total, capacity, pages) => {
    rowWidth = width;
    renderScenes(scenes.slice(0, total));
    expect(pagination.pageSize).toBe(capacity);
    expect(pagination.pageCount).toBe(pages);
    expect(pagination.page).toBe(0);
    expect(visibleIds()).toHaveLength(Math.min(total, capacity));
  });

  it('reserves only a visible label and responds when that label changes width', () => {
    rowWidth = 640;
    renderScenes();
    expect(pagination.pageSize).toBe(4);
    labelVisible = true;
    resizeRow(640);
    expect(pagination.pageSize).toBe(3);
    labelWidth = 260;
    resizeRow(640);
    expect(pagination.pageSize).toBe(2);
    labelVisible = false;
    resizeRow(640);
    expect(pagination.pageSize).toBe(4);
    expect(observed).toHaveBeenCalledWith(container.querySelector('section'));
    expect(observed).toHaveBeenCalledWith(container.querySelector('.dashboard-scenes-label'));
  });

  it('reaches the final scene and preserves its identity when the row expands or shrinks', () => {
    renderScenes();
    act(() => pagination.goToPage(99));
    expect(pagination.page).toBe(3);
    expect(visibleIds()).toEqual(['scene-6']);
    resizeRow(744);
    expect(pagination.page).toBe(1);
    expect(visibleIds()).toContain('scene-6');
    resizeRow(280);
    expect(pagination.page).toBe(6);
    expect(visibleIds()).toEqual(['scene-6']);
    act(() => pagination.goToPage(-1));
    expect(visibleIds()).toEqual(['scene-0']);
  });

  it('follows the current scene through reordering and clamps near its new index after deletion', () => {
    renderScenes();
    act(() => pagination.goToPage(3));
    const reordered = [scenes[0], scenes[1], scenes[6], scenes[2], scenes[3], scenes[4], scenes[5]];
    renderScenes(reordered);
    expect(pagination.page).toBe(1);
    expect(visibleIds()).toContain('scene-6');
    renderScenes(reordered.filter((scene) => scene.id !== 'scene-6'));
    expect(pagination.page).toBe(1);
    expect(visibleIds()).toContain('scene-2');
  });

  it('clamps a deleted final page and recovers after the collection becomes empty', () => {
    renderScenes();
    act(() => pagination.goToPage(3));
    renderScenes(scenes.slice(0, 5));
    expect(pagination.page).toBe(2);
    expect(visibleIds()).toEqual(['scene-4']);
    renderScenes([]);
    expect(pagination.page).toBe(0);
    expect(pagination.pageCount).toBe(1);
    expect(pagination.pageSize).toBe(1);
    renderScenes(scenes.slice(0, 1));
    expect(visibleIds()).toEqual(['scene-0']);
  });

  it('prefers a focused scene over the page anchor through resizing and reordering', () => {
    rowWidth = 744;
    renderScenes();
    const focused = container.querySelector<HTMLButtonElement>('[data-scene-id="scene-3"]')!;
    act(() => focused.focus());
    resizeRow(280);
    expect(visibleIds()).toEqual(['scene-3']);
    expect(document.activeElement).toBe(focused);
    const reordered = [scenes[3], ...scenes.filter((scene) => scene.id !== 'scene-3')];
    renderScenes(reordered);
    expect(pagination.page).toBe(0);
    expect(visibleIds()).toEqual(['scene-3']);
    expect(document.activeElement).toBe(focused);
    expect(focused.isConnected).toBe(true);
  });

  it('ignores focus outside the row and retains valid geometry while hidden', () => {
    renderScenes();
    act(() => pagination.goToPage(2));
    const outside = document.createElement('button');
    outside.dataset.sceneId = 'scene-0';
    document.body.append(outside);
    act(() => outside.focus());
    resizeRow(0);
    expect(pagination.pageSize).toBe(2);
    expect(visibleIds()).toEqual(['scene-4', 'scene-5']);
    resizeRow(280);
    expect(visibleIds()).toEqual(['scene-4']);
    outside.remove();
    act(() => root.render(null));
    expect(disconnected).toHaveBeenCalled();
  });

  it('tracks inventory changes while hidden without losing the latest anchor position', () => {
    renderScenes();
    act(() => pagination.goToPage(3));
    resizeRow(0);
    const reordered = [scenes[0], scenes[1], scenes[6], scenes[2], scenes[3], scenes[4], scenes[5]];
    renderScenes(reordered);
    renderScenes(reordered.filter((scene) => scene.id !== 'scene-6'));
    expect(pagination.page).toBe(1);
    expect(visibleIds()).toContain('scene-2');
    renderScenes([]);
    expect(pagination.pageSize).toBe(1);
    expect(pagination.page).toBe(0);
  });
});
