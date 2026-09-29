import type { RuntimeMode } from '../../config/runtimeMode';
import type { HomeState } from '../../store/useHomeStore';
import { DEMO_DEVICE_MAPPINGS } from './demoDeviceMapping';
import { canShareDemoDevices } from './simulationSession';

/** Resolve an explicitly paired preview device; never infer a physical target from a model name. */
export function resolveRoutineDeviceId(state: HomeState, sceneDeviceId: string, mode: RuntimeMode): string | null {
  if (!canShareDemoDevices(state, mode)) return null;
  const mapping = DEMO_DEVICE_MAPPINGS.find((entry) => entry.sceneId === sceneDeviceId);
  if (!mapping) return null;
  return state.devices.some((device) => device.id === mapping.demoId && device.kind === mapping.kind) ? mapping.demoId : null;
}
