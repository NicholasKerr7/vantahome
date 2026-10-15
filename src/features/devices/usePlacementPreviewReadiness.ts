import { useEffect, useState } from 'react';

export const PLACEMENT_PREVIEW_TIMEOUT_MS = 15000;
type PlacementPreviewStatus = 'loading' | 'ready' | 'error';

/** Bound both bridge bootstrap and model loading, with a fresh deadline for a retry or a different room. */
export function usePlacementPreviewReadiness(attempt: number, modelRoomId: string) {
  const [status, setStatus] = useState<PlacementPreviewStatus>('loading');
  useEffect(() => { setStatus('loading'); }, [attempt, modelRoomId]);
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => setStatus('error'), PLACEMENT_PREVIEW_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [attempt, modelRoomId, status]);
  return [status, setStatus] as const;
}
