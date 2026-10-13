import React from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../../app/AppNavigator';
import CinematicSurface from '../../components/CinematicSurface';
import Pressable from '../../components/Pressable';
import AvatarChip from '../../components/AvatarChip';
import { theme } from '../../theme/theme';
import { useAccountIdentity } from './useAccountIdentity';
import { useAccountDetails } from './useAccountDetails';
import AccountSignOut from './AccountSignOut';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Present a single, labeled account destination with a comfortable touch target. */
function AccountAction({ title, detail, icon, onPress }: { title: string; detail: string; icon: IconName; onPress: () => void }) {
  return <Pressable style={styles.action} onPress={onPress} accessibilityLabel={title} accessibilityHint={detail}>
    <View style={styles.actionIcon}><Ionicons name={icon} size={20} color={theme.colors.accentText} /></View>
    <View style={styles.flexCopy}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionDetail}>{detail}</Text></View>
    <Ionicons name="chevron-forward" size={16} color={theme.colors.subtext} />
  </Pressable>;
}

/** Reveal truthful account and household identity while keeping the property loaded underneath. */
export default function AccountSheet({ onClose, onPreferences }: { onClose: () => void; onPreferences?: () => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 600;
  const { identity, scope } = useAccountIdentity();
  const details = useAccountDetails(scope, identity.homeId);
  const demo = identity.mode === 'demo';

  /** Close the sheet before routing to an existing focused profile section. */
  function openProfile(section: 'identity' | 'household' | 'preferences' | 'security') {
    onClose();
    navigation.navigate('Profile', { section });
  }

  /** Open personal controls directly, with the existing profile page as a standalone fallback. */
  function openPreferences() {
    if (onPreferences) onPreferences();
    else openProfile('preferences');
  }

  /** Preview account entry without creating a session or claiming demo access is authenticated. */
  function previewAccountEntry() {
    onClose();
    navigation.navigate('AccountEntry');
  }

  return <Modal transparent visible animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={[styles.overlay, tablet ? styles.tabletOverlay : styles.phoneOverlay]}>
      <CinematicSurface style={styles.panel}>
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={styles.content}>
          <View style={styles.heading}>
            <View style={styles.flexCopy}><Text style={styles.eyebrow}>VANTAHOME / PERSONAL SPACE</Text><Text accessibilityRole="header" style={styles.title}>Your account</Text></View>
            <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close account"><Ionicons name="close" size={23} color={theme.colors.text} /></Pressable>
          </View>
          <ScrollView bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            <View style={styles.identity}>
              <AvatarChip name={identity.name} initials={identity.initials} size={60} decorative
                uri={identity.avatarUri ?? undefined} color={identity.avatarColor ?? undefined}
                fallback={demo ? 'person' : 'initials'} />
              <View style={styles.flexCopy}>
                <Text style={styles.person}>{identity.name}</Text>
                <Text style={styles.subtitle}>{demo ? 'Local preview · no account signed in' : identity.mode === 'account' ? 'Signed-in account' : 'No verified account is available'}</Text>
              </View>
            </View>
            {demo ? <View style={styles.notice}><Text style={styles.noticeText}>Explore your home with a local demo profile. Household invitations and account access become available in the connected app.</Text></View>
              : identity.mode === 'account' && <View style={styles.accountDetails}>
                <View style={styles.detailRow}>
                  <Ionicons name="mail-outline" size={18} color={theme.colors.accentText} />
                  <View style={styles.flexCopy}><Text style={styles.detailLabel}>ACCOUNT EMAIL</Text><Text style={styles.detailValue}>{details.email ?? (details.loading ? 'Verifying account…' : 'Email unavailable')}</Text>
                    {details.email && !details.emailConfirmed && <Text style={styles.actionDetail}>Email confirmation pending</Text>}
                  </View>
                  {details.loading && <ActivityIndicator size="small" color={theme.colors.accentText} accessibilityLabel="Refreshing account details" />}
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Ionicons name="home-outline" size={18} color={theme.colors.accentText} />
                  <View style={styles.flexCopy}><Text style={styles.detailLabel}>CURRENT HOME</Text><Text style={styles.detailValue}>{details.homeName ?? (identity.homeId ? 'Your connected home' : 'Home access is being verified')}</Text>
                  </View>
                  {identity.role && <View style={styles.roleBadge}><Text style={styles.roleText}>{identity.role}</Text></View>}
                </View>
              </View>}
            {details.error && <View style={styles.notice} accessibilityLiveRegion="polite"><Text style={styles.noticeText}>{details.error}</Text><Pressable onPress={details.retry} style={styles.retry} accessibilityLabel="Retry account details"><Text style={styles.retryText}>Try again</Text></Pressable></View>}
            {identity.mode !== 'unavailable' && <View style={styles.actions}>
              <AccountAction title="Preferences" detail="Motion, cinematic tour and personal comfort" icon="options-outline" onPress={openPreferences} />
              <AccountAction title={demo ? 'Demo profile' : 'Profile'} detail="Your name, portrait and personal details" icon="person-circle-outline" onPress={() => openProfile('identity')} />
              {!demo && identity.homeId && <AccountAction title="Household" detail="People and permissions in this home" icon="people-outline" onPress={() => openProfile('household')} />}
              {!demo && identity.homeId && <AccountAction title="Security & sessions" detail="Review sign-ins and sign out other sessions" icon="shield-checkmark-outline" onPress={() => openProfile('security')} />}
              {demo && <AccountAction title="Preview account access" detail="Explore sign-in, invitations and owner setup" icon="key-outline" onPress={previewAccountEntry} />}
            </View>}
            {identity.mode === 'account' && <AccountSignOut onComplete={onClose} />}
          </ScrollView>
        </View>
      </CinematicSurface>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, padding: 14, backgroundColor: theme.colors.overlayStrong },
  tabletOverlay: { alignItems: 'flex-end', justifyContent: 'flex-start' },
  phoneOverlay: { alignItems: 'center', justifyContent: 'flex-end' },
  panel: { width: '100%', maxWidth: 440, maxHeight: '100%', borderRadius: 28, borderWidth: 1, borderColor: theme.colors.stroke },
  content: { flexShrink: 1, maxHeight: '100%' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: theme.colors.stroke },
  flexCopy: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { color: theme.colors.accentText, fontSize: 9, lineHeight: 13, letterSpacing: 1.3, fontWeight: '600' },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '500', color: theme.colors.text, letterSpacing: -0.6 },
  close: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.stroke, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, gap: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  person: { fontSize: 22, fontWeight: '500', color: theme.colors.text, letterSpacing: -0.5 },
  subtitle: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  notice: { gap: 6, padding: 14, borderRadius: 16, backgroundColor: theme.colors.card2 },
  noticeText: { color: theme.colors.subtext, fontSize: 12, lineHeight: 19 },
  accountDetails: { padding: 14, gap: 14, borderRadius: 19, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card2 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailLabel: { color: theme.colors.accentText, fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  detailValue: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  divider: { height: 1, backgroundColor: theme.colors.stroke },
  roleBadge: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: theme.colors.card },
  roleText: { color: theme.colors.accentText, fontSize: 10, fontWeight: '600' },
  actions: { gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10, minHeight: 64, borderRadius: 17, borderWidth: 1, borderColor: theme.colors.stroke },
  actionIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: theme.colors.card2 },
  actionTitle: { color: theme.colors.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  actionDetail: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16 },
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  retryText: { color: theme.colors.accentText, fontSize: 12, fontWeight: '600' },
});
