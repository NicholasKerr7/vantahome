import React from "react";
import { useConditionNotifications } from "../activity/useConditionNotifications";
import { runtimePolicy } from "../../config/runtimeMode";
import { useHomeStore } from "../../store/useHomeStore";
import { getFireIncident } from "../../../packages/home-scene/src/fireSafetySimulation";
import { GATE_DEVICE_ID, gateSafetySummary } from "../../../packages/home-scene/src/gateSafetySimulation";
import { selectSimulationDeviceBindings } from "./simulationDeviceBindings";
import { modelSimulationIdentity } from "./modelSceneAccess";
import { isModelHome } from "./modelHomeScope";
import { canShareDemoDevices } from "./simulationSession";
import { useSimulationControls } from "./useSimulationControls";
import { useForegroundSafetyClock } from "./useForegroundSafetyClock";
import { FireEmergencySimulation } from "./FireEmergencySimulation";

/** Own one connected simulation client and clock for this exact authorized model scope. */
function ModelHomeSafetySession() {
  const { client, ready, state } = useSimulationControls(true);
  useForegroundSafetyClock(client, ready);
  useConditionNotifications(ready ? state : null, ready);
  if (!ready) return null;
  const gate = state.deviceStates[GATE_DEVICE_ID];
  return <FireEmergencySimulation incident={getFireIncident(state.deviceStates)} actions={client}
    supportSummary={`Preview lights stay on. Gate: ${gate ? gateSafetySummary(gate) : 'preview state unavailable'}.`} />;
}

/** Observe physical reports when this home has no bound simulation to own the observer. */
function PhysicalConditionObserver() {
  useConditionNotifications(null);
  return null;
}

/** Own the only embedded safety clock across native controls, voice, and the 3D view. */
export default function ModelHomeSync() {
  const enabled = useHomeStore(
    (state) => (isModelHome(state) && canShareDemoDevices(state, runtimePolicy.mode))
      || Object.keys(selectSimulationDeviceBindings(state)).length > 0,
  );
  const scope = useHomeStore(modelSimulationIdentity);
  return enabled ? <ModelHomeSafetySession key={scope} /> : <PhysicalConditionObserver key={scope} />;
}
