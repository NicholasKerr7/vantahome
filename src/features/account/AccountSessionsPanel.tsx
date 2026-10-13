import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DeepAction, DeepCard, DeepPager } from '../../components/deep/DeepScreen';
import { ProfileForm } from '../household/ProfileControls';
import { householdStyles as styles } from '../household/householdStyles';
import { theme } from '../../theme/theme';
import { useAccountIdentity } from './useAccountIdentity';
import { useAccountSessions } from './useAccountSessions';
import AccountSignOut from './AccountSignOut';
import type { AccountSession } from './accountSessions';

const LABELS: Record<AccountSession['deviceLabel'], string> = {
  ios: 'iPhone or iPad', android: 'Android', macos: 'Mac', windows: 'Windows', linux: 'Linux', unknown: 'App or browser',
};

/** Label server timestamps as sign-in/refresh evidence, never as physical presence. */
function formatSessionTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Unavailable';
}

/** A bounded security workspace with private sign-in inventory and deliberate session controls. */
export function AccountSessionsPanel() {
  const { scope } = useAccountIdentity();
  const model = useAccountSessions(scope);
  const [page, setPage] = useState(0);
  const sessions = model.snapshot?.sessions ?? [];
  const currentPage = Math.min(page, Math.max(0, sessions.length - 1));
  const session = sessions[currentPage];
  const otherCount = sessions.filter((item) => !item.isCurrent).length;
  return <View style={styles.body}>
    <DeepCard style={styles.fill}>
      <ProfileForm>
        <View style={styles.header}>
          <View style={styles.serviceIcon}><Ionicons name="shield-checkmark-outline" size={26} color={theme.colors.accentText} /></View>
          <View style={styles.heading}><Text style={styles.eyebrow}>ACCOUNT SECURITY</Text><Text accessibilityRole="header" style={styles.title}>Your sign-ins.</Text></View>
        </View>
        <Text style={styles.subtitle}>Review where your account is signed in. Keep access in your hands.</Text>
        {!model.eligible ? <Text style={styles.detail}>Session management is available when you sign in to the connected app. This local demo has no account sessions.</Text> : <>
          {model.loading && <Text accessibilityLiveRegion="polite" style={styles.detail}>Verifying your sign-ins…</Text>}
          {model.error && <Text accessibilityRole="alert" style={styles.detail}>{model.error}</Text>}
          {model.message && <Text accessibilityLiveRegion="polite" style={styles.detail}>{model.message}</Text>}
          {session && <View style={styles.layoutOverview}>
            <Ionicons name={session.deviceLabel === 'ios' || session.deviceLabel === 'android' ? 'phone-portrait-outline' : 'desktop-outline'} size={25} color={theme.colors.accentText} />
            <View style={styles.heading}>
              <Text style={styles.rowText}>{LABELS[session.deviceLabel]}</Text>
              <Text style={styles.availabilityStatus}>{session.isCurrent ? 'This session' : 'Other sign-in'}</Text>
              <Text style={styles.detail}>Signed in: {formatSessionTime(session.createdAt)}</Text>
              <Text style={styles.detail}>Session refreshed: {formatSessionTime(session.refreshedAt)}</Text>
              {session.expiresAt && <Text style={styles.detail}>Session deadline: {formatSessionTime(session.expiresAt)}</Text>}
            </View>
          </View>}
          {sessions.length > 1 && <DeepPager page={currentPage} pageCount={sessions.length} onChange={setPage} label="Sign-in" />}
          {model.snapshot && <Text style={styles.detail}>
            {sessions.length === 50 ? 'Showing up to 50 stored sign-ins. ' : ''}Device labels come from the sign-in request and may be imprecise. A stored sign-in does not mean a device is online.
          </Text>}
          {model.snapshot && <Text style={styles.detail}>Checked {new Date(model.snapshot.checkedAt).toLocaleTimeString()}. Refresh for the latest status.</Text>}
          {model.confirming && <View style={styles.section}>
            <Text style={styles.rowText}>Sign out all other sessions?</Text>
            <Text style={styles.detail}>They will need to sign in again. Existing access may continue until its current token expires. This session stays signed in.</Text>
          </View>}
        </>}
      </ProfileForm>
    </DeepCard>
    {model.eligible && <View style={styles.section}>
      <View style={styles.actions}>
        {model.confirming ? <>
          <DeepAction label="Cancel" disabled={model.busy} onPress={model.cancel} />
          <DeepAction label={model.busy ? 'Signing out…' : 'Confirm other-session sign-out'} primary disabled={model.busy} onPress={() => void model.confirmOtherSignOut()} />
        </> : <>
          <DeepAction label={model.loading ? 'Refreshing…' : 'Refresh sessions'} icon="refresh-outline" disabled={model.busy || model.loading} onPress={model.refresh} />
          {otherCount > 0 && <DeepAction label="Sign out other sessions" icon="log-out-outline" disabled={model.busy || model.loading} onPress={model.requestOtherSignOut} />}
        </>}
      </View>
      {!model.confirming && <AccountSignOut />}
    </View>}
  </View>;
}
