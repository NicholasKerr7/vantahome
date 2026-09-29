import { useEffect } from "react";
import { runtimePolicy } from "../../config/runtimeMode";
import { useHomeStore } from "../../store/useHomeStore";
import { isModelHome } from "./modelHomeScope";
import { canShareDemoDevices, SimulationSession } from "./simulationSession";

/** Keep local native controls and the model synchronized while any home screen is open. */
export default function ModelHomeSync() {
  const enabled = useHomeStore(
    (state) =>
      isModelHome(state) && canShareDemoDevices(state, runtimePolicy.mode),
  );
  const epoch = useHomeStore((state) => state.sessionEpoch);
  useEffect(() => {
    if (!enabled) return;
    const session = new SimulationSession(
      () => {},
      () => {},
    );
    session.handleMessage({
      channel: "vantahome-simulation",
      version: 1,
      type: "request",
    });
    return () => session.dispose();
  }, [enabled, epoch]);
  return null;
}
