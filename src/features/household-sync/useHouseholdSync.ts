import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { invalidateHomeMembership, useHomeStore } from '../../store/useHomeStore';
import { simulationPersistence } from '../three-d-home/simulationPersistence';
import { householdSyncScope, householdSyncScopeKey } from './householdSyncScope';
import { HouseholdSyncCoordinator, type HouseholdSyncView } from './HouseholdSyncCoordinator';
import { createHouseholdSyncTransport } from './householdSyncTransport';

type Runtime = { key: string; coordinator: HouseholdSyncCoordinator };
let runtime: Runtime | null = null;
const listeners = new Set<() => void>();
const EMPTY: HouseholdSyncView = { status: 'unavailable', homeName: '', deviceCount: 0, lastSyncedAt: null, error: null, busy: false };

/** Subscribe UI consumers without creating another socket, simulator clock or state owner. */
function subscribe(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
/** Return one stable runtime identity for useSyncExternalStore. */
function getRuntime(): Runtime | null { return runtime; }
/** Notify household panels when the active connection owner changes. */
function notify(): void { for (const listener of listeners) listener(); }
/** The shared transport operates only while this app is visibly active. */
function foreground(): boolean { return (AppState.currentState == null || AppState.currentState === 'active') && (typeof document === 'undefined' || !document.hidden); }
/** Native and web visibility share one cleanup boundary. */
function subscribeForeground(listener: () => void): () => void {
  const subscription = AppState.addEventListener('change', listener);
  const page = typeof document === 'undefined' ? undefined : document;
  page?.addEventListener('visibilitychange', listener);
  return () => { subscription.remove(); page?.removeEventListener('visibilitychange', listener); };
}

/** Reconcile the current foreground household without replaying a failed command or restarting 3D graphics. */
export async function reconnectHouseholdSimulation(): Promise<boolean> {
  const activeRuntime = runtime;
  if (!activeRuntime || !foreground() || activeRuntime.key !== householdSyncScopeKey(useHomeStore.getState())) return false;
  activeRuntime.coordinator.cancelReview();
  await activeRuntime.coordinator.reconnect();
  return true;
}

/** Mount exactly once with ModelHomeSync; closing the app never leaves a background control queue running. */
export function useHouseholdSyncRuntime(): void {
  const key = useHomeStore(householdSyncScopeKey);
  const active = useSyncExternalStore(subscribeForeground, foreground, () => false);
  useEffect(() => {
    if (!key || !active) return;
    const scope = householdSyncScope();
    if (!scope || scope.key !== key) return;
    let live = true;
    const current = () => live && foreground() && householdSyncScopeKey(useHomeStore.getState()) === key;
    const coordinator = new HouseholdSyncCoordinator({
      scope, storageScope: scope.storageScope, persistence: simulationPersistence,
      transport: createHouseholdSyncTransport(scope, current), clientId: randomUUID(), requestId: randomUUID, current,
      accessChanged: () => { if (current()) invalidateHomeMembership('checking'); },
    });
    runtime = { key, coordinator };
    notify();
    coordinator.start();
    return () => {
      live = false; coordinator.close();
      if (runtime?.coordinator === coordinator) { runtime = null; notify(); }
    };
  }, [key, active]);
}

/** Expose one scoped review and a truthful connection state to the existing Household workspace. */
export function useHouseholdSync() {
  const key = useHomeStore(householdSyncScopeKey);
  const currentRuntime = useSyncExternalStore(subscribe, getRuntime, () => null);
  const coordinator = key && currentRuntime?.key === key ? currentRuntime.coordinator : null;
  const state = useSyncExternalStore(coordinator?.subscribe ?? subscribe, coordinator?.getSnapshot ?? (() => EMPTY), () => EMPTY);
  const [review, setReview] = useState<{ owner: HouseholdSyncCoordinator; homeName: string; deviceCount: number } | null>(null);
  const [error, setError] = useState<{ owner: HouseholdSyncCoordinator; message: string } | null>(null);
  const owner = useHomeStore((home) => householdSyncScope(home)?.owner ?? false);
  const same = () => Boolean(coordinator && runtime?.coordinator === coordinator && key === householdSyncScopeKey(useHomeStore.getState()) && foreground());
  useEffect(() => {
    setReview(null); setError(null);
    return () => coordinator?.cancelReview();
  }, [coordinator, owner]);

  /** Prepare only from a verified local home owned by the current account. */
  async function reviewEnable(): Promise<void> {
    if (!coordinator || !same() || !owner || state.busy) return;
    setError(null);
    try { const prepared = await coordinator.prepareEnable(); if (same()) setReview({ ...prepared, owner: coordinator }); }
    catch (failure) { if (same()) setError({ owner: coordinator, message: failure instanceof Error ? failure.message : 'Sharing could not be reviewed.' }); }
  }
  /** A confirmation from an old sheet cannot enable another household. */
  async function enable(): Promise<void> {
    if (!coordinator || !same() || !owner || review?.owner !== coordinator || state.busy) return;
    setReview(null); setError(null);
    try { await coordinator.enable(); }
    catch (failure) { if (same()) setError({ owner: coordinator, message: failure instanceof Error ? failure.message : 'Sharing could not be confirmed. Reconnect to check.' }); }
  }
  /** Discard review state before requesting a fresh authoritative snapshot. */
  async function refresh(): Promise<void> {
    if (!coordinator || !same()) return;
    setReview(null); setError(null); coordinator.cancelReview(); await coordinator.reconnect();
  }
  /** Closing review preserves every household/device value. */
  function cancelReview(): void { setReview(null); coordinator?.cancelReview(); }

  return { ...state, scopeKey: coordinator ? key : null, available: !!coordinator, owner,
    error: state.error ?? (error?.owner === coordinator ? error?.message ?? null : null),
    review: same() && state.status === 'local' && review?.owner === coordinator
      ? { homeName: review.homeName, deviceCount: review.deviceCount } : null,
    reviewEnable, cancelReview, enable, refresh };
}
