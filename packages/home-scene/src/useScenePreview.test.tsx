// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScenePreview } from './useScenePreview';
import { ScenePreviewToolbar } from './ScenePreviewToolbar';
import { SCENE_PREVIEW_CHANNEL, scenePreviewCommandMessage, type ScenePreviewPayload } from './scenePreviewProtocol';
import { SCENE_PRESENTATION_CHANNEL, scenePresentationMessage } from './scenePresentation';
import { useHomeStore, createDefaultState } from './state';
import { FULL_SCENE_ACCESS } from './sceneAccess';
import { useScenePreviewStore } from './scenePreviewStore';
import { useSceneCatalog } from './useSceneCatalog';
import { SCENE_CATALOG_CHANNEL } from './sceneCatalogProtocol';

vi.mock('./embeddedHost', () => ({ isEmbeddedScene: () => true }));
const postMessage = vi.fn();
let root: Root;
let container: HTMLElement;

/** Mount transport plus actual controls without the expensive WebGL renderer. */
function Probe({ ready = true, hostSuspended = false, unavailable = false }: { ready?: boolean; hostSuspended?: boolean; unavailable?: boolean }) {
  useScenePreview({ ready, hostSuspended, unavailable });
  return <ScenePreviewToolbar />;
}

/** Exercise the existing host-run transport independently of DOM inert support. */
function CatalogProbe() {
  const { runScene } = useSceneCatalog();
  return <button data-run-scene onClick={() => runScene('scene-evening')}>Run saved scene</button>;
}

/** Use the native injection channel with the current before value rather than a fake command bridge. */
function send(id: number): void {
  const state = useHomeStore.getState().deviceStates['living-light'];
  const preview: ScenePreviewPayload = { title: 'Living room evening', expiresAt: Date.now() + 30_000,
    actions: [{ deviceId: 'living-light', values: { isOn: true, brightness: 20 }, baseline: { isOn: state.on, brightness: state.level } }] };
  window.dispatchEvent(new CustomEvent(SCENE_PREVIEW_CHANNEL, { detail: scenePreviewCommandMessage(id, preview) }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ReactNativeWebView', { postMessage });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  useScenePreviewStore.setState({ active: null, comparison: 'proposed' });
  useHomeStore.setState({ ...createDefaultState(), access: FULL_SCENE_ACCESS });
  postMessage.mockReset();
  container = document.createElement('main'); document.body.append(container); root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('3D preview host lifecycle and comparison controls', () => {
  it('blocks embedded saved-scene Run even for a direct click, then restores it after Exit', () => {
    act(() => root.render(<><Probe /><CatalogProbe /></>));
    act(() => window.dispatchEvent(new CustomEvent(SCENE_CATALOG_CHANNEL, { detail: {
      channel: SCENE_CATALOG_CHANNEL, version: 1, type: 'catalog', catalog: { activeSceneId: null,
        scenes: [{ id: 'scene-evening', name: 'Evening', scope: 'Living room', deviceCount: 1 }] },
    } })));
    act(() => send(1));
    postMessage.mockClear();
    const run = container.querySelector<HTMLButtonElement>('[data-run-scene]')!;
    act(() => run.click()); expect(postMessage).not.toHaveBeenCalled();
    act(() => [...container.querySelectorAll('button')].find((button) => button.textContent === 'Exit preview')!.click());
    act(() => run.click());
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ channel: SCENE_CATALOG_CHANNEL, type: 'run', sceneId: 'scene-evening' });
  });

  it('shows a persistent honest badge and accessible comparison actions without canonical updates or patches', () => {
    const source = useHomeStore.getState();
    const subscriber = vi.fn(); const stop = useHomeStore.subscribe(subscriber);
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');
    act(() => root.render(<Probe />));
    act(() => send(1));
    expect(container.textContent).toContain('Preview · no device changes');
    expect(container.textContent).toContain('Living room evening');
    expect(document.activeElement).toBe(container.querySelector('section'));
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Current', 'Proposed', 'Exit preview']);
    act(() => buttons[0].click()); expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    act(() => buttons[1].click()); expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    act(() => buttons[2].click()); expect(container.querySelector('section')).toBeNull();
    expect(postMessage.mock.calls.map(([value]) => JSON.parse(value).type).every((type) => type === 'status' || type === 'selection')).toBe(true);
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ id: 1, status: 'closed' });
    expect(useHomeStore.getState()).toBe(source); expect(subscriber).not.toHaveBeenCalled(); expect(localWrite).not.toHaveBeenCalled(); stop();
  });

  it('reports only authorized selected room identifiers, clearing layout-only context', () => {
    act(() => root.render(<Probe ready={false} />));
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ type: 'selection', modelRoomId: null });
    act(() => root.render(<Probe />));
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ type: 'selection', modelRoomId: 'living' });
    act(() => useHomeStore.setState({ roomId: 'master', access: { ...FULL_SCENE_ACCESS, fullHome: false, roomIds: ['living'] } }));
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toEqual({ channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'selection', modelRoomId: null });
  });

  it('consumes suspend/resume synchronously and does not replay covered requests', () => {
    act(() => root.render(<Probe />)); act(() => send(1));
    act(() => {
      window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(true) }));
      send(2);
    });
    expect(useScenePreviewStore.getState().active).toBeNull();
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ id: 2, status: 'invalid' });
    act(() => {
      window.dispatchEvent(new CustomEvent(SCENE_PRESENTATION_CHANNEL, { detail: scenePresentationMessage(false) }));
      send(2);
    });
    expect(useScenePreviewStore.getState().active).toBeNull();
    act(() => send(3)); expect(useScenePreviewStore.getState().active?.id).toBe(3);
    act(() => root.render(<Probe unavailable />)); expect(useScenePreviewStore.getState().active).toBeNull();
  });

  it('clears on document backgrounding and expiry, and cleans all timers on unmount', () => {
    vi.useFakeTimers(); act(() => root.render(<Probe />)); act(() => send(1));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(useScenePreviewStore.getState().active).toBeNull();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    act(() => send(2)); act(() => vi.advanceTimersByTime(30_000));
    expect(useScenePreviewStore.getState().active).toBeNull();
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ id: 2, status: 'expired' });
    act(() => send(3)); act(() => root.render(null));
    expect(useScenePreviewStore.getState().active).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
});
