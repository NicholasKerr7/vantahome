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
    expect(markup).toContain("Previous scenes");
    expect(markup).toContain("Next scenes");
    expect(markup).toContain("Scene page 1 of 7");
    const document = new DOMParser().parseFromString(markup, 'text/html');
    expect(document.querySelectorAll('.card-scroll-item:not([inert]) button')).toHaveLength(1);
    expect(document.querySelector('.card-scroll-item[inert] button')?.textContent).toContain('Saved scene 1');
    expect(document.querySelectorAll('[data-artwork]')).toHaveLength(2);
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

  /** Use the same labeled controls exposed to assistive technology. */
  function pageButton(direction: 'Previous' | 'Next') {
    return container.querySelector<HTMLButtonElement>(`[aria-label="${direction} scenes"]`)!;
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
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const arrowSpace = this.closest('.dashboard-scenes')?.querySelectorAll('.dashboard-scene-page').length ? 100 : 0;
      const width = this.classList.contains('preset-grid') ? rowWidth - arrowSpace : rowWidth;
      return { width } as DOMRect;
    });
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => ({
      columnGap: '6px',
      display: element.classList.contains('dashboard-scenes-label') ? 'none' : 'flex',
      visibility: 'visible',
      /** Mirror the production sizing tokens while jsdom supplies no CSS layout. */
      getPropertyValue(property: string) {
        return ({ '--scene-card-min-width': '110px', '--scene-card-gap': '6px', '--scene-page-width': '44px' } as Record<string, string>)[property] ?? '';
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
  });

  it.each([[296, 1, 7], [366, 2, 4], [744, 4, 2]])('fits a %s-pixel row into %s-card pages and reaches the final scene', (width, pageSize, pageCount) => {
    rowWidth = width;
    const track = renderScenes();
    expect(track.dataset.pageSize).toBe(String(pageSize));
    expect(track.dataset.cardCount).toBe(String(pageCount));
    expect(visibleSceneIds()).toEqual(savedScenes(pageSize).map((scene) => scene.id));
    expect(pageButton('Previous').disabled).toBe(true);
    expect(pageButton('Next').disabled).toBe(false);

    for (let page = 1; page < pageCount; page += 1) act(() => pageButton('Next').click());
    const finalStart = (pageCount - 1) * pageSize;
    expect(visibleSceneIds()).toEqual(shared.catalog.scenes.slice(finalStart).map((scene) => scene.id));
    expect(track.dataset.cardPage).toBe(String(pageCount - 1));
    expect(container.querySelector('[role="status"]')?.textContent).toBe(`Scene page ${pageCount} of ${pageCount}`);
    expect(pageButton('Next').disabled).toBe(true);
    expect(pageButton('Previous').disabled).toBe(false);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: (width - 100 + 6) * (pageCount - 1), behavior: 'smooth' });
    expect(shared.runScene).not.toHaveBeenCalled();

    act(() => pageButton('Previous').click());
    expect(track.dataset.cardPage).toBe(String(pageCount - 2));
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

    resizeRow(296);
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

  it('clamps a removed final page to reachable scenes and recovers from an empty catalog', () => {
    const track = renderScenes();
    for (let page = 1; page < 4; page += 1) act(() => pageButton('Next').click());
    expect(visibleSceneIds()).toEqual(['scene-6']);
    shared.catalog.scenes = savedScenes(4);
    renderScenes();
    expect(track.dataset.cardPage).toBe('1');
    expect(visibleSceneIds()).toEqual(['scene-2', 'scene-3']);
    expect(pageButton('Next').disabled).toBe(true);

    shared.catalog.scenes = savedScenes(1);
    renderScenes();
    expect(visibleSceneIds()).toEqual(['scene-0']);
    expect(container.querySelector('.dashboard-scene-page')).toBeNull();
    shared.catalog.scenes = [];
    renderScenes();
    expect(container.textContent).toContain('No saved scenes');
    shared.catalog.scenes = savedScenes(7);
    renderScenes();
    expect(visibleSceneIds()).toEqual(['scene-0', 'scene-1']);
    expect(shared.runScene).not.toHaveBeenCalled();
  });

  it('runs a scene once only after its explicit card click', () => {
    renderScenes();
    act(() => pageButton('Next').click());
    expect(shared.runScene).not.toHaveBeenCalled();
    const card = container.querySelector<HTMLButtonElement>('.card-scroll-item:not([inert]) [data-scene-id="scene-2"]')!;
    act(() => card.click());
    expect(shared.runScene).toHaveBeenCalledExactlyOnceWith('scene-2');
  });
});
