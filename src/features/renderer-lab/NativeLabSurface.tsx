import React, { lazy, Suspense, useMemo } from "react";
import type { LabSurfaceProps } from "./protocol";

/** Defer native SDK initialization until the user explicitly selects Filament. */
export default function NativeLabSurface(props: LabSurfaceProps) {
  const Surface = useMemo(() => lazy(() => import("./FilamentSurface")), []);
  return <Suspense fallback={null}><Surface {...props} /></Suspense>;
}
