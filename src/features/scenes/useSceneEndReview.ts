import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useHomeStore } from '../../store/useHomeStore';
import { simulationPersistence } from '../three-d-home/simulationPersistence';
import { useControllerFocused } from '../three-d-home/useControllerFocused';
import { finishSceneEndReview, prepareSceneEndReview, sceneEndAccessKey, type SceneEndReviewSession } from './sceneEndReview';

type ReviewState = { sceneId: string; accessKey: string; session: SceneEndReviewSession | null; loading: boolean; busy: boolean; error: string | null };

/** Own one cancelable review; account changes, backgrounding and navigation discard stale callbacks. */
export function useSceneEndReview() {
  const focused = useControllerFocused();
  const accessKey = useHomeStore(sceneEndAccessKey);
  const activeSceneId = useHomeStore((state) => state.activeSceneId);
  const [state, setState] = useState<ReviewState | null>(null);
  const request = useRef(0);
  const busy = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const currentState = useRef(state); currentState.current = state;
  const focusedRef = useRef(focused); focusedRef.current = focused;

  /** Invalidate in-flight reads and confirmations before dismissing their presentation. */
  const close = useCallback(() => { request.current += 1; operation.current?.abort(); operation.current = null; busy.current = false; setState(null); }, []);

  /** Prepare current canonical values; opening this review never applies a setting. */
  const open = useCallback((sceneId: string) => {
    if (!focusedRef.current || AppState.currentState === 'background' || busy.current) return;
    const id = ++request.current;
    const key = sceneEndAccessKey(useHomeStore.getState());
    setState({ sceneId, accessKey: key, session: null, loading: true, busy: false, error: null });
    void prepareSceneEndReview(sceneId, useHomeStore.getState).then((session) => {
      if (request.current === id && focusedRef.current && key === sceneEndAccessKey(useHomeStore.getState())) {
        setState({ sceneId, accessKey: key, session, loading: false, busy: false, error: null });
      }
    }).catch((error: unknown) => {
      if (request.current === id) setState((previous) => previous ? { ...previous, loading: false,
        error: error instanceof Error ? error.message : 'The scene could not be reviewed. Try again.' } : null);
    });
  }, []);

  /** A changed review must be explicitly read again before a new confirmation can run. */
  const retry = useCallback(() => { const current = currentState.current; if (current) open(current.sceneId); }, [open]);

  /** Use a synchronous tap lock, while the service rechecks identity and receipt at commit time. */
  const confirm = useCallback((choice: 'restore' | 'keep') => {
    const current = currentState.current;
    if (busy.current || !current?.session || current.loading || current.error || !focusedRef.current) return;
    busy.current = true; const id = request.current;
    const controller = new AbortController(); operation.current = controller;
    setState({ ...current, busy: true, error: null });
    void finishSceneEndReview(current.session, choice, useHomeStore, simulationPersistence, controller.signal).then(() => {
      if (request.current === id) close();
    }).catch((error: unknown) => {
      if (request.current !== id) return;
      busy.current = false;
      setState((previous) => previous ? { ...previous, busy: false,
        error: error instanceof Error ? error.message : 'Your choice could not be applied. Review the scene again.' } : null);
    });
  }, [close]);
  const restore = useCallback(() => confirm('restore'), [confirm]);
  const keep = useCallback(() => confirm('keep'), [confirm]);

  useEffect(() => {
    if (state && (!focused || state.accessKey !== accessKey || state.sceneId !== activeSceneId)) close();
  }, [focused, accessKey, activeSceneId, state, close]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => { if (next !== 'active') close(); });
    return () => { subscription.remove(); request.current += 1; operation.current?.abort(); };
  }, [close]);
  const shown = Boolean(state && focused && state.accessKey === accessKey && state.sceneId === activeSceneId);
  return { open, close, shown, review: shown ? state?.session?.model ?? null : null,
    loading: state?.loading ?? false, error: state?.error ?? null, busy: state?.busy ?? false, retry, restore, keep };
}
