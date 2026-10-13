import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../theme/theme';
import { useHomeStore, type HomeState } from '../../store/useHomeStore';
import { useAccountIdentity } from '../account/useAccountIdentity';
import { isAccountScopeCurrent } from '../account/accountIdentity';
import { beginLocalSettingsWrite, isLocalSettingsScopeCurrent, localSettingsScopeKey, type LocalSettingsWrite } from '../account/localSettingsWrites';
import { discardPreparedPortrait, prepareProfilePortrait } from './profilePortrait';

type Draft = {
  name: string; email: string; phone: string; avatarColor: string; avatarUri: string;
  timeFormat: '12h' | '24h'; tempUnit: 'C' | 'F';
};
type DraftState = { key: string; initial: Draft; values: Draft; asset: ImagePicker.ImagePickerAsset | null };

/** Normalize editable local fields without pretending to edit login credentials or shared home settings. */
function profileDraft(profile: HomeState['profile']): Draft {
  return {
    name: profile.name, email: profile.email ?? '', phone: profile.phone ?? '',
    avatarColor: profile.avatarColor ?? theme.colors.accent2, avatarUri: profile.avatarUri ?? '',
    timeFormat: profile.timeFormat ?? '12h', tempUnit: profile.tempUnit ?? 'C',
  };
}

/** Own a scoped draft and durable portrait save, leaving household administration separate. */
export function useProfileDraft(onSaved: () => void) {
  const profile = useHomeStore(state => state.profile);
  const { identity, scope } = useAccountIdentity();
  const key = JSON.stringify([scope.authenticatedUserId, scope.accountUserId, scope.activeHomeId,
    scope.accountHomeId, scope.sessionEpoch, scope.membershipReady]);
  const [draft, setDraft] = useState<DraftState>(() => {
    const initial = profileDraft(profile);
    return { key, initial, values: initial, asset: null };
  });
  const [feedback, setFeedback] = useState<{ key: string; message: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // Reset a retained form before children can display the preceding person's draft.
  let current = draft;
  if (draft.key !== key) {
    const initial = profileDraft(profile);
    current = { key, initial, values: initial, asset: null };
    setDraft(current);
  }

  /** Reject saved closures and delayed picker results after leaving this account/session. */
  function canEdit() {
    return mounted.current && identity.mode !== 'unavailable'
      && isAccountScopeCurrent(scope, useHomeStore.getState());
  }

  /** Patch only this draft; saving later applies changed fields over the latest persisted profile. */
  function update<Field extends keyof Draft>(field: Field, value: Draft[Field]) {
    if (!canEdit() || pending.current) return;
    setDraft(previous => previous.key === key
      ? { ...previous, values: { ...previous.values, [field]: value },
          asset: field === 'avatarUri' ? null : previous.asset } : previous);
  }

  /** Request access only on native, and keep browser selection inside its initiating user gesture. */
  async function pickAvatar() {
    if (!canEdit() || pending.current) return;
    pending.current = true;
    setBusyKey(key);
    setFeedback(null);
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!canEdit()) return;
        if (permission.status !== 'granted') throw new Error('Allow photo access in Settings to choose your portrait.');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.65,
      });
      if (!canEdit() || result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      setDraft(previous => previous.key === key
        ? { ...previous, asset, values: { ...previous.values, avatarUri: asset.uri } } : previous);
    } catch (error) {
      if (canEdit()) setFeedback({ key, message: `Photo unavailable. ${error instanceof Error ? error.message : 'Please choose the photo again.'}` });
    } finally {
      pending.current = false;
      if (mounted.current) setBusyKey(null);
    }
  }

  /** Save only edited local fields; copying a new photo must finish before the profile references it. */
  async function onSave() {
    if (!canEdit() || pending.current || !current.values.name.trim()) return;
    pending.current = true;
    setBusyKey(key);
    setFeedback(null);
    let prepared: string | null = null;
    let before: HomeState['profile'] | null = null;
    let writeScope: LocalSettingsWrite | null = null;
    const patch: Partial<HomeState['profile']> = {};
    try {
      for (const field of Object.keys(current.values) as Array<keyof Draft>) {
        if (field === 'email' && identity.mode !== 'demo') continue;
        if (current.values[field] !== current.initial[field]) {
          Object.assign(patch, { [field]: current.values[field].trim() });
        }
      }
      if (current.asset) {
        prepared = await prepareProfilePortrait(current.asset);
        patch.avatarUri = prepared;
      }
      if (!canEdit()) {
        if (prepared) await discardPreparedPortrait(prepared);
        return;
      }
      before = useHomeStore.getState().profile;
      writeScope = beginLocalSettingsWrite(localSettingsScopeKey(scope), 'profile', Object.keys(patch));
      await useHomeStore.getState().setProfile(patch);
      if (!isLocalSettingsScopeCurrent(scope, useHomeStore.getState())) return;
      // A durable save becomes the next baseline even if retiring an old photo fails.
      // Retrying must not copy the same asset again or republish already-saved fields.
      if (canEdit()) {
        const saved = profileDraft(useHomeStore.getState().profile);
        setDraft({ key, initial: saved, values: saved, asset: null });
      }
      // Retire only our old file after the replacement is durably saved, and never another member's photo.
      const oldUri = before.avatarUri;
      if (oldUri && patch.avatarUri !== undefined && oldUri !== patch.avatarUri
        && useHomeStore.getState().profile.avatarUri !== oldUri
        && !useHomeStore.getState().household.some(member => member.avatarUri === oldUri)) {
        try {
          await discardPreparedPortrait(oldUri);
        } catch {
          if (canEdit()) setFeedback({ key, message: 'Profile saved. Some old photo data could not be removed from this device.' });
          return;
        }
      }
      if (canEdit()) onSaved();
    } catch (error) {
      // Closing an editor stops feedback, not settlement of its already-started
      // account write. Shared field revisions protect a newer or reopened editor.
      if (before && isLocalSettingsScopeCurrent(scope, useHomeStore.getState())) {
        const latest = useHomeStore.getState().profile;
        const rollback: Partial<HomeState['profile']> = {};
        // Leave unrelated or newer settings alone when restoring an unsuccessful save.
        for (const field of Object.keys(patch) as Array<keyof typeof patch>) {
          if (writeScope?.isLatest(field) && latest[field] === patch[field]) Object.assign(rollback, { [field]: before[field] });
        }
        if (Object.keys(rollback).length) {
          try { await useHomeStore.getState().setProfile(rollback); } catch { /* The restored memory state remains accurate; a mounted editor reports recovery below. */ }
        }
      }
      // Once published, the former account's cache may reference this file even
      // if its save reports failure; a different account cannot authorize deletion.
      if (prepared && (!before || isLocalSettingsScopeCurrent(scope, useHomeStore.getState()))
        && useHomeStore.getState().profile.avatarUri !== prepared
        && !useHomeStore.getState().household.some(member => member.avatarUri === prepared)) {
        try { await discardPreparedPortrait(prepared); } catch { /* Do not replace the original save error with optional file cleanup. */ }
      }
      if (canEdit()) setFeedback({ key, message: `Profile not saved. ${error instanceof Error ? error.message : 'Please try saving again.'}` });
    } finally {
      writeScope?.finish();
      pending.current = false;
      if (mounted.current) setBusyKey(null);
    }
  }

  return {
    ...current.values, email: identity.mode === 'account' ? profile.email ?? '' : current.values.email,
    profileFeedback: feedback?.key === key ? feedback.message : null,
    profile, profileBusy: busyKey === key, canEditProfile: identity.mode !== 'unavailable',
    emailEditable: identity.mode === 'demo',
    setName: (value: string) => update('name', value),
    setEmail: (value: string) => update('email', value),
    setPhone: (value: string) => update('phone', value),
    setAvatarColor: (value: string) => update('avatarColor', value),
    setAvatarUri: (value: string) => update('avatarUri', value),
    setTimeFormat: (value: '12h' | '24h') => update('timeFormat', value),
    setTempUnit: (value: 'C' | 'F') => update('tempUnit', value),
    pickAvatar, onSave,
  };
}
