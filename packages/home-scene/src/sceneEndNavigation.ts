export type SceneEndReviewRequest = {
  channel: 'vantahome-navigation';
  version: 1;
  type: 'scene-end-review';
  sceneId: string;
};

/** Accept only a bounded scene identity; restoration commands never cross this navigation boundary. */
export function parseSceneEndReviewRequest(input: unknown): SceneEndReviewRequest | null {
  try {
    if (typeof input === 'string' && input.length > 2048) return null;
    const value: unknown = typeof input === 'string' ? JSON.parse(input) : input;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(',') !== 'channel,sceneId,type,version'
      || record.channel !== 'vantahome-navigation' || record.version !== 1 || record.type !== 'scene-end-review'
      || typeof record.sceneId !== 'string' || !record.sceneId.length || record.sceneId.length > 160
      || /[\u0000-\u001f]/u.test(record.sceneId)) return null;
    return { channel: 'vantahome-navigation', version: 1, type: 'scene-end-review', sceneId: record.sceneId };
  } catch { return null; }
}
