import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DeepAction, DeepPager } from '../../components/deep/DeepScreen';
import ModalCard from '../../components/ModalCard';
import ModalForm, { useModalViewportStyle } from '../../components/ModalForm';
import { SENT_INVITATIONS_LIMIT, type SentHomeInvitation } from '../../services/sentInvitations';
import { useHomeStore } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import { useSentInvitations } from './useSentInvitations';
import { isSentInvitationExpired, sentInvitationDate } from './sentInvitationPresentation';
import { sentInvitationStyles as styles } from './sentInvitationStyles';

const ROLE_LABELS = { admin: 'Admin', member: 'Member', guest: 'Guest', tenant: 'Tenant' } as const;

/** Show room names from the current home without suggesting an unavailable room grants access. */
function InvitationAccessSummary({ invitation }: { invitation: SentHomeInvitation }) {
  const rooms = useHomeStore(state => state.rooms);
  const limited = invitation.role === 'guest' || invitation.role === 'tenant';
  const roomNames = invitation.roomIds.map(id => rooms.find(room => room.id === id)?.name ?? 'Unavailable room');
  return <View style={styles.detailGroup}>
    <Text style={styles.label}>Invited room access</Text>
    <Text style={styles.value}>{limited
      ? roomNames.length ? roomNames.join(' · ') : 'No rooms assigned'
      : 'Whole home'}</Text>
    {invitation.role === 'guest' && <Text style={styles.detail}>{invitation.accessExpiresAt
      ? `Guest access ends ${sentInvitationDate(invitation.accessExpiresAt)}`
      : 'Guest access has no automatic expiry.'}</Text>}
  </View>;
}

/** Keep one invitation fully readable, with its email, role and actual server deadlines. */
function InvitationDetails({ invitation, now }: { invitation: SentHomeInvitation; now: number }) {
  const expired = isSentInvitationExpired(invitation, now);
  return <View style={styles.details}>
    <View style={styles.statusRow}>
      <View style={styles.badge}><Text style={styles.badgeText}>{ROLE_LABELS[invitation.role]}</Text></View>
      <Text style={styles.status}>{expired ? 'Expired' : 'Awaiting acceptance'}</Text>
    </View>
    <Text selectable style={styles.email}>{invitation.email}</Text>
    <View style={styles.detailGroup}>
      <Text style={styles.label}>Home</Text>
      <Text style={styles.value}>{invitation.homeName}</Text>
    </View>
    <InvitationAccessSummary invitation={invitation} />
    <View style={styles.detailGroup}>
      <Text style={styles.label}>Home invitation expires</Text>
      <Text style={styles.value}>{sentInvitationDate(invitation.expiresAt)}</Text>
      <Text style={styles.detail}>Email sign-in codes can expire sooner.</Text>
      <Text style={styles.detail}>Created {sentInvitationDate(invitation.createdAt)}</Text>
    </View>
    {expired && <Text style={styles.detail}>This invitation can no longer be accepted. It does not grant new access.</Text>}
  </View>;
}

/** Explain what is unavailable without inventing local or cached sent-invitation records. */
function InvitationAvailability({ available }: { available: boolean }) {
  return <View style={styles.empty}>
    <Ionicons name="mail-outline" size={32} color={theme.colors.accentText} />
    <Text accessibilityRole="header" style={styles.emptyTitle}>{available ? 'Invitation access unavailable' : 'Connect your household'}</Text>
    <Text style={styles.detail}>{available
      ? 'Sent invitations are available to the verified Owner and authorized Admins. Refresh home access if your role recently changed.'
      : 'Sent invitations are managed by your connected account. Local demo members do not send an email or create a pending invitation.'}</Text>
  </View>;
}

/** Present bounded sent-invitation navigation and an explicit, scoped revocation review. */
export function SentInvitationsPage() {
  const model = useSentInvitations();
  const [page, setPage] = useState(0);
  const viewportStyle = useModalViewportStyle();
  const currentPage = Math.min(page, Math.max(0, model.invitations.length - 1));
  const invitation = model.invitations[currentPage];
  const review = model.review;
  const busy = model.busy !== null;
  const expiredReview = review ? isSentInvitationExpired(review, model.now) : false;
  if (!model.available || !model.authorized) return <InvitationAvailability available={model.available} />;

  return <View style={styles.page}>
    <View style={styles.header}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Sent invitations</Text>
        <Text style={styles.detail}>{model.loaded ? `${model.invitations.length} pending or expired` : 'Current household'}</Text>
      </View>
      <DeepAction label={model.busy === 'load' ? 'Loading…' : model.error ? 'Retry' : 'Refresh'}
        accessibilityLabel={model.error ? 'Retry sent invitations' : 'Refresh sent invitations'}
        icon="refresh-outline" disabled={busy} onPress={() => void model.refresh()} />
    </View>
    <ScrollView style={styles.content} contentContainerStyle={styles.contentBody}
      showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled">
      {model.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{model.error}</Text>}
      {model.outcome && <Text accessibilityLiveRegion="polite" style={styles.notice}>{model.outcome}</Text>}
      {invitation ? <InvitationDetails invitation={invitation} now={model.now} /> : (
        <View style={styles.empty}>
          <Ionicons name={model.loaded ? 'mail-open-outline' : 'mail-outline'} size={32} color={theme.colors.accentText} />
          <Text style={styles.emptyTitle}>{model.busy === 'load' ? 'Checking invitations…' : model.loaded ? 'No pending invitations' : 'Invitations unavailable'}</Text>
          <Text style={styles.detail}>{model.loaded
            ? 'Invitations you can manage appear here until they are accepted, declined or revoked. Expired invitations remain visible.'
            : 'Refresh to load invitations verified by your household account.'}</Text>
        </View>
      )}
      {model.invitations.length === SENT_INVITATIONS_LIMIT && <Text style={styles.detail}>Showing the latest {SENT_INVITATIONS_LIMIT} invitations you can manage.</Text>}
    </ScrollView>
    {invitation && <View style={styles.footer}>
      <DeepAction label="Revoke invitation" icon="close-circle-outline"
        disabled={busy || Boolean(model.error) || !invitation.canCancel || isSentInvitationExpired(invitation, model.now)}
        onPress={() => model.reviewInvitation(invitation)} />
      <DeepPager label="sent invitations" page={currentPage} pageCount={model.invitations.length} onChange={setPage} />
    </View>}
    {review && <ModalCard visible animationType="none" onRequestClose={model.closeReview}
      backdropAccessibilityLabel="Close invitation review" colors={[theme.colors.glass, theme.colors.bg0]}
      cardStyle={[styles.sheet, viewportStyle]}>
      <ModalForm footer={<View style={styles.confirmActions}>
        <DeepAction label="Keep invitation" disabled={busy} onPress={model.closeReview} />
        <DeepAction label={model.busy === 'revoke' ? 'Revoking…' : 'Confirm revoke'} primary
          disabled={busy || expiredReview} onPress={() => void model.revoke()} />
      </View>}>
        <View style={styles.details}>
          <Text accessibilityRole="header" style={styles.title}>Revoke this invitation?</Text>
          <Text selectable style={styles.email}>{review.email}</Text>
          <Text style={styles.value}>{ROLE_LABELS[review.role]} · {review.homeName}</Text>
          <Text style={styles.detail}>The pending invitation will no longer be usable. Revoking does not remove an existing member, change their access, or resend an email.</Text>
          <Text style={styles.detail}>If they have already accepted, their membership stays in place. Manage it from Members.</Text>
          {expiredReview && <Text accessibilityRole="alert" style={styles.error}>This invitation has expired. Close this review and refresh its status.</Text>}
        </View>
      </ModalForm>
    </ModalCard>}
  </View>;
}
