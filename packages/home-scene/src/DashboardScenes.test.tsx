// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardScenes } from "./DashboardChrome";
import type { SceneCatalog } from "./sceneCatalogProtocol";
import { sceneArtwork } from './cinematicArtwork';
import { useHomeStore } from './state';

const shared = vi.hoisted(() => ({
  catalog: { scenes: [], activeSceneId: null } as SceneCatalog,
  status: "ready" as "ready" | "loading" | "error",
  runScene: vi.fn(),
}));
vi.mock("./useSceneCatalog", () => ({
  useSceneCatalog: () => ({ ...shared, retry: vi.fn() }),
}));

/** Create distinct saved identities so paging assertions do not rely on display text. */
function savedScenes(count: number): SceneCatalog['scenes'] {
  return Array.from({ length: count }, (_, index) => ({
    id: `scene-${index}`,
    name: `Saved scene ${index}`,
    scope: 'Whole home',
    deviceCount: 1,
  }));
}

beforeEach(() => {
  shared.catalog = { scenes: [], activeSceneId: null };
  shared.status = 'ready';
  shared.runScene.mockClear();
});

describe("saved scene shortcuts", () => {
  it("shows native custom names and active identity without adding a second hardcoded collection", () => {
    shared.catalog = {
      scenes: [
        {
          id: "custom",
          name: "Quiet evening",
          scope: "Whole home",
          deviceCount: 3,
        },
      ],
      activeSceneId: "custom",
    };
    const markup = renderToStaticMarkup(<DashboardScenes />);
    expect(markup).toContain("Quiet evening");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain(`data-artwork="${sceneArtwork({ name: 'Quiet evening' })}"`);
    expect(markup).not.toContain("Morning");
    expect(markup).not.toContain("Movie time");
  });

  it("starts with one reachable scene until the row can be measured", () => {
    shared.catalog.scenes = savedScenes(7);
    const markup = renderToStaticMarkup(<DashboardScenes />);
    expect(markup).not.toContain("Previous scenes");
    expect(markup).not.toContain("Next scenes");
    expect(markup).toContain("Scene page 1 of 7");
    const document = new DOMParser().parseFromString(markup, 'text/html');
    expect(document.querySelectorAll('.card-scroll-item:not([inert]) button')).toHaveLength(1);
    expect(document.querySelector('.card-scroll-item[inert] button')?.textContent).toContain('Saved scene 1');
    expect(document.querySelectorAll('[data-artwork]')).toHaveLength(2);
    const describedBy = document.querySelector('[data-scene-id]')?.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toContain('Left and Right arrow keys');
  });

  it('retains the authored preset artwork when its display name changes', () => {
    shared.catalog.scenes = [{ id: 'model-scene:night', name: 'Morning ritual', scope: 'Whole home', deviceCount: 3 }];
    const markup = renderToStaticMarkup(<DashboardScenes />);
    expect(markup).toContain('Morning ritual');
    expect(markup).toContain('data-artwork="mood-night"');
  });

  it("distinguishes loading, empty and failed catalog states", () => {
    expect(renderToStaticMarkup(<DashboardScenes />)).toContain(
      "No saved scenes",
    );
    shared.status = "loading";
    expect(renderToStaticMarkup(<DashboardScenes />)).toContain(
      "Loading scenes",
    );
    shared.status = "error";
    expect(renderToStaticMarkup(<DashboardScenes />)).toContain("Retry scenes");
  });
});

describe('measured scene shortcut navigation', () => {
  let container: HTMLDivElement;
  let root: Root;
  let rowWidth: number;
  const observers = new Set<TestResizeObserver>();
  /** Model native scroll positioning while retaining the requested motion behavior. */
  const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) { this.scrollLeft = options.left ?? 0; });

  /** Retain independent row and scroller observations through rerenders and cleanup. */
  class TestResizeObserver {
    /** Register each observer so a resize reaches both real hooks. */
    constructor(readonly callback: () => void) { observers.add(this); }
    /** Geometry is supplied by the browserless fixture for every observed element. */
    observe() {}
    /** Prevent stale observations from surviving a component cleanup. */
    disconnect() { observers.delete(this); }
  }

  /** Mount the production component without mocking its paging or scrolling hooks. */
  function renderScenes() {
    act(() => root.render(<DashboardScenes />));
    return container.querySelector<HTMLDivElement>('[data-card-scroller]')!;
  }

  /** Return only scene actions reachable on the current page. */
  function visibleSceneIds() {
    return [...container.querySelectorAll<HTMLElement>('.card-scroll-item:not([inert]) [data-scene-id]')]
      .map((button) => button.dataset.sceneId);
  }

  /** Send browser keyboard input to the focused scene, retaining native default behavior. */
  function pressKey(key: string, options: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options });
    act(() => document.activeElement?.dispatchEvent(event));
    return event;
  }

  /** Begin keyboard browsing from the current page's first reachable scene. */
  function focusFirstScene() {
    const first = container.querySelector<HTMLButtonElement>('.card-scroll-item:not([inert]) [data-scene-id]')!;
    act(() => first.focus());
    return first;
  }

  /** Scroll with native horizontal input and allow the same momentum tail as the browser. */
  function scrollToPage(track: HTMLElement, page: number) {
    act(() => {
      track.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 44 }));
      track.scrollLeft = (rowWidth + 6) * page;
      track.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(220);
    });
  }

  /** Resize the full scene row and notify both capacity and scroll measurements. */
  function resizeRow(width: number) {
    rowWidth = width;
    act(() => { for (const observer of [...observers]) observer.callback(); });
  }

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    rowWidth = 366;
    scrollTo.mockClear();
    shared.catalog.scenes = savedScenes(7);
    useHomeStore.setState({ motionDisabled: false });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: rowWidth } as DOMRect));
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => ({
      columnGap: '6px',
      display: element.classList.contains('dashboard-scenes-label') ? 'none' : 'flex',
      visibility: 'visible',
      /** Mirror the production sizing tokens while jsdom supplies no CSS layout. */
      getPropertyValue(property: string) {
        return ({ '--scene-card-min-width': '144px', '--scene-card-gap': '6px' } as Record<string, string>)[property] ?? '';
      },
    }) as CSSStyleDeclaration);
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
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

  it.each([[280, 1, 7], [296, 2, 4], [366, 2, 4], [744, 4, 2]])('fits a %s-pixel row into %s-card pages and reaches every scene by keyboard', (width, pageSize, pageCount) => {
    rowWidth = width;
    const track = renderScenes();
    expect(track.dataset.pageSize).toBe(String(pageSize));
    expect(track.dataset.cardCount).toBe(String(pageCount));
    expect(visibleSceneIds()).toEqual(savedScenes(pageSize).map((scene) => scene.id));
    expect(container.querySelector('.dashboard-scene-page')).toBeNull();
    expect(container.querySelector('button[aria-label="Previous scenes"], button[aria-label="Next scenes"]')).toBeNull();
    focusFirstScene();

    for (let index = 1; index < shared.catalog.scenes.length; index += 1) {
      expect(pressKey('ArrowRight').defaultPrevented).toBe(true);
      expect((document.activeElement as HTMLElement).dataset.sceneId).toBe(`scene-${index}`);
      expect(document.activeElement?.closest('[inert]')).toBeNull();
    }
    const finalStart = (pageCount - 1) * pageSize;
    expect(visibleSceneIds()).toEqual(shared.catalog.scenes.slice(finalStart).map((scene) => scene.id));
    expect(track.dataset.cardPage).toBe(String(pageCount - 1));
    expect(container.querySelector('[role="status"]')?.textContent).toBe(`Scene page ${pageCount} of ${pageCount}`);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: (width + 6) * (pageCount - 1), behavior: 'smooth' });
    expect(shared.runScene).not.toHaveBeenCalled();

    pressKey('Home');
    expect((document.activeElement as HTMLElement).dataset.sceneId).toBe('scene-0');
    expect(track.dataset.cardPage).toBe('0');
    pressKey('ArrowLeft');
    expect((document.activeElement as HTMLElement).dataset.sceneId).toBe('scene-0');
    pressKey('End');
    expect((document.activeElement as HTMLElement).dataset.sceneId).toBe('scene-6');
    pressKey('ArrowRight');
    expect((document.activeElement as HTMLElement).dataset.sceneId).toBe('scene-6');
    pressKey('ArrowLeft');
    expect((document.activeElement as HTMLElement).dataset.sceneId).toBe('scene-5');
  });

  it('retains the focused scene DOM node when resizing changes its page', () => {
    rowWidth = 744;
    const track = renderScenes();
    const focused = container.querySelector<HTMLButtonElement>('[data-scene-id="scene-3"]')!;
    act(() => focused.focus());
    resizeRow(366);
    expect(track.dataset.pageSize).toBe('2');
    expect(track.dataset.cardPage).toBe('1');
    expect(visibleSceneIds()).toEqual(['scene-2', 'scene-3']);
    expect(document.activeElement).toBe(focused);
    expect(focused.isConnected).toBe(true);
    expect(focused.closest('[inert]')).toBeNull();

    resizeRow(280);
    expect(visibleSceneIds()).toEqual(['scene-3']);
    expect(track.dataset.cardPage).toBe('3');
    expect(document.activeElement).toBe(focused);
    expect(shared.runScene).not.toHaveBeenCalled();
  });

  it('retains the focused scene when a catalog reorder moves it beyond the mounted neighboring page', () => {
    const track = renderScenes();
    const focused = container.querySelector<HTMLButtonElement>('[data-scene-id="scene-1"]')!;
    expect(visibleSceneIds()).toEqual(['scene-0', 'scene-1']);
    act(() => focused.focus());
    const scenes = shared.catalog.scenes;
    shared.catalog.scenes = [scenes[0], ...scenes.slice(2), scenes[1]];
    renderScenes();

    expect(track.dataset.cardPage).toBe('3');
    expect(visibleSceneIds()).toEqual(['scene-1']);
    expect(document.activeElement).toBe(focused);
    expect(focused.isConnected).toBe(true);
    expect(container.querySelector('[data-scene-id="scene-1"]')).toBe(focused);
    expect(focused.closest('[inert]')).toBeNull();
    expect(shared.runScene).not.toHaveBeenCalled();
  });

  it('leaves Tab, activation keys and modified shortcuts native and does not reclaim outside focus', () => {
    renderScenes();
    const first = focusFirstScene();
    for (const key of ['Tab', 'Enter', ' ', 'ArrowUp', 'ArrowDown']) expect(pressKey(key).defaultPrevented).toBe(false);
    expect(pressKey('Tab', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(pressKey('ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
    const outside = document.createElement('button');
    document.body.append(outside);
    act(() => outside.focus());
    shared.catalog.scenes = shared.catalog.scenes.slice(1);
    renderScenes();
    expect(document.activeElement).toBe(outside);
    expect(shared.runScene).not.toHaveBeenCalled();
    outside.remove();
  });

  it('reaches all pages through native horizontal scrolling and blocks the trailing drag click', () => {
    vi.useFakeTimers();
    const track = renderScenes();
    const first = focusFirstScene();
    for (let page = 1; page < 4; page += 1) {
      scrollToPage(track, page);
      expect(track.dataset.cardPage).toBe(String(page));
      expect(visibleSceneIds()).toContain(`scene-${page * 2}`);
    }
    expect(first.isConnected).toBe(false);
    expect(shared.runScene).not.toHaveBeenCalled();
    const last = container.querySelector<HTMLButtonElement>('[data-scene-id="scene-6"]')!;
    act(() => last.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    expect(shared.runScene).not.toHaveBeenCalled();
    act(() => {
      last.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      last.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    expect(shared.runScene).toHaveBeenCalledExactlyOnceWith('scene-6');
  });

  it('cancels stale momentum after a keyboard jump and honors reduced motion', () => {
    vi.useFakeTimers();
    useHomeStore.setState({ motionDisabled: true });
    const track = renderScenes();
    focusFirstScene();
    act(() => track.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 44 })));
    pressKey('End');
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 3 * (rowWidth + 6), behavior: 'auto' });
    act(() => vi.advanceTimersByTime(220));
    expect(track.dataset.cardPage).toBe('3');
    expect((document.activeElement as HTMLElement).dataset.sceneId).toBe('scene-6');
    expect(document.activeElement?.closest('[inert]')).toBeNull();
    expect(shared.runScene).not.toHaveBeenCalled();
  });

  it('clamps a removed final page to reachable scenes and recovers from an empty catalog', () => {
    const track = renderScenes();
    focusFirstScene();
    pressKey('End');
    expect(visibleSceneIds()).toEqual(['scene-6']);
    shared.catalog.scenes = savedScenes(4);
    renderScenes();
    expect(track.dataset.cardPage).toBe('1');
    expect(visibleSceneIds()).toEqual(['scene-2', 'scene-3']);
    expect((document.activeElement as HTMLElement).dataset.sceneId).toBe('scene-3');

    shared.catalog.scenes = savedScenes(1);
    renderScenes();
    expect(visibleSceneIds()).toEqual(['scene-0']);
    expect((document.activeElement as HTMLElement).dataset.sceneId).toBe('scene-0');
    expect(container.querySelector('.dashboard-scene-page')).toBeNull();
    shared.catalog.scenes = [];
    renderScenes();
    expect(container.textContent).toContain('No saved scenes');
    expect(document.activeElement).toBe(container.querySelector('.dashboard-scenes'));
    shared.catalog.scenes = savedScenes(7);
    renderScenes();
    expect(visibleSceneIds()).toEqual(['scene-0', 'scene-1']);
    expect(shared.runScene).not.toHaveBeenCalled();
  });

  it('runs a scene once only after its explicit card click', () => {
    renderScenes();
    focusFirstScene();
    pressKey('ArrowRight');
    pressKey('ArrowRight');
    expect(shared.runScene).not.toHaveBeenCalled();
    const card = container.querySelector<HTMLButtonElement>('.card-scroll-item:not([inert]) [data-scene-id="scene-2"]')!;
    act(() => card.click());
    expect(shared.runScene).toHaveBeenCalledExactlyOnceWith('scene-2');
  });
});
