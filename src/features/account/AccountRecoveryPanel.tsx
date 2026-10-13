import React from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DeepAction, DeepCard } from '../../components/deep/DeepScreen';
import { ProfileForm } from '../household/ProfileControls';
import { householdStyles as styles } from '../household/householdStyles';
import { theme } from '../../theme/theme';
import { useAccountIdentity } from './useAccountIdentity';
import { useAccountRecovery } from './useAccountRecovery';

/** Request password recovery only for the server-verified email of the signed-in person. */
export function AccountRecoveryPanel() {
  const { scope } = useAccountIdentity();
  const model = useAccountRecovery(scope);
  return <View style={styles.body}>
    <DeepCard style={styles.fill}>
      <ProfileForm>
        <View style={styles.header}>
          <View style={styles.serviceIcon}><Ionicons name="key-outline" size={26} color={theme.colors.accentText} /></View>
          <View style={styles.heading}><Text style={styles.eyebrow}>PASSWORD RECOVERY</Text><Text accessibilityRole="header" style={styles.title}>A secure way back.</Text></View>
        </View>
        <Text style={styles.subtitle}>Request a link to choose a new password for your account.</Text>
        {!model.eligible ? <Text style={styles.detail}>Sign in to the connected app to manage account recovery. This local demo cannot send recovery emails.</Text> : <>
          {model.loading && <Text accessibilityLiveRegion="polite" style={styles.detail}>Verifying your recovery email…</Text>}
          {model.error && <Text accessibilityRole="alert" style={styles.detail}>{model.error}</Text>}
          {model.message && <Text accessibilityLiveRegion="polite" style={styles.detail}>{model.message}</Text>}
          {model.email && <View style={styles.layoutOverview}>
            <Ionicons name="mail-outline" size={25} color={theme.colors.accentText} />
            <View style={styles.heading}><Text style={styles.label}>VERIFIED ACCOUNT EMAIL</Text><Text selectable style={styles.rowText}>{model.email}</Text></View>
          </View>}
          <Text style={styles.detail}>Open the newest recovery link on this device, in this app or the browser where you requested it. Requesting a link does not sign you out.</Text>
          <Text style={styles.detail}>Requesting an email does not confirm delivery or change your password. You will choose a new password after opening the link.</Text>
          {model.confirming && <View style={styles.section}>
            <Text style={styles.rowText}>Send a recovery email?</Text>
            <Text style={styles.detail}>The link will be requested for the verified address above. If you have already requested one, check your inbox before sending another.</Text>
          </View>}
        </>}
      </ProfileForm>
    </DeepCard>
    {model.eligible && <View style={styles.actions}>
      {model.confirming ? <>
        <DeepAction label="Cancel" disabled={model.busy} onPress={model.cancel} />
        <DeepAction label={model.busy ? 'Requesting email…' : 'Send recovery email'} primary disabled={model.busy} onPress={() => void model.confirmRecovery()} />
      </> : <>
        <DeepAction label={model.loading ? 'Refreshing…' : 'Refresh email'} icon="refresh-outline" disabled={model.busy || model.loading} onPress={model.refresh} />
        <DeepAction label="Review recovery email" icon="mail-outline" primary disabled={!model.email || model.busy || model.loading} onPress={model.requestReview} />
      </>}
    </View>}
  </View>;
}
