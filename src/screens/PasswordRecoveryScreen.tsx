import React, { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Pressable from '../components/Pressable';
import { AuthAction, AuthEntryFrame, AuthField, AuthMessage } from '../features/auth-entry/AuthEntryFrame';
import { supabase } from '../services/supabaseClient';
import { theme } from '../theme/theme';
import { completeInvitationPasswordSetup, waitForAuthExchange } from '../services/authFlow';
import { signOutAccount } from '../features/account/accountSession';
import { useHomeStore } from '../store/useHomeStore';

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
  const canSave = isValidRecoveryPassword(password, confirm) && !saving;

  /** Update only the account that opened this isolated screen, then release the home gate. */
  async function savePassword() {
    if (!supabase || !canSave || operation.current) return;
    const scope = useHomeStore.getState();
    operation.current = true; setSaving(true); setError('');
    try {
      await waitForAuthExchange();
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user || data.user.id !== scope.authenticatedUserId || useHomeStore.getState().sessionEpoch !== scope.sessionEpoch) throw new Error('Your account changed. Please sign in again.');
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      if (useHomeStore.getState().sessionEpoch !== scope.sessionEpoch) return;
      if (purpose === 'invitation') await completeInvitationPasswordSetup(data.user.id);
      if (useHomeStore.getState().sessionEpoch !== scope.sessionEpoch) return;
      onComplete();
    } catch {
      if (useHomeStore.getState().sessionEpoch === scope.sessionEpoch) setError('We could not save your password. Please try again or return to sign in.');
    } finally {
      operation.current = false; setSaving(false);
    }
  }

  /** End this local enrollment/recovery session before returning to account entry. */
  async function returnToSignIn() {
    if (operation.current) return;
    const scope = useHomeStore.getState();
    operation.current = true; setSaving(true); setError('');
    try {
      if (await signOutAccount(scope)) onComplete();
    } catch {
      if (useHomeStore.getState().sessionEpoch === scope.sessionEpoch) setError('We could not sign out on this device. Please try again.');
    } finally { operation.current = false; setSaving(false); }
  }

  return <AuthEntryFrame title={purpose === 'invitation' ? 'Make yourself at home.' : 'Set a new password'} subtitle={purpose === 'invitation' ? 'Your email is verified. Choose a password, then review the home you were invited to join.' : 'Choose at least eight characters. Your home stays protected while you reset your password.'}>
    <AuthField label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!saving} />
    <AuthField label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!saving} />
    {error && <AuthMessage message={error} error />}
    <AuthAction label={purpose === 'invitation' ? 'Save password & review invitation' : 'Update password'} disabled={!canSave} busy={saving} onPress={() => void savePassword()} />
    <Pressable style={styles.return} disabled={saving} onPress={() => void returnToSignIn()}><Text style={styles.returnText}>Return to sign in</Text></Pressable>
  </AuthEntryFrame>;
}

const styles = StyleSheet.create({
  return: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  returnText: { color: theme.colors.accentText, fontSize: 12 },
});
