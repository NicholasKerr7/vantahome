import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  confirmProtectedAccess,
  requiresProtectedAccess,
} from "./biometricConfirmation";

export type ProtectedAccessState = "checking" | "granted" | "denied";

export function useProtectedAccess(promptMessage: string, enabled = true) {
  const required = enabled && requiresProtectedAccess();
  const requestIdRef = useRef(0);
  const [state, setState] = useState<ProtectedAccessState>(() =>
    required ? "checking" : "granted",
  );

  const authenticate = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!required) {
      setState("granted");
      return;
    }
    setState("checking");
    try {
      await confirmProtectedAccess(promptMessage);
      if (requestIdRef.current === requestId) setState("granted");
    } catch {
      if (requestIdRef.current === requestId) setState("denied");
    }
  }, [promptMessage, required]);

  useFocusEffect(
    useCallback(() => {
      void authenticate();
      return () => {
        requestIdRef.current += 1;
        if (required) setState("checking");
      };
    }, [authenticate, required]),
  );

  return { state, retry: authenticate };
}
