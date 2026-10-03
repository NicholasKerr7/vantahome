import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import CinematicSurface from '../../components/CinematicSurface';
import Pressable from '../../components/Pressable';
import VantaHomeMark from '../../components/VantaHomeMark';
import type { HomeInvite } from '../../services/cloudRegistry';
import { theme } from '../../theme/theme';
import { useHomeAccess } from './useHomeAccess';
import { invitationExpiryLabel, isInvitationExpired } from './invitationExpiry';

type Props = {
  userId: string;
  email?: string;
  onComplete: () => void;
  onContinue?: () => void;
};

type InvitationCardProps = {
  invite: HomeInvite;
  disabled: boolean;
  busy: boolean;
  onRespond: (invite: HomeInvite, action: 'accept' | 'decline') => Promise<void>;
};

/** Show each server-issued invitation with separate, clearly labelled accept and decline actions. */
function InvitationCard({ invite, disabled, busy, onRespond }: InvitationCardProps) {
  const role = invite.role === 'admin' ? 'an administrator' : `a ${invite.role}`;
  const expired = isInvitationExpired(invite);
  const expiryLabel = invitationExpiryLabel(invite);
  return <View style={styles.invitation}>
    <Text style={styles.inviteTitle}>{invite.home_name}</Text>
    <Text style={styles.body}>
      Join as {role}{invite.room_ids.length ? ` · ${invite.room_ids.length} assigned ${invite.room_ids.length === 1 ? 'room' : 'rooms'}` : ''}
    </Text>
    {expiryLabel && <Text style={styles.expiry}>{expiryLabel}</Text>}
    <View style={styles.actions}>
      <Pressable
        accessibilityLabel={`Accept invitation to ${invite.home_name}`}
        style={[styles.primary, styles.actionFlex, (disabled || expired) && styles.disabled]}
        disabled={disabled || expired}
        onPress={() => { void onRespond(invite, 'accept'); }}
      >
        {busy ? <ActivityIndicator color={theme.colors.bg0} /> : <Text style={styles.primaryText}>Accept invitation</Text>}
      </Pressable>
      <Pressable
        accessibilityLabel={`Decline invitation to ${invite.home_name}`}
        style={styles.secondary}
        disabled={disabled}
        onPress={() => { void onRespond(invite, 'decline'); }}
      >
        <Text style={styles.secondaryText}>Decline</Text>
      </Pressable>
    </View>
  </View>;
}

/** Offer verified invitations and deliberate owner setup before any household controls mount. */
export default function HomeAccessScreen({ userId, email, onComplete, onContinue }: Props) {
  const access = useHomeAccess({ userId, onComplete });
  const [creating, setCreating] = useState(false);
  const [homeName, setHomeName] = useState('');
  const disabled = access.loading || Boolean(access.busy);
  const mutationDisabled = disabled || access.finishingHome;
  return (
    <CinematicSurface style={styles.root}>
      <SafeAreaView style={styles.root}>
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            decelerationRate="normal"
          >
            <View style={styles.shell}>
              <View style={styles.brand}>
                <VantaHomeMark size={48} decorative />
                <Text style={styles.wordmark}>VANTAHOME</Text>
              </View>
              <View style={styles.heading}>
                <Text style={styles.eyebrow}>YOUR PRIVATE SPACE</Text>
                <Text accessibilityRole="header" style={styles.title}>A home that knows you.</Text>
                <Text style={styles.subtitle}>Accept a household invitation or set up a home of your own.</Text>
              </View>
              <View style={styles.identity}>
                <Ionicons name="person-circle-outline" size={23} color={theme.colors.accentText} />
                <View style={styles.identityText}>
                  <Text style={styles.smallLabel}>SIGNED IN AS</Text>
                  <Text style={styles.email}>{email || 'Your verified account'}</Text>
                </View>
              </View>
              <View style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.sectionHeading}>
                    <Ionicons name="mail-open-outline" size={22} color={theme.colors.accentText} />
                    <Text accessibilityRole="header" style={styles.sectionTitle}>Your invitations</Text>
                  </View>
                  <Pressable accessibilityLabel="Refresh invitations" disabled={disabled} onPress={() => { void access.reload(); }} style={styles.iconButton}>
                    <Ionicons name="refresh-outline" size={21} color={theme.colors.accentText} />
                  </Pressable>
                </View>
                {access.loading && <View style={styles.loading} accessibilityLiveRegion="polite">
                  <ActivityIndicator color={theme.colors.accent} />
                  <Text style={styles.body}>{access.finishingHome ? 'Confirming your home access…' : 'Checking your invitations…'}</Text>
                </View>}
                {!access.loading && access.invites.length === 0 && !access.error && <Text style={styles.body}>
                  No pending invitations for this account. Ask your home owner to invite the email shown above.
                </Text>}
                {!access.loading && access.invites.map((invite) => (
                  <InvitationCard
                    key={invite.id}
                    invite={invite}
                    disabled={mutationDisabled}
                    busy={access.busy === invite.id}
                    onRespond={access.respond}
                  />
                ))}
                {access.error && <View accessibilityRole="alert" style={styles.message}>
                  <Text style={styles.messageText}>{access.error}</Text>
                  <Pressable disabled={disabled} onPress={() => { void access.reload(); }} style={styles.retry}>
                    <Text style={styles.secondaryText}>Retry</Text>
                  </Pressable>
                </View>}
                {access.notice && <Text accessibilityLiveRegion="polite" style={styles.body}>{access.notice}</Text>}
              </View>
              {!onContinue && creating && <View style={styles.card}>
                <View style={styles.sectionHeading}>
                  <Ionicons name="home-outline" size={22} color={theme.colors.accentText} />
                  <Text accessibilityRole="header" style={styles.sectionTitle}>Make it your home</Text>
                </View>
                <Text style={styles.body}>Name your household. You can invite family and guests once it is ready.</Text>
                  <Text style={styles.fieldLabel}>Home name</Text>
                  <TextInput
                    accessibilityLabel="Home name"
                    placeholder="e.g. Hopewell"
                    placeholderTextColor={theme.colors.muted}
                    value={homeName}
                    onChangeText={setHomeName}
                    maxLength={80}
                    editable={!mutationDisabled}
                    returnKeyType="done"
                    onSubmitEditing={() => { if (!mutationDisabled) void access.createHome(homeName); }}
                    style={styles.input}
                  />
                  <Pressable
                    style={[styles.primary, (!homeName.trim() || mutationDisabled) && styles.disabled]}
                    disabled={!homeName.trim() || mutationDisabled}
                    onPress={() => { void access.createHome(homeName); }}
                  >
                    {access.busy === 'create' ? <ActivityIndicator color={theme.colors.bg0} /> : <Text style={styles.primaryText}>Create my home</Text>}
                  </Pressable>
              </View>}
              {!onContinue && !creating && <Pressable disabled={mutationDisabled} style={styles.setup} onPress={() => setCreating(true)}>
                <View style={styles.identityText}>
                  <Text style={styles.secondaryText}>Set up my home</Text>
                  <Text style={styles.body}>Create a household for your own property.</Text>
                </View>
                <Ionicons name="arrow-forward" size={19} color={theme.colors.accentText} />
              </Pressable>}
              {onContinue && <Pressable style={styles.primary} disabled={mutationDisabled} onPress={onContinue}>
                <Text style={styles.primaryText}>Return to my home</Text>
              </Pressable>}
              <Pressable style={styles.signOut} disabled={access.busy === 'signout'} onPress={() => { void access.signOut(); }}>
                <Text style={styles.footerText}>{access.busy === 'signout' ? 'Signing out…' : 'Sign out'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </CinematicSurface>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  shell: { width: '100%', maxWidth: 520, gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wordmark: { color: theme.colors.text, fontSize: 16, fontWeight: '600', letterSpacing: 2 },
  heading: { gap: 10 },
  eyebrow: { color: theme.colors.accentText, fontSize: 10, fontWeight: '700', letterSpacing: 2.1 },
  title: { color: theme.colors.text, fontSize: 32, fontWeight: '500', letterSpacing: -1 },
  subtitle: { color: theme.colors.subtext, fontSize: 15, lineHeight: 23 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  identityText: { flex: 1, gap: 4 },
  smallLabel: { color: theme.colors.muted, fontSize: 9, letterSpacing: 1.5, fontWeight: '600' },
  email: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 24, padding: 20, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionHeading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { flexShrink: 1, color: theme.colors.text, fontSize: 18, fontWeight: '500' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginVertical: -8, marginRight: -8 },
  loading: { gap: 12, alignItems: 'center', paddingVertical: 16 },
  body: { color: theme.colors.subtext, fontSize: 13, lineHeight: 21 },
  expiry: { color: theme.colors.muted, fontSize: 11, lineHeight: 17 },
  invitation: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.stroke },
  inviteTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  primary: { minHeight: 48, borderRadius: 15, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12 },
  actionFlex: { flexGrow: 1 },
  primaryText: { color: theme.colors.bg0, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  secondary: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  secondaryText: { color: theme.colors.accentText, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  message: { borderLeftWidth: 2, borderLeftColor: theme.colors.ember, paddingLeft: 12, gap: 4 },
  messageText: { color: theme.colors.text, lineHeight: 21, fontSize: 13 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 18 },
  fieldLabel: { color: theme.colors.subtext, fontSize: 12, fontWeight: '600' },
  input: { minHeight: 50, color: theme.colors.text, backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 15, paddingHorizontal: 15, fontSize: 15 },
  setup: { minHeight: 68, paddingHorizontal: 18, paddingVertical: 12, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  signOut: { minHeight: 44, alignSelf: 'center', paddingHorizontal: 24, justifyContent: 'center' },
  footerText: { color: theme.colors.subtext, fontSize: 13 },
});
