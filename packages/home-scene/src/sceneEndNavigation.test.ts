import { describe, expect, it } from 'vitest';
import { parseSceneEndReviewRequest } from './sceneEndNavigation';

const message = { channel: 'vantahome-navigation', version: 1, type: 'scene-end-review', sceneId: 'model-scene:evening' };

describe('scene end review navigation', () => {
  it('accepts native and browser identities without carrying device commands', () => {
    expect(parseSceneEndReviewRequest(message)).toEqual(message);
    expect(parseSceneEndReviewRequest(JSON.stringify(message))).toEqual(message);
    expect(parseSceneEndReviewRequest({ ...message, sceneId: '\\'.repeat(160) })?.sceneId).toHaveLength(160);
  });
  it('rejects injected fields, unbounded IDs, malformed data and future versions', () => {
    for (const invalid of [{ ...message, actions: [] }, { ...message, restore: true }, { ...message, sceneId: '' },
      { ...message, sceneId: 'x'.repeat(161) }, { ...message, sceneId: 'scene\n' }, { ...message, sceneId: 2 },
      { ...message, version: 2 }, { ...message, type: 'run' }, '{', 'x'.repeat(2049), null, []]) {
      expect(parseSceneEndReviewRequest(invalid)).toBeNull();
    }
  });
});
