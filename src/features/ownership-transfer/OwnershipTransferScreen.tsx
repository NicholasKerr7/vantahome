import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../app/AppNavigator';
import { openHomeFeature } from '../../app/homeNavigation';
import { DeepAction, DeepCard, DeepPager, DeepScreen } from '../../components/deep/DeepScreen';
import ScrollableCardPages from '../../components/ScrollableCardPages';
import { formatGuestAccessDeadline as formatHouseholdDeadline } from '../../security/guestAccessExtension';
import { householdStyles } from '../household/householdStyles';
import { useControllerFocused } from '../three-d-home/useControllerFocused';
import { theme } from '../../theme/theme';
import { useOwnershipTransfer } from './useOwnershipTransfer';

type Model = ReturnType<typeof useOwnershipTransfer>;
type Candidate = Model['candidates'][number];
type Offer = NonNullable<Model['offer']>;
type Decision = Parameters<Model['respond']>[1];

const SIGN_IN_REMINDER = 'Sending or accepting an offer requires a password sign-in within the last five minutes.';

/** Load ownership information only for the current foreground household. */
export default function OwnershipTransferScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'OwnershipTransfer'>) {
  const focused = useControllerFocused();
  const model = useOwnershipTransfer(focused);
  /** Direct entry may have no previous route to return to. */
  function goBack() {
    if (navigation.canGoBack()) navigation.goBack();
    else openHomeFeature(navigation.dispatch, 'Home');
  }
  return (
    <DeepScreen title="Home ownership" eyebrow="HOUSEHOLD / ACCESS" onBack={goBack}>
      {focused && <OwnershipTransferView key={model.scopeKey ?? 'unavailable'} model={model} />}
    </DeepScreen>
  );
}

/** Present only the actions supported by the latest verified role and offer. */
export function OwnershipTransferView({ model }: { model: Model }) {
  const ready = Boolean(model.scopeKey && model.role);
  return (
    <View style={styles.viewport} testID="ownership-transfer-workspace">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false}
        overScrollMode="never" nestedScrollEnabled directionalLockEnabled keyboardShouldPersistTaps="handled">
        {ready && !!model.notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{model.notice}</Text>}
        <DeepCard style={styles.panel}>
          <View style={styles.emblem}>
            <Ionicons accessible={false} name="home-outline" size={27} color={theme.colors.accentText} />
          </View>
          <TransferContent model={model} />
        </DeepCard>
        {ready && <DeepAction label="Refresh status" icon="refresh-outline"
          disabled={model.busy || model.loading} onPress={() => void model.refresh()} />}
      </ScrollView>
    </View>
  );
}

/** A failed refresh removes private choices and requires a fresh read before another decision. */
function TransferContent({ model }: { model: Model }) {
  if (!model.scopeKey || !model.role) {
    return <Heading title="Ownership unavailable" detail="Sign in to this home as its Owner, an Admin or a Member to review ownership offers." />;
  }
  if (model.loading) {
    return <Text accessibilityLiveRegion="polite" style={householdStyles.subtitle}>Checking home ownership…</Text>;
  }
  if (model.error) {
    return <><Heading title="Check ownership status" /><Text accessibilityRole="alert" style={styles.error}>{model.error}</Text></>;
  }
  if (model.offer) {
    const offer = model.offer;
    const expectedDirection = model.role === 'Owner' ? 'outgoing' : 'incoming';
    if (offer.direction !== expectedDirection) return <Heading title="Ownership has changed" detail="Refresh to see your current offer and role." />;
    if (!(Date.parse(offer.expiresAt) > Date.now())) {
      return <Heading title="This offer has expired" detail="Refresh to check whether there is a new offer." />;
    }
    return <PendingOffer key={JSON.stringify([offer.id, offer.direction, offer.expiresAt, offer.homeName, offer.fromName, offer.toName])} offer={offer} model={model} />;
  }
  if (model.role !== 'Owner') {
    return <Heading title="No offer for you" detail="When the Owner chooses you, their offer will appear here for you to review." />;
  }
  if (!model.candidates.length) {
    return <Heading title="No eligible recipients yet" detail="An Admin or Member who has joined this home can receive ownership. Manage invitations in Household." />;
  }
  return <ChooseRecipient key={JSON.stringify(model.candidates.map(({ id, name, role, homeName }) => [id, name, role, homeName]))} model={model} />;
}

/** A recipient has to be displayed and reviewed by identity before an offer can be sent. */
function ChooseRecipient({ model }: { model: Model }) {
  const [page, setPage] = useState(0);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const candidate = model.candidates[page];
  if (!candidate) return null;
  if (reviewId === candidate.id) {
    return <>
      <Heading eyebrow="REVIEW OFFER" title="Offer home ownership?"
        detail="They have 24 hours to accept in VantaHome. You can cancel a pending offer." />
      <Text style={householdStyles.availabilityStatus}>{candidate.homeName}</Text>
      <RoleChanges newOwner={candidate.name} previousOwner="You" />
      <Text style={householdStyles.detail}>{SIGN_IN_REMINDER}</Text>
      <DeepAction label={model.busy ? 'Sending offer…' : 'Send ownership offer'} primary disabled={model.busy}
        onPress={() => void model.send(candidate.id)} />
      <DeepAction label="Choose another person" disabled={model.busy} onPress={() => setReviewId(null)} />
    </>;
  }
  return <>
    <Heading eyebrow="OWNER CONTROLS" title="Choose the next Owner"
      detail="Offer this home to someone who already belongs to it. You remain Owner until they accept." />
    <RecipientPages candidates={model.candidates} page={page} onPage={setPage} />
    <DeepAction label="Review offer" icon="arrow-forward-outline" primary disabled={model.busy}
      onPress={() => setReviewId(candidate.id)} />
  </>;
}

/** Page one identity at a time so large households fit phones and swipe retains native momentum. */
function RecipientPages({ candidates, page, onPage }: { candidates: readonly Candidate[]; page: number; onPage: (page: number) => void }) {
  const { fontScale } = useWindowDimensions();
  const picker = useMemo(() => StyleSheet.create({ frame: { height: 24 + 54 * Math.max(1, fontScale) } }).frame, [fontScale]);
  return <>
    <View style={picker} testID="ownership-recipient-picker">
      <ScrollableCardPages page={page} count={candidates.length} resetKey={candidates.length} onChange={onPage}
        testID="ownership-recipient-pages" renderPage={(index) => {
          const person = candidates[index];
          return <View style={styles.person}>
            <Ionicons accessible={false} name="person-outline" size={22} color={theme.colors.accentText} />
            <View style={householdStyles.heading}>
              <Text numberOfLines={2} style={householdStyles.rowText}>{person.name}</Text>
              <Text style={householdStyles.detail}>{person.role}</Text>
            </View>
          </View>;
        }} />
    </View>
    {candidates.length > 1 && <DeepPager page={page} pageCount={candidates.length} onChange={onPage} label="eligible people" />}
  </>;
}

/** Separate reading an offer from acting on it, including cancellation and decline. */
function PendingOffer({ offer, model }: { offer: Offer; model: Model }) {
  const [review, setReview] = useState<Decision | null>(null);
  const incoming = offer.direction === 'incoming';
  const deadline = formatHouseholdDeadline(offer.expiresAt);
  if (review) {
    const decision = {
      accept: { title: 'Become the Owner?', detail: 'Acceptance transfers control of this home to you immediately.', label: 'Accept ownership' },
      cancel: { title: 'Cancel this offer?', detail: `The offer to ${offer.toName} will close. You keep ownership of this home.`, label: 'Confirm cancellation' },
      decline: { title: 'Decline ownership?', detail: `${offer.fromName} will keep ownership and this offer will close.`, label: 'Confirm decline' },
    }[review];
    return <>
      <Heading eyebrow="REVIEW DECISION" title={decision.title} detail={decision.detail} />
      <Text style={householdStyles.availabilityStatus}>{offer.homeName}</Text>
      {review === 'accept' && <>
        <RoleChanges newOwner="You" previousOwner={offer.fromName} />
        <Text style={householdStyles.detail}>{SIGN_IN_REMINDER}</Text>
      </>}
      <DeepAction label={model.busy ? 'Submitting…' : decision.label} primary disabled={model.busy}
        onPress={() => void model.respond(offer.id, review)} />
      <DeepAction label="Back to offer" disabled={model.busy} onPress={() => setReview(null)} />
    </>;
  }
  return <>
    <Heading eyebrow={incoming ? 'YOUR INVITATION' : 'PENDING OFFER'}
      title={incoming ? 'You have an ownership offer' : 'Awaiting acceptance'}
      detail={incoming ? `${offer.fromName} chose you to become the Owner of this home.` : `${offer.toName} can now review your offer in VantaHome.`} />
    <Text style={householdStyles.rowText}>{offer.homeName}</Text>
    <Text style={householdStyles.availabilityStatus}>Expires {deadline}</Text>
    {incoming && <DeepAction label="Review ownership" icon="key-outline" primary disabled={model.busy} onPress={() => setReview('accept')} />}
    <DeepAction label={incoming ? 'Decline offer' : 'Cancel offer'} disabled={model.busy}
      onPress={() => setReview(incoming ? 'decline' : 'cancel')} />
  </>;
}

/** Spell out both resulting roles at the final decision point. */
function RoleChanges({ newOwner, previousOwner }: { newOwner: string; previousOwner: string }) {
  return <View style={styles.roleSummary}>
    <Text style={householdStyles.eyebrow}>AFTER ACCEPTANCE</Text>
    <Text style={householdStyles.rowText}>{newOwner} · Owner</Text>
    <Text style={householdStyles.rowText}>{previousOwner} · Admin</Text>
    <Text style={householdStyles.detail}>The new Owner manages household access and future ownership changes.</Text>
  </View>;
}

/** Give each review step one accessible heading and a short explanation. */
function Heading({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) {
  return <View style={styles.copy}>
    {!!eyebrow && <Text style={householdStyles.eyebrow}>{eyebrow}</Text>}
    <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={householdStyles.title}>{title}</Text>
    {!!detail && <Text style={householdStyles.subtitle}>{detail}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, width: '100%', maxWidth: 620, alignSelf: 'center' },
  scroll: { flex: 1, minHeight: 0, ...Platform.select({ web: { overscrollBehavior: 'contain' as const } }) },
  content: { flexGrow: 1, justifyContent: 'center', gap: 12, paddingVertical: 4 },
  panel: { gap: 14 },
  copy: { gap: 7 },
  emblem: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 15, backgroundColor: theme.colors.surfaceRaised },
  roleSummary: { borderRadius: 15, backgroundColor: theme.colors.surfaceRaised, padding: 14, gap: 7 },
  error: { color: theme.colors.warningText, fontSize: 14, lineHeight: 20 },
  notice: { color: theme.colors.accentText, fontSize: 14, lineHeight: 20, padding: 12, borderRadius: 14, backgroundColor: theme.colors.surfaceRaised },
});
