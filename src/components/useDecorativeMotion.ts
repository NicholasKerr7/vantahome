import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState } from "react-native";

/** Run decorative animation only on an active screen while system motion is allowed. */
export function useDecorativeMotion(active: boolean): boolean {
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    let receivedMotionChange = false;
    const appSubscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
    });
    const motionSubscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        receivedMotionChange = true;
        setReducedMotion(enabled);
      },
    );
    // A newer settings event wins over an older asynchronous initial read.
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !receivedMotionChange) setReducedMotion(enabled);
    }).catch(() => {
      // Keep decoration still if the platform cannot determine its motion policy.
      if (mounted && !receivedMotionChange) setReducedMotion(true);
    });
    return () => {
      mounted = false;
      appSubscription.remove();
      motionSubscription.remove();
    };
  }, []);

  return active && appActive && reducedMotion === false;
}
