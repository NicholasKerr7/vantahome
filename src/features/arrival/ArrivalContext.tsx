import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type ArrivalSceneStatus = 'loading' | 'ready' | 'error' | 'available';
type SceneArrival = { status: ArrivalSceneStatus; openControls: () => void };
type ArrivalLease = { publish: (scene: SceneArrival) => void; release: () => void };
type ArrivalContextValue = { register: () => ArrivalLease };
type SceneSnapshot = SceneArrival & { scope: string; lease: symbol };

export const ArrivalContext = createContext<ArrivalContextValue | null>(null);

/** Scope renderer readiness to both the current account/home and its mounted renderer. */
export function useArrivalCoordinator(scope: string) {
  const currentLease = useRef<symbol | null>(null);
  const [snapshot, setSnapshot] = useState<SceneSnapshot | null>(null);
  const [dismissedLease, setDismissedLease] = useState<symbol | null>(null);
  const register = useCallback((): ArrivalLease => {
    const lease = Symbol('arrival-renderer');
    currentLease.current = lease;
    return {
      publish: (scene) => {
        if (currentLease.current === lease) setSnapshot({ ...scene, scope, lease });
      },
      release: () => {
        if (currentLease.current !== lease) return;
        currentLease.current = null;
        setSnapshot(null);
      },
    };
  }, [scope]);
  const context = useMemo(() => ({ register }), [register]);
  const scene = snapshot?.scope === scope ? snapshot : null;
  /** Reveal verified controls without pretending an unfinished scene has rendered. */
  const showControls = useCallback(() => {
    if (!scene || scene.status !== 'loading' || currentLease.current !== scene.lease) return;
    setDismissedLease(scene.lease);
    scene.openControls();
  }, [scene]);
  return { context, scene, dismissed: Boolean(scene && dismissedLease === scene.lease), showControls };
}

/** Publish only the focused renderer; old mounts cannot reveal a replacement home. */
export function useSceneArrival(status: ArrivalSceneStatus, rendererKey: string, focused: boolean, openControls: () => void): boolean {
  const context = useContext(ArrivalContext);
  const lease = useRef<ArrivalLease | null>(null);
  useLayoutEffect(() => {
    if (!context || !focused) return;
    const current = context.register();
    lease.current = current;
    return () => { current.release(); if (lease.current === current) lease.current = null; };
  }, [context, rendererKey, focused]);
  useLayoutEffect(() => {
    if (focused) lease.current?.publish({ status, openControls });
  }, [context, rendererKey, focused, status, openControls]);
  return Boolean(context);
}
