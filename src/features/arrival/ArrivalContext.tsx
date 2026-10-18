import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type ArrivalSceneStatus = 'loading' | 'ready' | 'error' | 'available';
type SceneArrival = { status: ArrivalSceneStatus; openControls: () => void };
type ArrivalLease = { publish: (scene: SceneArrival) => void; release: () => void };
type ArrivalContextValue = { register: () => ArrivalLease; initialArrivalComplete: boolean };
type SceneSnapshot = SceneArrival & { scope: string; generation: symbol; lease: symbol };
type ArrivalCompletion = { scope: string; generation: symbol; complete: boolean };

export const ArrivalContext = createContext<ArrivalContextValue | null>(null);

/** Scope renderer readiness to both the current account/home and its mounted renderer. */
export function useArrivalCoordinator(scope: string) {
  const currentLease = useRef<symbol | null>(null);
  const [snapshot, setSnapshot] = useState<SceneSnapshot | null>(null);
  const [dismissedLease, setDismissedLease] = useState<symbol | null>(null);
  const [completion, setCompletion] = useState<ArrivalCompletion>(() => ({ scope, generation: Symbol('arrival-scope'), complete: false }));
  // Completion describes only this admission. Returning to an earlier account or
  // household after a scope change must prepare its own initial arrival again.
  if (completion.scope !== scope) setCompletion({ scope, generation: Symbol('arrival-scope'), complete: false });
  const initialArrivalComplete = completion.scope === scope && completion.complete;
  const generation = completion.generation;
  const register = useCallback((): ArrivalLease => {
    const lease = Symbol('arrival-renderer');
    currentLease.current = lease;
    return {
      publish: (scene) => {
        if (currentLease.current !== lease) return;
        setSnapshot({ ...scene, scope, generation, lease });
        if (scene.status === 'ready' || scene.status === 'available') {
          setCompletion((current) => current.scope === scope && current.generation === generation && !current.complete
            ? { ...current, complete: true } : current);
        }
      },
      release: () => {
        if (currentLease.current !== lease) return;
        currentLease.current = null;
        setSnapshot(null);
      },
    };
  }, [scope, generation]);
  const context = useMemo(() => ({ register, initialArrivalComplete }), [register, initialArrivalComplete]);
  const scene = snapshot?.scope === scope && snapshot.generation === generation ? snapshot : null;
  /** Reveal verified controls without pretending an unfinished scene has rendered. */
  const showControls = useCallback(() => {
    if (!scene || scene.status !== 'loading' || currentLease.current !== scene.lease) return;
    setDismissedLease(scene.lease);
    scene.openControls();
  }, [scene]);
  return { context, scene, initialArrivalComplete, dismissed: Boolean(scene && dismissedLease === scene.lease), showControls };
}

/** Publish only the focused renderer; old mounts cannot reveal a replacement home. */
export function useSceneArrival(status: ArrivalSceneStatus, rendererKey: string, focused: boolean, openControls: () => void): boolean {
  const context = useContext(ArrivalContext);
  const register = context?.register;
  const lease = useRef<ArrivalLease | null>(null);
  useLayoutEffect(() => {
    if (!register || !focused) return;
    const current = register();
    lease.current = current;
    return () => { current.release(); if (lease.current === current) lease.current = null; };
  }, [register, rendererKey, focused]);
  useLayoutEffect(() => {
    if (focused) lease.current?.publish({ status, openControls });
  }, [register, rendererKey, focused, status, openControls]);
  // Once this home has opened, renderer recovery belongs inside the Home screen;
  // the root continues to own its independent membership-verification shield.
  return Boolean(context && !context.initialArrivalComplete);
}
