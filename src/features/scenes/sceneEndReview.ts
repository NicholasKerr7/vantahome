import { getCapabilities, type DeviceKind } from '../../../packages/home-scene/src/deviceCapabilities';
import type { DeviceState, SettingValue, SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { selectVisibleDevices, selectVisibleRooms, type HomeState } from '../../store/useHomeStore';
import { homeEditorScope } from '../home-shell/homeEditorScope';
import { resolveModelSceneAccess } from '../three-d-home/modelSceneAccess';
import { projectModelSnapshot } from '../three-d-home/modelHomeCatalog';
import { isModelHome } from '../three-d-home/modelHomeScope';
import { selectSimulationDeviceBindings } from '../three-d-home/simulationDeviceBindings';
import { simulationPersistence, SceneRestorationConflictError, type SimulationPersistence } from '../three-d-home/simulationPersistence';
import { canManageScenes } from './sceneManagement';
import { sceneIsVisible } from './sceneScope';
import { applySceneRestoration, buildSceneRestorationPlan, type SceneRestorationReceipt } from './sceneRestorationModel';
import { sceneRestorationIdentity, sceneRestorationScope } from './sceneRestorationScope';

export interface SceneEndReviewItem {
  id: string;
  name: string;
  roomName: string;
  changes: { label: string; before: string; after: string }[];
  disposition: 'restore' | 'skip';
  reason?: string;
}
export interface SceneEndReviewModel {
  sceneId: string;
  sceneName: string;
  runId: string | null;
  revision: number | null;
  canRestore: boolean;
  unavailableReason?: string;
  items: SceneEndReviewItem[];
}
export interface SceneEndReviewSession {
  model: SceneEndReviewModel;
  editorScope: string;
  accessKey: string;
  storageScope: string;
  receiptKey: string;
  lastRunKey: string;
  planKey: string;
}
export interface SceneEndStore {
  getState: () => HomeState;
  setState: (update: Partial<HomeState>) => void;
}
type ReviewPersistence = Pick<SimulationPersistence, 'load' | 'getSceneReceipt' | 'updateSceneReceipt' | 'getSnapshot' | 'awaitSaved' | 'retrySave'>;

/** Resolve only explicit, currently controllable simulation bindings, never shared property geometry. */
function allowedDevices(state: HomeState): string[] {
  const bound = new Set(Object.values(selectSimulationDeviceBindings(state)));
  return resolveModelSceneAccess(state).controllableDeviceIds.filter((id) => bound.has(id)).sort();
}

/** Bind an open review to its household authority, including room and permission changes. */
export function sceneEndAccessKey(state: HomeState): string {
  return JSON.stringify([homeEditorScope(state), state.authTaskBlockingHome, canManageScenes(state),
    state.household.find((member) => member.id === state.activeMemberId), state.memberPermissionOverrides,
    state.roomMembers, allowedDevices(state)]);
}

/** Require the latest visible scene and fresh household access at every asynchronous boundary. */
function requireCurrentScene(state: HomeState, sceneId: string) {
  const scene = state.scenes.find((candidate) => candidate.id === sceneId);
  if (state.authTaskBlockingHome || !canManageScenes(state) || state.activeSceneId !== sceneId || !scene
    || !sceneIsVisible(scene, selectVisibleRooms(state), selectVisibleDevices(state))) {
    throw new Error('This scene is no longer available with your current home access.');
  }
  return scene;
}

/** A metadata signature detects a same-scene rerun even when the visible title is unchanged. */
function receiptKey(receipt: SceneRestorationReceipt | null): string {
  return JSON.stringify(receipt ? [receipt.runId, receipt.revision, receipt.identityKey, receipt.sceneId] : null);
}

/** Present known capabilities with their own labels and units, keeping absent preferences honest. */
function describeField(kind: DeviceKind, field: string, value: SettingValue | null): { label: string; value: string } {
  if (field === 'on') return { label: 'Power', value: value ? 'On' : 'Off' };
  if (field === 'level') return { label: kind === 'light' ? 'Brightness' : kind === 'blinds' ? 'Open position' : 'Level', value: `${value}%` };
  const key = field.slice('settings.'.length);
  const capability = getCapabilities(kind).find((item) => 'field' in item && item.field === key);
  const label = capability?.label ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
  if (value === null) return { label, value: 'Default' };
  const option = capability?.type === 'enum' ? capability.options.find((entry) => entry.value === value) : undefined;
  const unit = capability && 'unit' in capability ? capability.unit ?? '' : '';
  return { label, value: option?.label ?? (typeof value === 'boolean' ? value ? 'On' : 'Off' : `${value}${unit}`) };
}

/** Read the current display value instead of showing an obsolete scene value after a manual edit. */
function currentValue(state: DeviceState, field: string): SettingValue | null {
  return field === 'on' ? state.on : field === 'level' ? state.level : state.settings?.[field.slice('settings.'.length)] ?? null;
}

/** Build bounded review rows; denied devices contribute no names, rooms or prior settings. */
function reviewItems(state: HomeState, receipt: SceneRestorationReceipt, snapshot: SimulationSnapshot): SceneEndReviewItem[] {
  const allowed = allowedDevices(state);
  const plan = buildSceneRestorationPlan(receipt, snapshot, allowed);
  const bindings = selectSimulationDeviceBindings(state);
  const items: SceneEndReviewItem[] = receipt.devices.flatMap((entry) => {
    if (!allowed.includes(entry.deviceId)) return [];
    const device = state.devices.find((candidate) => bindings[candidate.id] === entry.deviceId);
    const current = snapshot.deviceStates[entry.deviceId];
    if (!device || !current) return [];
    const skipped = plan.skipped.find((item) => item.deviceId === entry.deviceId);
    return [{ id: entry.deviceId, name: device.name, roomName: state.rooms.find((room) => room.id === device.roomId)?.name ?? 'Your home',
      disposition: skipped ? 'skip' : 'restore', reason: skipped ? skipped.reason === 'changed'
        ? 'Changed since this scene ran. Your later choice stays in place.' : 'Use this device’s controls to change it. Ending a scene will leave it as it is.' : undefined,
      changes: entry.changes.map((change) => ({ label: describeField(entry.kind, change.field, change.before).label,
        before: describeField(entry.kind, change.field, change.before).value,
        after: describeField(entry.kind, change.field, currentValue(current, change.field)).value })) }];
  });
  if (receipt.appearance) items.push({ id: 'atmosphere', name: 'Home appearance', roomName: '3D view',
    disposition: plan.appearance === 'restore' ? 'restore' : 'skip', reason: plan.appearance === 'changed' ? 'Your later appearance choice stays in place.' : undefined,
    changes: [{ label: 'Lighting', before: receipt.appearance.before.lightingMode === 'auto' ? 'Local time' : receipt.appearance.before.night ? 'Night' : 'Day',
      after: snapshot.lightingMode === 'auto' ? 'Local time' : snapshot.night ? 'Night' : 'Day' }] });
  return items;
}

/** Load a review without changing any device or the scene's last-used status. */
export async function prepareSceneEndReview(sceneId: string, getState: () => HomeState,
  persistence: ReviewPersistence = simulationPersistence): Promise<SceneEndReviewSession> {
  const initial = getState(); requireCurrentScene(initial, sceneId);
  const accessKey = sceneEndAccessKey(initial); const storageScope = sceneRestorationScope(initial);
  await persistence.load(storageScope);
  const snapshot = persistence.getSnapshot(storageScope);
  if (!snapshot) throw new Error('Saved settings are still loading. Try again.');
  const current = getState(); const scene = requireCurrentScene(current, sceneId);
  if (sceneEndAccessKey(current) !== accessKey) throw new SceneRestorationConflictError();
  const saved = persistence.getSceneReceipt(storageScope);
  const receipt = saved?.identityKey === sceneRestorationIdentity(current) && saved.sceneId === sceneId ? saved : null;
  const plan = receipt ? buildSceneRestorationPlan(receipt, snapshot, allowedDevices(current)) : null;
  const items = receipt ? reviewItems(current, receipt, snapshot) : [];
  return { editorScope: homeEditorScope(current), accessKey, storageScope, receiptKey: receiptKey(saved),
    lastRunKey: JSON.stringify(current.lastSceneRun), planKey: JSON.stringify(plan),
    model: { sceneId, sceneName: scene.name, runId: receipt?.runId ?? null, revision: receipt?.revision ?? null,
      canRestore: Boolean(plan && (plan.restorable.length || plan.appearance === 'restore')), items,
      unavailableReason: !receipt ? 'Previous settings were not recorded for this run. Keep your current settings, or run the scene again to enable restoration next time.'
        : !items.some((item) => item.disposition === 'restore') ? 'No eligible settings remain to restore. Later edits and sensitive controls stay unchanged.' : undefined } };
}

/** Reject stale reviews before consuming their receipt, including a permission change during hydration. */
function validateSession(session: SceneEndReviewSession, state: HomeState, receipt: SceneRestorationReceipt | null) {
  requireCurrentScene(state, session.model.sceneId);
  if (sceneEndAccessKey(state) !== session.accessKey || homeEditorScope(state) !== session.editorScope
    || receiptKey(receipt) !== session.receiptKey || JSON.stringify(state.lastSceneRun) !== session.lastRunKey) throw new SceneRestorationConflictError();
}

/** Confirm restoration or keep-current atomically; no action reducer or hardware command is invoked. */
export async function finishSceneEndReview(session: SceneEndReviewSession, choice: 'restore' | 'keep', store: SceneEndStore,
  persistence: ReviewPersistence = simulationPersistence, signal?: AbortSignal): Promise<void> {
  const checkCanceled = () => { if (signal?.aborted) throw new Error('Scene review was closed. No further changes were applied.'); };
  checkCanceled();
  validateSession(session, store.getState(), persistence.getSceneReceipt(session.storageScope));
  await persistence.load(session.storageScope);
  checkCanceled();
  validateSession(session, store.getState(), persistence.getSceneReceipt(session.storageScope));
  let applied: SimulationSnapshot | null = null;
  if (choice === 'restore' && !session.model.canRestore) throw new Error('No previous settings are available to restore.');
  if (session.model.runId !== null && session.model.revision !== null) {
    await persistence.updateSceneReceipt(session.storageScope, { runId: session.model.runId, revision: session.model.revision }, (snapshot, receipt) => {
      checkCanceled();
      const current = store.getState(); validateSession(session, current, receipt);
      const plan = buildSceneRestorationPlan(receipt, snapshot, allowedDevices(current));
      if (JSON.stringify(plan) !== session.planKey) throw new SceneRestorationConflictError();
      applied = choice === 'restore' ? applySceneRestoration(receipt, snapshot, allowedDevices(current)) : snapshot;
      return applied;
    });
  }
  try {
    // A consumed receipt is never replayed when disk storage fails. A refreshed
    // keep-current confirmation can retry writing the already accepted state.
    if (session.model.runId === null) await persistence.retrySave(session.storageScope);
    else await persistence.awaitSaved(session.storageScope);
  } catch {
    throw new Error('Your settings are updated on this device, but could not be saved. Refresh the review, then choose Keep current settings to retry saving.');
  }
  const current = store.getState();
  const latest = persistence.getSnapshot(session.storageScope);
  // A newer run may finish while the awaited transaction resumes. Never clear its selection.
  if (sceneEndAccessKey(current) === session.accessKey && current.activeSceneId === session.model.sceneId
    && JSON.stringify(current.lastSceneRun) === session.lastRunKey
    && (session.model.runId === null ? receiptKey(persistence.getSceneReceipt(session.storageScope)) === session.receiptKey
      : persistence.getSceneReceipt(session.storageScope) === null)) {
    store.setState({ activeSceneId: null,
      ...(applied && latest && isModelHome(current) ? { devices: projectModelSnapshot(current.devices, latest) } : {}) });
  }
}
