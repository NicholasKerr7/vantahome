import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DeepAction } from '../../components/deep/DeepScreen';
import { theme } from '../../theme/theme';
import { useHomeStore } from '../../store/useHomeStore';
import { useAccountIdentity } from './useAccountIdentity';
import { isAccountScopeCurrent, type AccountScope } from './accountIdentity';
import { signOutAccount } from './accountSession';

/** Use one rendered, account-scoped confirmation on native and web account surfaces. */
export default function AccountSignOut({ onComplete }: { onComplete?: () => void }) {
  const { identity, scope } = useAccountIdentity();
  const [confirmation, setConfirmation] = useState<AccountScope | null>(null);
  const [error, setError] = useState<{ scope: AccountScope; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const confirmed = confirmation && isAccountScopeCurrent(confirmation, scope);

  /** Bind the second tap to the identity originally reviewed, never a later signed-in account. */
  async function confirm() {
    if (!mounted.current || !confirmation || !confirmed || pending.current
      || !isAccountScopeCurrent(confirmation, useHomeStore.getState())) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const complete = await signOutAccount(confirmation);
      if (mounted.current && complete) onComplete?.();
      else if (mounted.current && isAccountScopeCurrent(confirmation, useHomeStore.getState())) {
        setError({ scope: confirmation, message: 'Your session changed. Reopen your account and try again.' });
      }
    } catch {
      if (mounted.current && isAccountScopeCurrent(confirmation, useHomeStore.getState())) {
        setError({ scope: confirmation, message: 'Sign-out could not finish. Please try again.' });
      }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }

  if (identity.mode !== 'account') return <Text style={styles.detail}>No signed-in account on this device.</Text>;
  return <View style={styles.section}>
    {confirmed && <Text style={styles.detail}>Sign out on this device? You’ll need to sign in again to access your home.</Text>}
    {error && isAccountScopeCurrent(error.scope, scope) && <Text accessibilityRole="alert" style={styles.detail}>{error.message}</Text>}
    <View style={styles.actions}>
      {confirmed && <DeepAction label="Cancel" disabled={busy} onPress={() => { setConfirmation(null); setError(null); }} />}
      <DeepAction label={busy && confirmed ? 'Signing out…' : confirmed ? 'Sign out this device' : 'Sign out'} icon="log-out-outline"
        accessibilityLabel={confirmed ? 'Confirm sign out on this device' : 'Sign out'} disabled={busy}
        onPress={confirmed ? () => void confirm() : () => { setConfirmation(scope); setError(null); }} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detail: { color: theme.colors.subtext, fontSize: 12, lineHeight: 19 },
});
