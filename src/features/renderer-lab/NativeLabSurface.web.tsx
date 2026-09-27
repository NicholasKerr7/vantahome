import { useEffect } from "react";
import type { LabSurfaceProps } from "./protocol";

/** Keep browser bundles independent of native graphics and explain unsupported entry. */
export default function NativeLabSurface({ onEvent }: LabSurfaceProps) {
  useEffect(() => {
    onEvent({ type: "error", message: "Filament is available in the native iPhone and Android preview." });
  }, [onEvent]);
  return null;
}
