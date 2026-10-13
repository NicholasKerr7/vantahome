import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text } from 'react-native';
import Pressable from '../components/Pressable';
import { AuthAction, AuthEntryFrame, AuthField, AuthMessage } from '../features/auth-entry/AuthEntryFrame';
import { supabase } from '../services/supabaseClient';
import { theme } from '../theme/theme';
import { completeInvitationPasswordSetup, waitForAuthExchange } from '../services/authFlow';
import { signOutAccount } from '../features/account/accountSession';
import { useHomeStore } from '../store/useHomeStore';
import { capturePasswordRecoverySetup, completePasswordRecoverySetup, type PasswordRecoveryCompletion } from '../services/passwordRecoverySetup';
import { updateAccountPassword } from '../services/accountPasswordUpdate';

type SavedPassword = { userId: string; epoch: number; recovery: PasswordRecoveryCompletion | null };

/** Require a matching recovery password before enabling the update action. */
export function isValidRecoveryPassword(password: string, confirm: string) {
  return password.length >= 8 && password === confirm;
}

/** Keep invitation enrollment and account recovery isolated until password setup succeeds. */
export default function PasswordRecoveryScreen({ onComplete, purpose = 'recovery' }: {
  onComplete: () => void; purpose?: 'recovery' | 'invitation';
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(false);
  const mounted = useRef(true);
  const active = useRef(AppState.currentState !== 'background');
  const generation = useRef(0);
  const identity = useRef({ userId: useHomeStore.getState().authenticatedUserId, epoch: useHomeStore.getState().sessionEpoch });
  const identityInvalidated = useRef(false);
  const [savedPassword, setSavedPassword] = useState<SavedPassword | null>(null);
  const canSave = isValidRecoveryPassword(password, confirm) && !saving;

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'background') generation.current += 1;
      if (next !== 'inactive') active.current = next === 'active';
    });
    const stopIdentity = useHomeStore.subscribe(state => {
      if (state.authenticatedUserId !== identity.current.userId || state.sessionEpoch !== identity.current.epoch) {
        identityInvalidated.current = true;
        generation.current += 1;
      }
    });
    return () => { mounted.current = false; generation.current += 1; subscription.remove(); stopIdentity(); };
  }, []);

  /** Distinguish a saved password from permission to release this screen's current account. */
  function isCurrent(userId: string | null, epoch: number, expectedGeneration?: number) {
    const current = useHomeStore.getState();
    return mounted.current && !identityInvalidated.current && active.current && identity.current.userId === userId && identity.current.epoch === epoch
      && current.authenticatedUserId === userId && current.sessionEpoch === epoch
      && (expectedGeneration === undefined || generation.current === expectedGeneration);
  }

  /** Finish only the reviewed credential task; a newer recovery remains protected. */
  async function finishSavedPassword(saved: SavedPassword, expectedGeneration: number) {
    if (!isCurrent(saved.userId, saved.epoch, expectedGeneration)) return;
    if (purpose === 'invitation') await completeInvitationPasswordSetup(saved.userId);
    else if (saved.recovery && !await completePasswordRecoverySetup(saved.recovery)) {
      throw new Error('A newer recovery is waiting.');
    }
    if (isCurrent(saved.userId, saved.epoch, expectedGeneration)) onComplete();
  }

  /** Update only the account that opened this isolated screen, then release the home gate. */
  async function savePassword() {
    if (!supabase || !canSave || operation.current) return;
    const scope = useHomeStore.getState();
    const expectedGeneration = generation.current;
    if (!isCurrent(scope.authenticatedUserId, scope.sessionEpoch, expectedGeneration)) return;
    operation.current = true; setSaving(true); setError('');
    let updateConfirmed = false;
    try {
      await waitForAuthExchange();
      if (!isCurrent(scope.authenticatedUserId, scope.sessionEpoch, expectedGeneration)) return;
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user || data.user.id !== scope.authenticatedUserId || !isCurrent(scope.authenticatedUserId, scope.sessionEpoch, expectedGeneration)) throw new Error('Your account changed. Please sign in again.');
      const recovery = purpose === 'recovery' ? await capturePasswordRecoverySetup(data.user.id, data.user.email ?? '') : null;
      if (!isCurrent(scope.authenticatedUserId, scope.sessionEpoch, expectedGeneration)) return;
      await updateAccountPassword(scope, password, () => isCurrent(scope.authenticatedUserId, scope.sessionEpoch, expectedGeneration));
      updateConfirmed = true;
      if (!mounted.current || useHomeStore.getState().authenticatedUserId !== scope.authenticatedUserId || useHomeStore.getState().sessionEpoch !== scope.sessionEpoch) return;
      const saved = { userId: data.user.id, epoch: scope.sessionEpoch, recovery };
      setPassword(''); setConfirm(''); setSavedPassword(saved);
      await finishSavedPassword(saved, expectedGeneration);
    } catch {
      if (mounted.current && useHomeStore.getState().sessionEpoch === scope.sessionEpoch) setError(updateConfirmed
        ? 'Your password was saved, but setup is still pending. Continue or return to sign in.'
        : 'We could not confirm your password update. Try signing in with your new password, or request a new recovery email.');
    } finally {
      operation.current = false; if (mounted.current) setSaving(false);
    }
  }

  /** Require an explicit foreground continuation after an already-sent update completed in the background. */
  async function continueAfterSave() {
    if (!savedPassword || operation.current || !isCurrent(savedPassword.userId, savedPassword.epoch)) return;
    operation.current = true; setSaving(true); setError('');
    try { await finishSavedPassword(savedPassword, generation.current); }
    catch { if (mounted.current) setError('Your password was saved, but setup is still pending. Try again or return to sign in.'); }
    finally { operation.current = false; if (mounted.current) setSaving(false); }
  }

  /** End this local enrollment/recovery session before returning to account entry. */
  async function returnToSignIn() {
    if (operation.current || !isCurrent(identity.current.userId, identity.current.epoch)) return;
    const scope = useHomeStore.getState();
    const expectedGeneration = generation.current;
    operation.current = true; setSaving(true); setError('');
    try {
      let recovery: PasswordRecoveryCompletion | null = null;
      if (purpose === 'recovery' && supabase) {
        // A failed continuity read must not prevent deliberate local sign-out.
        // Keep unreadable records intact rather than deleting an unknown request.
        try {
          const verified = await supabase.auth.getUser();
          if (!isCurrent(scope.authenticatedUserId, scope.sessionEpoch, expectedGeneration)) return;
          if (!verified.error && verified.data.user?.id === scope.authenticatedUserId) {
            recovery = await capturePasswordRecoverySetup(verified.data.user.id, verified.data.user.email ?? '');
          }
        } catch { recovery = null; }
      }
      if (!isCurrent(scope.authenticatedUserId, scope.sessionEpoch, expectedGeneration)) return;
      if (await signOutAccount(scope)) {
        if (recovery) await completePasswordRecoverySetup(recovery);
        if (mounted.current && generation.current === expectedGeneration
          && useHomeStore.getState().authenticatedUserId === scope.authenticatedUserId
          && useHomeStore.getState().sessionEpoch === scope.sessionEpoch) onComplete();
      }
    } catch {
      if (mounted.current && useHomeStore.getState().sessionEpoch === scope.sessionEpoch) setError('We could not sign out on this device. Please try again.');
    } finally { operation.current = false; if (mounted.current) setSaving(false); }
  }

  return <AuthEntryFrame title={purpose === 'invitation' ? 'Make yourself at home.' : 'Set a new password'} subtitle={purpose === 'invitation' ? 'Your email is verified. Choose a password, then review the home you were invited to join.' : 'Choose at least eight characters. Your home stays protected while you reset your password.'}>
    {!savedPassword && <><AuthField label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!saving} />
    <AuthField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!saving} /></>}
    {error && <AuthMessage message={error} error />}
    {savedPassword ? <><AuthMessage message="Your password was saved. Continue to finish account setup." /><AuthAction label="Continue to your account" disabled={saving} busy={saving} onPress={() => void continueAfterSave()} /></>
      : <AuthAction label={purpose === 'invitation' ? 'Save password & review invitation' : 'Update password'} disabled={!canSave} busy={saving} onPress={() => void savePassword()} />}
    <Pressable style={styles.return} disabled={saving} onPress={() => void returnToSignIn()}><Text style={styles.returnText}>Return to sign in</Text></Pressable>
  </AuthEntryFrame>;
}

const styles = StyleSheet.create({
  return: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  returnText: { color: theme.colors.accentText, fontSize: 12 },
});
