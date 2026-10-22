import { parseScenePreviewCommand, scenePreviewCommandMessage, type ScenePreviewCommand } from '../../../packages/home-scene/src/scenePreviewProtocol';
import type { ConciergeValues } from '../../../shared/home-concierge/contract';
import { useHomeStore } from '../../store/useHomeStore';
import { assistantContextIsCurrent } from './assistantContext';
import type { AssistantPreview } from './useHomeConcierge';

/** Convert an authorized proposal to a display-only DTO without granting the renderer any new access. */
export function assistantPreviewCommand(preview: AssistantPreview, id: number, now = Date.now()): ScenePreviewCommand | null {
  if (!preview.response.scene || !assistantContextIsCurrent(preview.capturedContext, useHomeStore.getState(), now)
    || preview.expiresAt <= now) return null;
  const actions = [];
  for (const action of preview.response.scene.actions) {
    const device = preview.context.devices.find((candidate) => candidate.id === action.deviceId);
    const captured = preview.capturedContext.devices.find((candidate) => candidate.id === action.deviceId);
    if (!device?.controllable || !captured || device.modelDeviceId !== captured.modelDeviceId) return null;
    const baseline: ConciergeValues = {};
    for (const field of Object.keys(action.values) as (keyof ConciergeValues)[]) {
      if (captured.values[field] === undefined || device.values[field] !== captured.values[field]) return null;
      Object.assign(baseline, { [field]: captured.values[field] });
    }
    actions.push({ deviceId: device.modelDeviceId, values: { ...action.values }, baseline });
  }
  return parseScenePreviewCommand(scenePreviewCommandMessage(id, { title: preview.response.scene.name, expiresAt: preview.expiresAt, actions }));
}
