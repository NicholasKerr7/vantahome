import { useLayoutEffect, useRef } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import type { Object3D } from 'three';

/** Acknowledge this authorized model only after its renderer completes a frame. */
export function useSceneFrameReady(preparedScene: Object3D, onReady: () => void): void {
  const renderer = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const pendingFrame = useRef<number | null>(null);
  const awaitingFrame = useRef(false);

  useLayoutEffect(() => {
    let current = true;
    pendingFrame.current = null;
    awaitingFrame.current = true;
    const unsubscribe = addAfterEffect(() => {
      if (!current || !awaitingFrame.current || document.hidden || pendingFrame.current === null) return;
      // Global after-effects also run for other canvases. Require this renderer
      // to advance after its own useFrame, including when it renders on demand.
      if (renderer.info.render.frame <= pendingFrame.current) return;
      awaitingFrame.current = false;
      pendingFrame.current = null;
      unsubscribe();
      onReady();
    });
    invalidate();
    return () => {
      current = false;
      awaitingFrame.current = false;
      pendingFrame.current = null;
      unsubscribe();
    };
  }, [invalidate, onReady, preparedScene, renderer]);

  useFrame(() => {
    if (awaitingFrame.current && !document.hidden) pendingFrame.current = renderer.info.render.frame;
  });
}
