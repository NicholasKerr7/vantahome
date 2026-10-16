import type { Device, SceneAction } from '../../store/useHomeStore';
import { buildVirtualSceneAction } from '../scenes/virtualSceneAction';

/** Validate edited simulation settings without expanding a reviewed AI proposal into unrelated defaults. */
export function buildAssistantSceneAction(device: Device, override: Partial<Device>): SceneAction {
  const validated = buildVirtualSceneAction(device, override);
  if (validated.type !== 'patch') throw new Error('This scene action could not be reviewed.');
  const patch: Partial<Device> = {};
  for (const field of Object.keys(override) as (keyof Device)[]) {
    if (validated.patch[field] !== undefined) Object.assign(patch, { [field]: validated.patch[field] });
  }
  if (!Object.keys(patch).length) throw new Error('Choose a supported setting before saving this scene.');
  return { type: 'patch', deviceId: device.id, patch };
}
