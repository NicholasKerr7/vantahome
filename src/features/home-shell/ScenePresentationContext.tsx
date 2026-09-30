import { createContext, useContext } from "react";

/** A covering workspace panel pauses graphics without discarding its loaded model or camera. */
export const ScenePresentationContext = createContext(false);

/** Read whether the native workspace currently owns input above the property. */
export function useScenePresentationPaused(): boolean {
  return useContext(ScenePresentationContext);
}
