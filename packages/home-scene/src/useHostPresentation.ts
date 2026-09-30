import { useEffect, useState } from "react";
import { isEmbeddedScene } from "./embeddedHost";
import { subscribeScenePresentation } from "./scenePresentation";

/** Retain the loaded property while an enclosing native panel temporarily covers it. */
export function useHostPresentation(): boolean {
  const [suspended, setSuspended] = useState(false);
  useEffect(() => {
    if (isEmbeddedScene())
      return subscribeScenePresentation(window, setSuspended);
  }, []);
  return suspended;
}
