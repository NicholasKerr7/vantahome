import * as Crypto from 'expo-crypto';
import { useHomeStore, type Scene } from '../../store/useHomeStore';
import { canManageScenes, assertSceneWriteAccess } from '../scenes/sceneManagement';
import { assistantAuthorizationFingerprint } from './assistantContext';

type Handoff = { token: string; fingerprint: string; deadline: number; draft: Omit<Scene, 'id'> };
let pending: Handoff | null = null;
let unsubscribe: (() => void) | null = null;
let expiration: ReturnType<typeof setTimeout> | null = null;

/** Keep generated drafts in memory only and erase them after consumption, expiry or access changes. */
export function clearAssistantDraft(): void {
  pending = null;
  unsubscribe?.(); unsubscribe = null;
  if (expiration) clearTimeout(expiration);
  expiration = null;
}

/** Pass a verified draft to the existing scene editor without putting private content in navigation params. */
export function stageAssistantDraft(draft: Omit<Scene, 'id'>, deadline: number): string {
  clearAssistantDraft();
  const current = useHomeStore.getState();
  assertSceneWriteAccess(current, draft);
  if (deadline <= Date.now()) throw new Error('This suggestion expired. Ask for a fresh scene.');
  const token = Crypto.randomUUID();
  pending = { token, fingerprint: assistantAuthorizationFingerprint(current), deadline, draft };
  unsubscribe = useHomeStore.subscribe((state) => {
    if (pending && (assistantAuthorizationFingerprint(state) !== pending.fingerprint || !canManageScenes(state))) clearAssistantDraft();
  });
  expiration = setTimeout(clearAssistantDraft, Math.min(deadline - Date.now(), 300_000));
  return token;
}

/** Accept exactly one review in the same authorized home; cancelled navigation never creates a saved scene. */
export function consumeAssistantDraft(token: string): Omit<Scene, 'id'> | null {
  const value = pending;
  // An old navigation callback must not consume or erase a more recent review.
  if (!value || value.token !== token) return null;
  clearAssistantDraft();
  const current = useHomeStore.getState();
  if (value.deadline <= Date.now()
    || value.fingerprint !== assistantAuthorizationFingerprint(current) || !canManageScenes(current)) return null;
  try { assertSceneWriteAccess(current, value.draft); return value.draft; }
  catch { return null; }
}
