import { runtimePolicy, type RuntimeMode } from "../../config/runtimeMode";
import type { HomeState } from "../../store/useHomeStore";

/** Identify the local house-plan catalog without treating account data as a model binding. */
export function isModelHome(
  state: HomeState,
  mode: RuntimeMode = runtimePolicy.mode,
): boolean {
  return (
    mode === "demo" &&
    state.modelCatalogVersion === 1 &&
    !state.accountUserId &&
    !state.authenticatedUserId &&
    !state.accountHomeId &&
    !state.activeHomeId &&
    !state.realtime.enabled &&
    !state.realtime.useMqtt
  );
}
