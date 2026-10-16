import { useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { createDefaultDevicePlacement, type SimulationDevicePlacement } from '../../../packages/home-scene/src/devicePlacement';
import {
  loadPendingSimulationDeviceEdit, refreshSimulationDeviceForEdit, SimulationDeviceEditConflictError,
  SimulationDeviceEditValidationError, updateSimulationDevice, type SimulationDeviceEdit,
} from '../../services/simulationDeviceEditing';
import { canManageSimulationDevices } from '../../services/simulationDeviceRegistration';
import { useHomeStore, type Device } from '../../store/useHomeStore';
import { homeEditorScope } from '../home-shell/homeEditorScope';

type Status = 'restoring' | 'restore-error' | 'editing' | 'saving' | 'saved' | 'conflict' | 'removed' | 'reloading';

/** Copy only editable metadata; a draft never owns power, levels, schedules, or the saved identity. */
function draftForDevice(device: Device): SimulationDeviceEdit | null {
  if (!device.simulationOnly || device.modelDeviceId !== `placed-${device.id}` || !device.modelPlacement
    || !Number.isInteger(device.modelRevision) || device.modelRevision! < 0) return null;
  return { requestId: randomUUID(), deviceId: device.id, expectedRevision: device.modelRevision!,
    name: device.name, roomId: device.roomId, placement: structuredPlacement(device.modelPlacement) };
}

/** Keep mutable draft coordinates separate from the authoritative store's placement array. */
function structuredPlacement(placement: SimulationDevicePlacement): SimulationDevicePlacement {
  return { ...placement, position: [...placement.position] };
}

/** Own the edit transaction, its exact retry payload, and explicit conflict recovery for one account session. */
export function useSimulationDeviceEditDraft(deviceId: string) {
  const scope = useHomeStore(homeEditorScope);
  const allowed = useHomeStore(canManageSimulationDevices);
  const device = useHomeStore((state) => state.devices.find((item) => item.id === deviceId));
  const [initialScope] = useState(scope);
  const [baseline, setBaseline] = useState(() => device ? draftForDevice(device) : null);
  const [draft, setDraft] = useState(baseline);
  const [status, setStatus] = useState<Status>('restoring');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  const visible = allowed && scope === initialScope;

  /** Late network or disk completions cannot update an unmounted editor or another household. */
  function isCurrent(): boolean {
    return mounted.current && homeEditorScope(useHomeStore.getState()) === initialScope
      && canManageSimulationDevices(useHomeStore.getState());
  }

  // Resolve a previously submitted edit before creating any new request for this device.
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (visible) {
      setStatus('restoring');
      void loadPendingSimulationDeviceEdit(deviceId).then((pending) => {
        if (!active || !isCurrent()) return;
        if (pending) { setDraft(pending); setSubmitted(true); }
        setError(null);
        setStatus(pending || baseline ? 'editing' : 'removed');
      }).catch(() => {
        if (active && isCurrent()) setStatus('restore-error');
      });
    }
    return () => { active = false; mounted.current = false; };
  }, [deviceId, initialScope, visible, restoreAttempt]);

  /** Draft changes stay local until the review action; uncertain requests remain immutable. */
  function changeDraft(update: Partial<Pick<SimulationDeviceEdit, 'name' | 'roomId' | 'placement'>>): void {
    if (submitted || status !== 'editing' || !isCurrent()) return;
    setDraft((current) => current ? { ...current, ...update } : null);
    setError(null);
  }

  /** A different room gets a valid mounting pose; retaining the current room retains deliberate adjustments. */
  function chooseRoom(roomId: string): void {
    if (!draft || draft.roomId === roomId) return;
    const room = useHomeStore.getState().rooms.find((item) => item.id === roomId);
    const placement = room?.modelRoomId ? createDefaultDevicePlacement(draft.placement.templateId, room.modelRoomId) : null;
    if (placement) changeDraft({ roomId, placement });
  }

  /** Confirm this exact revision and retry receipt without replacing the device or its control settings. */
  async function save(): Promise<void> {
    if (!draft || busy.current || status !== 'editing' || !isCurrent()) return;
    const payload = { ...draft, name: draft.name.trim() };
    if (!payload.name || payload.name.length > 80 || /[\u0000-\u001f\u007f]/u.test(payload.name)) return;
    busy.current = true;
    setDraft(payload); setSubmitted(true); setStatus('saving'); setError(null);
    try {
      await updateSimulationDevice(payload);
      if (isCurrent()) setStatus('saved');
    } catch (cause) {
      if (isCurrent()) {
        setError(cause instanceof SimulationDeviceEditConflictError ? null : cause instanceof Error ? cause.message : 'The changes could not be confirmed. Retry this same save safely.');
        if (cause instanceof SimulationDeviceEditValidationError) {
          setSubmitted(false);
          setDraft((current) => current ? { ...current, requestId: randomUUID() } : null);
        }
        setStatus(cause instanceof SimulationDeviceEditConflictError ? cause.code === 'removed' ? 'removed' : 'conflict' : 'editing');
      }
    } finally { busy.current = false; }
  }

  /** Explicitly adopt a newly verified saved version, never silently overwrite another administrator's edit. */
  async function reloadLatest(): Promise<void> {
    if (busy.current || !isCurrent()) return;
    busy.current = true; setStatus('reloading'); setError(null);
    try {
      const latest = await refreshSimulationDeviceForEdit(deviceId);
      if (!isCurrent()) return;
      const next = latest ? draftForDevice(latest) : null;
      setBaseline(next); setDraft(next); setSubmitted(false); setStatus(next ? 'editing' : 'removed');
    } catch (cause) {
      if (isCurrent()) {
        setError(cause instanceof Error ? cause.message : 'The latest device could not be loaded. Try again.');
        setStatus(cause instanceof SimulationDeviceEditConflictError && cause.code === 'removed' ? 'removed' : 'conflict');
      }
    } finally { busy.current = false; }
  }

  const validName = Boolean(draft?.name.trim()) && (draft?.name.trim().length ?? 0) <= 80 && !/[\u0000-\u001f\u007f]/u.test(draft?.name ?? '');
  const changed = Boolean(draft && baseline && (draft.name.trim() !== baseline.name || draft.roomId !== baseline.roomId
    || JSON.stringify(draft.placement) !== JSON.stringify(baseline.placement)));
  return { visible, device, baseline, draft, status, submitted, error, validName, changed,
    busy: status === 'saving' || status === 'reloading', changeDraft, chooseRoom, save, reloadLatest,
    retryRestore: () => setRestoreAttempt((attempt) => attempt + 1) };
}
