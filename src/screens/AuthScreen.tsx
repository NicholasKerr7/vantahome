import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';
import Pressable from '../components/Pressable';
import { AuthAction, AuthEntryFrame, AuthField, AuthMessage } from '../features/auth-entry/AuthEntryFrame';
import { useAuthEntry, type AuthEntryProps } from '../features/auth-entry/useAuthEntry';
import { theme } from '../theme/theme';
import { INVITATION_CODE_MAX_LENGTH } from '../config/invitationCode';

WebBrowser.maybeCompleteAuthSession();

/** Present personal sign-in and invited access, with owner enrollment kept as an explicit path. */
export default function AuthScreen(props: AuthEntryProps) {
  const model = useAuthEntry(props);
  const { mode } = model;
  const ownerDetails = mode === 'owner' && !model.ownerPasswordStep;
  const title = mode === 'invite' ? 'You’re invited.' : mode === 'owner' ? 'A home of your own.' : mode === 'recovery' ? 'Find your way back.' : 'Welcome home.';
  const subtitle = mode === 'invite' ? 'Enter the email and one-time code from your invitation. You will review your access before joining.'
    : mode === 'owner' ? 'Create your personal account, then set up your home. Joining someone else? Accept their invitation instead.'
    : mode === 'recovery' ? 'We’ll send a password reset link to your account email.' : 'Your space, ready when you are. Sign in to your personal account.';
  const action = mode === 'invite' ? 'Verify invitation' : mode === 'owner' ? 'Create account' : mode === 'recovery' ? 'Send reset link' : 'Sign in';

  return <AuthEntryFrame title={title} subtitle={subtitle} preview={props.preview} onClose={model.busy ? undefined : props.onClose}>
    {(mode === 'login' || mode === 'invite') && <View style={styles.tabs}>
      {(['login', 'invite'] as const).map((entry) => <Pressable key={entry} style={[styles.tab, mode === entry && styles.selected]} onPress={() => model.chooseMode(entry)} disabled={model.busy} accessibilityRole="tab" accessibilityState={{ selected: mode === entry, disabled: model.busy }}>
        <Text style={[styles.tabText, mode === entry && styles.selectedText]}>{entry === 'login' ? 'Sign in' : 'Accept invitation'}</Text>
      </Pressable>)}
    </View>}
    {ownerDetails && <AuthField label="Your name" value={model.name} onChangeText={model.setName} autoComplete="name" maxLength={120} editable={!model.busy} />}
    {(!model.ownerPasswordStep || mode !== 'owner') && <AuthField label="Email" value={model.email} onChangeText={model.setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={320} editable={!model.busy} />}
    {mode === 'invite' && <AuthField label="Invitation code" value={model.code} onChangeText={model.setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={INVITATION_CODE_MAX_LENGTH} editable={!model.busy} />}
    {(mode === 'login' || (mode === 'owner' && model.ownerPasswordStep)) && <>
      <AuthField label={mode === 'login' ? 'Password' : 'Create password'} value={model.password} onChangeText={model.setPassword} autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} secureTextEntry editable={!model.busy} />
      {mode === 'owner' && <><AuthField label="Confirm password" value={model.confirm} onChangeText={model.setConfirm} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" secureTextEntry editable={!model.busy} /><Text style={styles.hint}>Use at least eight characters.</Text></>}
    </>}
    {model.notice && <AuthMessage message={model.notice.text} error={model.notice.error} />}
    {!model.configured && !props.preview && <AuthMessage message="Account sign-in is not available in this build. Please use the configured VantaHome app." />}
    {ownerDetails
      ? <AuthAction label="Continue" onPress={model.continueOwnerSetup} disabled={!model.detailsValid || model.busy} />
      : <AuthAction label={action} onPress={() => void model.submit()} disabled={!model.canSubmit} busy={model.busy} />}
    {mode === 'login' && <>
      <Pressable style={styles.textAction} disabled={model.busy} onPress={() => model.chooseMode('recovery')}><Text style={styles.link}>Forgot password?</Text></Pressable>
      {(model.providers.apple || model.providers.google) && <View style={styles.providers}>
        {(['apple', 'google'] as const).filter((provider) => model.providers[provider]).map((provider) => <Pressable key={provider} style={styles.provider} disabled={model.busy} onPress={() => void model.signInWithProvider(provider)} accessibilityLabel={`Continue with ${provider === 'apple' ? 'Apple' : 'Google'}`}>
          <Ionicons name={provider === 'apple' ? 'logo-apple' : 'logo-google'} size={18} color={theme.colors.text} /><Text style={styles.link}>{provider === 'apple' ? 'Apple' : 'Google'}</Text>
        </Pressable>)}
      </View>}
      <Pressable style={styles.textAction} disabled={model.busy} onPress={() => model.chooseMode('owner')}><Text style={styles.link}>Set up a new home</Text></Pressable>
    </>}
    {mode === 'invite' && <Pressable style={styles.textAction} disabled={model.busy} onPress={() => model.chooseMode('login')}><Text style={styles.link}>Already have an account? Sign in</Text></Pressable>}
    {(mode === 'owner' || mode === 'recovery') && <Pressable style={styles.textAction} disabled={model.busy} onPress={() => mode === 'owner' && model.ownerPasswordStep ? model.setOwnerPasswordStep(false) : model.chooseMode('login')}><Text style={styles.link}>{mode === 'owner' && model.ownerPasswordStep ? 'Back to your details' : 'Back to sign in'}</Text></Pressable>}
  </AuthEntryFrame>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderRadius: theme.radius.sm, padding: 4, backgroundColor: theme.colors.overlay },
  tab: { flex: 1, minHeight: 42, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', borderRadius: 11 },
  selected: { backgroundColor: theme.colors.accent },
  tabText: { color: theme.colors.subtext, fontSize: 12, fontWeight: '500' },
  selectedText: { color: theme.colors.bg0 },
  textAction: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  link: { color: theme.colors.accentText, fontSize: 12, textAlign: 'center' },
  hint: { color: theme.colors.subtext, fontSize: 11 },
  providers: { flexDirection: 'row', gap: 10 },
  provider: { flex: 1, minHeight: 44, borderRadius: theme.radius.sm, backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.stroke, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
});
