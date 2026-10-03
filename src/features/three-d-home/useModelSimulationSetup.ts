import { useCallback, useEffect, useRef, useState } from 'react';
import { canPrepareModelSimulation, prepareModelSimulation } from '../../services/modelSimulationSetup';
import { useHomeStore } from '../../store/useHomeStore';

/** Keep explicit model creation single-flight and discard UI responses after a session change. */
export function useModelSimulationSetup() {
  const available = useHomeStore(canPrepareModelSimulation);
  const identity = useHomeStore((state) => JSON.stringify([state.sessionEpoch, state.authenticatedUserId, state.activeHomeId]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(identity);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  current.current = identity;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setError(null); }, [identity]);

  /** The service rechecks owner identity on both sides of each network boundary. */
  const prepare = useCallback(async () => {
    if (!available || inFlight.current) return;
    const startedFor = current.current;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try { await prepareModelSimulation(); }
    catch (cause) {
      if (mounted.current && current.current === startedFor) {
        setError(cause instanceof Error ? cause.message : 'Unable to prepare your home. Please retry.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [available]);

  return { available, busy, error, prepare };
}
