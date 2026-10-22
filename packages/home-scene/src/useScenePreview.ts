import { useEffect, useLayoutEffect, useRef } from 'react';
import { isEmbeddedScene } from './embeddedHost';
import { canViewSceneRoom } from './sceneAccess';
import { useHomeStore } from './state';
import { subscribeScenePresentation } from './scenePresentation';
import { createScenePreviewClient } from './scenePreviewClient';
import { reportScenePreview, SCENE_PREVIEW_CHANNEL, subscribeScenePreviewCommands } from './scenePreviewProtocol';

interface ScenePreviewOptions { ready: boolean; hostSuspended: boolean; unavailable: boolean }

/** Bind isolated preview lifecycle to the existing renderer without adding a canonical write pathway. */
export function useScenePreview(options: ScenePreviewOptions): void {
  const current = useRef(options);
  current.current = options;
  const suspended = useRef(options.hostSuspended);
  suspended.current = options.hostSuspended;
  const client = useRef<ReturnType<typeof createScenePreviewClient> | null>(null);
  const reportSelection = useRef<() => void>(() => undefined);

  // Layout cleanup prevents a frame of old preview values after a local covering panel opens.
  useLayoutEffect(() => { client.current?.refresh(); }, [options.ready, options.hostSuspended, options.unavailable]);
  useEffect(() => {
    if (!isEmbeddedScene()) return;
    const instance = createScenePreviewClient({
      getState: useHomeStore.getState, subscribe: useHomeStore.subscribe,
      available: () => current.current.ready && !suspended.current && !current.current.unavailable && !document.hidden,
      send: (report) => reportScenePreview(window, report),
    });
    client.current = instance;
    const stopCommands = subscribeScenePreviewCommands(window, instance.receive);
    // Consume presentation changes before React commits, so a background message cannot start a preview.
    const stopPresentation = subscribeScenePresentation(window, (value) => { suspended.current = value; instance.refresh(); });
    document.addEventListener('visibilitychange', instance.refresh);
    /** Report only an actually assigned selected room; layout sharing never supplies assistant context. */
    function selection(): void {
      const state = useHomeStore.getState();
      const modelRoomId = current.current.ready && canViewSceneRoom(state.access, state.roomId) ? state.roomId : null;
      if (modelRoomId === previousRoom) return;
      previousRoom = modelRoomId;
      reportScenePreview(window, { channel: SCENE_PREVIEW_CHANNEL, version: 1, type: 'selection', modelRoomId });
    }
    let previousRoom: string | null | undefined;
    reportSelection.current = selection;
    const stopSelection = useHomeStore.subscribe(selection);
    selection();
    /** Toolbar requests share the lifecycle owner rather than editing either scene state map. */
    function toolbar(event: Event): void {
      const action = (event as CustomEvent<unknown>).detail;
      if (action === 'exit') instance.close();
      else if (action === 'current' || action === 'proposed') instance.compare(action);
    }
    window.addEventListener('vantahome-preview-toolbar', toolbar);
    return () => {
      stopCommands(); stopPresentation(); stopSelection();
      document.removeEventListener('visibilitychange', instance.refresh);
      window.removeEventListener('vantahome-preview-toolbar', toolbar);
      instance.dispose(); client.current = null; reportSelection.current = () => undefined;
    };
  }, []);
  // Hydration can finish without changing the canonical store a second time.
  useEffect(() => { reportSelection.current(); }, [options.ready]);
}
