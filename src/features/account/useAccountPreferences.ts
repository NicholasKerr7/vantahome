import { useEffect, useRef, useState } from 'react';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import { isAccountScopeCurrent } from './accountIdentity';
import { useAccountIdentity } from './useAccountIdentity';
import { beginLocalSettingsWrite, isLocalSettingsScopeCurrent, localSettingsScopeKey } from './localSettingsWrites';

type DisplayPreferences = Pick<HomeState['profile'], 'tempUnit' | 'timeFormat'>;

/** Update only personal fields using the same persisted store as the profile workspace. */
export function useAccountPreferences() {
  const profile = useHomeStore((state) => state.profile);
  const preferences = useHomeStore((state) => state.preferences);
  const { identity, scope } = useAccountIdentity();
  const mounted = useRef(true);
  const scopeKey = JSON.stringify([scope.authenticatedUserId, scope.accountUserId, scope.activeHomeId,
    scope.accountHomeId, scope.sessionEpoch, scope.membershipReady]);
  const [saveError, setSaveError] = useState<{ scopeKey: string; message: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Reject retained handlers after a sheet closes or its account/home scope changes. */
  function canUpdate() {
    return mounted.current && identity.mode !== 'unavailable'
      && isAccountScopeCurrent(scope, useHomeStore.getState());
  }

  /** Restore only this failed write's unchanged fields, preserving newer choices and account boundaries. */
  async function savePreferences<Values extends object>(
    collection: 'profile' | 'preferences',
    patch: Partial<Values>,
    read: () => Values,
    write: (values: Partial<Values>) => void | Promise<void>,
  ): Promise<void> {
    if (!canUpdate()) return;
    const fields = Object.keys(patch) as Array<keyof Values>;
    if (!fields.length) return;
    const before = read();
    const writeScope = beginLocalSettingsWrite(localSettingsScopeKey(scope), collection, fields.map(String));
    setSaveError(null);
    try {
      await write(patch);
    } catch {
      // Storage belongs to this account even after its sheet closes; only UI feedback needs a mounted view.
      if (!isLocalSettingsScopeCurrent(scope, useHomeStore.getState())) return;
      const latest = read();
      const rollback: Partial<Values> = {};
      const failedFields = fields.filter(field => writeScope.isLatest(String(field)));
      if (!failedFields.length) return;
      failedFields.forEach(field => {
        if (latest[field] === patch[field]) rollback[field] = before[field];
      });
      if (canUpdate()) setSaveError({ scopeKey, message: 'This personal preference could not be saved. Please try again.' });
      if (Object.keys(rollback).length) {
        try {
          await write(rollback);
        } catch {
          // The store restores its visible values synchronously; keep the storage error visible if that write also fails.
        }
      }
    } finally {
      writeScope.finish();
    }
  }

  /** Patch display preferences without copying stale identity fields from another profile draft. */
  async function setDisplayPreferences(patch: DisplayPreferences): Promise<void> {
    await savePreferences('profile', patch, () => useHomeStore.getState().profile,
      values => useHomeStore.getState().setProfile(values));
  }

  /** Save feedback choices for all consumers and report storage failures instead of claiming success. */
  async function setComfortPreferences(patch: Partial<HomeState['preferences']>): Promise<void> {
    await savePreferences('preferences', patch, () => useHomeStore.getState().preferences,
      values => useHomeStore.getState().setPreferences(values));
  }

  return {
    tempUnit: profile.tempUnit ?? 'C',
    timeFormat: profile.timeFormat ?? '12h',
    preferences,
    preferenceError: saveError?.scopeKey === scopeKey ? saveError.message : null,
    available: identity.mode !== 'unavailable',
    canUpdate,
    setDisplayPreferences,
    setComfortPreferences,
  };
}
