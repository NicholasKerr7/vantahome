import { useEffect, useRef, useState } from "react";
import {
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
  type HomeState,
} from "../../store/useHomeStore";
import {
  canManageRoutines,
  selectVisibleRoutines,
  type RoutineDraft,
} from "../../store/routines";
import { homeEditorScope } from "../../features/home-shell/homeEditorScope";
import { assertRoutineReferences } from "../../store/routineAccess";

const SCOPE_CHANGED =
  "Your home or sign-in changed. Return to Routines to start again.";
const ACCESS_CHANGED =
  "You no longer have permission to manage routines. Return to Routines to continue.";

/** Fence a draft to its original session while allowing normal telemetry and availability updates. */
export function useRoutineEditorGuard() {
  const currentScope = useHomeStore(homeEditorScope);
  const permitted = useHomeStore(canManageRoutines);
  const [initialScope] = useState(currentScope);
  const [invalidated, setInvalidated] = useState(false);
  const invalidatedRef = useRef(false);

  useEffect(() => {
    /** Latch the first identity change, including an away-and-back change in a single React batch. */
    const observeScope = (state: HomeState) => {
      if (homeEditorScope(state) === initialScope) return;
      invalidatedRef.current = true;
      setInvalidated(true);
    };
    observeScope(useHomeStore.getState());
    return useHomeStore.subscribe(observeScope);
  }, [initialScope]);

  const unavailable =
    invalidated || currentScope !== initialScope
      ? SCOPE_CHANGED
      : !permitted
        ? ACCESS_CHANGED
        : null;

  /** Check fresh state at the mutation boundary so previously rendered callbacks cannot cross scopes. */
  function validate(routineId?: string, draft?: RoutineDraft): string | null {
    const state = useHomeStore.getState();
    if (invalidatedRef.current || homeEditorScope(state) !== initialScope)
      return SCOPE_CHANGED;
    if (!canManageRoutines(state)) return ACCESS_CHANGED;
    if (
      routineId &&
      !selectVisibleRoutines(state).some((routine) => routine.id === routineId)
    )
      return "This routine is no longer available in your household view.";
    if (!draft) return null;
    try {
      assertRoutineReferences(draft, {
        devices: selectVisibleDevices(state),
        rooms: selectVisibleRooms(state),
        scenes: state.scenes,
        household: state.household,
      });
      return null;
    } catch (cause) {
      return cause instanceof Error
        ? cause.message
        : "Review the routine's devices and scenes before saving.";
    }
  }

  return { unavailable, validate };
}
