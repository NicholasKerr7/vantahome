import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import type { SimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import type { CommandActivityProgress } from '../../components/command-feedback/useCommandActivity';
import { getCommandActivityScope } from '../../components/command-feedback/useCommandActivity';
import { runtimePolicy } from '../../config/runtimeMode';
import { getCommandFeedback } from '../../services/commandFeedback';
import { selectVisibleDevices, useHomeStore, type Device, type HomeState } from '../../store/useHomeStore';
import { modelSimulationIdentity, modelSimulationScope } from '../three-d-home/modelSceneAccess';
import { selectSimulationDeviceBindings } from '../three-d-home/simulationDeviceBindings';
import { simulationPersistence } from '../three-d-home/simulationPersistence';
import { canShareDemoDevices } from '../three-d-home/simulationSession';
import { activityInboxJournal, inboxRevision, type InboxEvent, type InboxSnapshot } from './activityInboxJournal';

export type InboxItem = Readonly<{
  id: string;
  revision: string;
  title: string;
  body: string;
  status: string;
  timestamp: number;
  category: 'alert' | 'device';
  simulated: boolean;
  unread: boolean;
}>;
type InboxContextValue = Readonly<{
  items: readonly InboxItem[];
  ready: boolean;
  storageError: boolean;
  acknowledge: (items: readonly InboxItem[], dismiss: boolean) => void;
}>;
const EMPTY: InboxSnapshot = { events: [], ready: false, storageError: false };
const ActivityInboxContext = createContext<InboxContextValue | null>(null);

/** Only verified account/home identities or the explicit offline demo may own a local inbox. */
export function getActivityInboxScope(state: HomeState): string | null {
  if (state.accountUserId || state.authenticatedUserId || state.accountHomeId || state.activeHomeId) {
    if (!state.membershipReady || !state.authenticatedUserId || state.accountUserId !== state.authenticatedUserId
      || !state.activeHomeId || state.activeHomeId !== state.accountHomeId || state.activeMemberId !== state.authenticatedUserId) return null;
    return JSON.stringify(['account', state.authenticatedUserId, state.activeHomeId, state.activeMemberId]);
  }
  return runtimePolicy.mode === 'demo' && state.activeMemberId
    ? JSON.stringify(['demo', state.activeMemberId]) : null;
}

/** Describe only captured primitive model values, never infer a lock, sensor or physical-device outcome. */
function simulationStatus(event: InboxEvent, device: Device): string {
  if (event.level !== undefined && ['gate', 'garage', 'door', 'window', 'blinds'].includes(device.kind)) {
    return event.level === 0 ? 'Model closed' : event.level === 100 ? 'Model fully open' : `Model ${Math.round(event.level)}% open`;
  }
  if (event.power !== undefined && ['light', 'fan', 'tv', 'ac', 'speaker', 'sprinkler', 'water-heater'].includes(device.kind)) {
    const brightness = device.kind === 'light' && event.power && event.level !== undefined ? ` · ${Math.round(event.level)}% brightness` : '';
    return `Model ${event.power ? 'on' : 'off'}${brightness}`;
  }
  return 'Model updated';
}

/** Resolve names and device grants at render time; cached metadata cannot restore hidden device access. */
export function presentInboxEvents(events: readonly InboxEvent[], state: HomeState, liveIds: ReadonlySet<string> = new Set()): readonly InboxItem[] {
  const devices = new Map(selectVisibleDevices(state).map((device) => [device.id, device]));
  return events.flatMap((event): InboxItem[] => {
    const device = devices.get(event.deviceId);
    if (!device || event.dismissedRevision === inboxRevision(event)) return [];
    let feedback = event.status === 'updated' ? {
      title: simulationStatus(event, device), description: 'Settings changed in your local 3D simulation. No physical device was controlled.', tone: 'neutral',
    } : getCommandFeedback({ status: event.status, reason: event.reason, attempts: event.attempts }, event.simulated);
    if (event.source === 'delivery' && ['pending', 'sending', 'queued', 'retrying'].includes(event.status) && !liveIds.has(event.id)) {
      feedback = { title: event.simulated ? 'Demo: Tracking ended' : 'Outcome unknown',
        description: 'This earlier request is no longer tracked in this session. Check the device before sending again.', tone: 'warning' };
    }
    return [{ id: event.id, revision: inboxRevision(event), title: device.name,
      body: feedback.description, status: feedback.title, timestamp: event.updatedAt,
      category: feedback.tone === 'warning' ? 'alert' : 'device', simulated: event.simulated,
      unread: event.readRevision !== inboxRevision(event) }];
  }).sort((a, b) => b.timestamp - a.timestamp);
}

/** Countdown ticks are animation; phase, opening position and settings changes are actual model updates. */
export function hasMeaningfulSimulationChange(before: DeviceState, after: DeviceState): boolean {
  if (before.on !== after.on || before.level !== after.level) return true;
  const keys = new Set([...Object.keys(before.settings ?? {}), ...Object.keys(after.settings ?? {})]);
  keys.delete('gateCountdownSec');
  return [...keys].some((key) => before.settings?.[key] !== after.settings?.[key]);
}

/** Select visibility dependencies without rerendering the inbox on every simulated sensor sample. */
function selectInboxAccess(state: HomeState): Record<string, string> {
  return Object.fromEntries(selectVisibleDevices(state).map((device) => [device.id, JSON.stringify([device.name, device.kind])]));
}

/** Record a scoped, local history of admitted delivery phases and actual model changes. */
export default function ActivityInboxProvider({ enabled, commands, children }: PropsWithChildren<{
  enabled: boolean;
  commands: readonly CommandActivityProgress[];
}>) {
  const scope = useHomeStore(getActivityInboxScope);
  const identity = useHomeStore(getCommandActivityScope);
  const simulationIdentity = useHomeStore(modelSimulationIdentity);
  const simulationReady = useHomeStore((state) => Object.keys(selectSimulationDeviceBindings(state)).length > 0);
  const access = useHomeStore(useShallow(selectInboxAccess));
  // Hide the previous snapshot in render, before any asynchronous effect cleanup.
  const subscription = useMemo(() => ({ scope, identity, enabled }), [scope, identity, enabled]);
  const [record, setRecord] = useState<{ subscription: typeof subscription; snapshot: InboxSnapshot } | null>(null);
  useEffect(() => {
    if (!enabled || !scope) return;
    let disposed = false;
    const stop = activityInboxJournal.subscribe(scope, (snapshot) => {
      if (!disposed) setRecord({ subscription, snapshot });
    });
    return () => { disposed = true; stop(); };
  }, [enabled, scope, subscription]);

  useEffect(() => {
    if (!enabled || !scope || !commands.length) return;
    const current = useHomeStore.getState();
    if (getActivityInboxScope(current) !== scope || getCommandActivityScope(current) !== identity) return;
    const devices = new Map(selectVisibleDevices(current).map((device) => [device.id, device]));
    const events: InboxEvent[] = commands.flatMap((command) => {
      const device = devices.get(command.deviceId);
      if (!device) return [];
      return [{ id: `command:${current.sessionEpoch}:${command.commandId}:${command.createdAt}:${command.admissionSequence}`,
        deviceId: command.deviceId, source: 'delivery', status: command.status,
        createdAt: command.createdAt, updatedAt: command.updatedAt, attempts: command.attempts,
        simulated: runtimePolicy.allowMockTelemetry || device.simulationOnly === true,
        ...(command.reason ? { reason: command.reason } : {}) }];
    });
    void activityInboxJournal.upsert(scope, events);
  }, [commands, enabled, scope, identity]);

  useEffect(() => {
    if (!enabled || !scope) return;
    const initial = useHomeStore.getState();
    if (!simulationReady) return;
    const modelScope = modelSimulationScope(initial, canShareDemoDevices(initial, runtimePolicy.mode));
    let disposed = false;
    let previous: SimulationSnapshot | null = null;
    let sequence = 0;
    const admission = Date.now();
    // Hydration/recovery establishes a baseline, never a notification or inferred action.
    const stop = simulationPersistence.subscribeState(modelScope, (next) => {
      const current = useHomeStore.getState();
      if (disposed || getActivityInboxScope(current) !== scope || getCommandActivityScope(current) !== identity
        || modelSimulationIdentity(current) !== simulationIdentity) return;
      if (!previous) { previous = next; return; }
      const baseline = previous;
      const now = Date.now();
      const events: InboxEvent[] = Object.entries(selectSimulationDeviceBindings(current)).flatMap(([deviceId, modelId]) => {
        const before = baseline.deviceStates[modelId];
        const after = next.deviceStates[modelId];
        if (!before || !after || !hasMeaningfulSimulationChange(before, after)) return [];
        sequence += 1;
        return [{ id: `simulation:${current.sessionEpoch}:${admission}:${sequence}:${deviceId}`,
          deviceId, source: 'simulation', status: 'updated', createdAt: now, updatedAt: now, attempts: 0, simulated: true, power: after.on, level: after.level }];
      });
      previous = next;
      void activityInboxJournal.upsert(scope, events);
    });
    void simulationPersistence.load(modelScope).then((saved) => {
      if (!disposed && !previous) previous = saved;
    }).catch(() => {
      // Keep the state subscription so a successful controls retry supplies the baseline.
    });
    return () => { disposed = true; stop(); };
  }, [enabled, scope, identity, simulationIdentity, simulationReady]);

  const liveIds = useMemo(() => new Set(commands.map((command) =>
    `command:${useHomeStore.getState().sessionEpoch}:${command.commandId}:${command.createdAt}:${command.admissionSequence}`)), [commands, identity]);
  const snapshot = enabled && record?.subscription === subscription ? record.snapshot : EMPTY;
  const items = useMemo(() => scope && enabled
    ? presentInboxEvents(snapshot.events, useHomeStore.getState(), liveIds) : [], [snapshot.events, scope, enabled, access, liveIds]);
  /** Only currently visible row revisions may be read or dismissed by this session. */
  const acknowledge = useCallback((rows: readonly InboxItem[], dismiss: boolean) => {
    const current = useHomeStore.getState();
    if (!enabled || !scope || getActivityInboxScope(current) !== scope || getCommandActivityScope(current) !== identity) return;
    const permitted = new Map(presentInboxEvents(snapshot.events, current).map((item) => [item.id, item.revision]));
    const revisions = new Map(rows.flatMap((item) => permitted.get(item.id) === item.revision ? [[item.id, item.revision]] : []));
    void activityInboxJournal.acknowledge(scope, revisions, dismiss);
  }, [enabled, scope, identity, snapshot.events]);
  const value = useMemo(() => ({ items, ready: snapshot.ready, storageError: snapshot.storageError, acknowledge }),
    [items, snapshot.ready, snapshot.storageError, acknowledge]);
  return <ActivityInboxContext.Provider value={enabled && scope ? value : null}>{children}</ActivityInboxContext.Provider>;
}

/** Available only inside the verified private app shell, never on authentication screens. */
export function useActivityInbox() { return useContext(ActivityInboxContext); }
