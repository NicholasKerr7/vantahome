import React, { useState } from "react";
import { Alert, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import { openHomeFeature } from "../app/homeNavigation";
import Pressable from "../components/Pressable";
import { runtimePolicy } from "../config/runtimeMode";
import { INTEGRATION_ENTRIES, integrationStatusLabel } from "../features/integrations/integrationCatalog";
import { getVoiceLinkConfiguration, linkVoiceAccount } from "../features/integrations/voiceLinkService";
import { isVoiceProvider, VOICE_LINK_FEEDBACK, voiceScopeIsCurrent } from "../features/integrations/voiceLinking";
import { useHomeStore } from "../store/useHomeStore";
import { theme } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Integrations">;

/** Keep integration setup in five bounded pages within the 3D app shell. */
export default function IntegrationsScreen({ navigation }: Props) {
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const { height } = useWindowDimensions();
  const integrations = useHomeStore((state) => state.integrations);
  const authenticatedUserId = useHomeStore((state) => state.authenticatedUserId);
  const authorizedScope = useHomeStore((state) => Boolean(state.authenticatedUserId && state.activeHomeId && state.activeMemberId && state.membershipReady));
  const entry = INTEGRATION_ENTRIES[page];
  const voiceProvider = isVoiceProvider(entry.id) ? entry.id : null;
  const configured = voiceProvider ? Boolean(getVoiceLinkConfiguration(voiceProvider)) : false;
  const savedStatus = voiceProvider ? integrations[voiceProvider].status : undefined;
  const saved = savedStatus === "linked";
  const canAuthorize = Boolean(voiceProvider && configured && authorizedScope && !busy);
  const actionDisabled = saved ? !authorizedScope || busy : !canAuthorize;
  const compact = height < 700;

  /** Change the visible integration without retaining feedback from a different provider. */
  function changePage(nextPage: number) {
    setFeedback("");
    setShowDetails(false);
    setPage(nextPage);
  }

  /** The shared controller validates the callback before recording local authorization progress. */
  async function authorize() {
    if (!voiceProvider || busy) return;
    setBusy(true);
    const result = await linkVoiceAccount(voiceProvider);
    setBusy(false);
    setFeedback(VOICE_LINK_FEEDBACK[result]);
  }

  /** Removing the local record does not claim to revoke a provider-side account connection. */
  function unlink() {
    if (!voiceProvider || busy) return;
    const provider = voiceProvider;
    const scope = { ...useHomeStore.getState() };
    Alert.alert("Remove saved authorization?", "This clears VantaHome’s local record. Manage any provider-side connection in the assistant’s app.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        if (!voiceScopeIsCurrent(scope, useHomeStore.getState())) return;
        useHomeStore.getState().unlinkIntegration(provider);
        setFeedback("Saved authorization removed.");
      } },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}>
      <View style={[styles.content, compact && styles.compactContent]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to home" onPress={() => openHomeFeature(navigation.dispatch, "Home")} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>VANTAHOME / CONNECTIONS</Text>
            <Text accessibilityRole="header" style={styles.title}>Voice & integrations</Text>
          </View>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          {INTEGRATION_ENTRIES.map((item, index) => (
            <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.title}
              accessibilityState={{ selected: index === page, disabled: busy }} disabled={busy}
              onPress={() => changePage(index)} style={[styles.tab, index === page && styles.selectedTab]}>
              <Ionicons name={item.icon} size={20} color={index === page ? theme.colors.accent : theme.colors.subtext} />
              <Text style={[styles.tabLabel, index === page && styles.selectedText]}>{item.shortLabel}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.card, compact && styles.compactCard]}>
          <View style={styles.cardHeading}>
            <Ionicons name={entry.icon} size={30} color={theme.colors.accent} />
            <Text accessibilityRole="header" style={[styles.providerTitle, compact && styles.compactTitle]}>{entry.title}</Text>
          </View>
          <View style={styles.statusLine}><View style={styles.statusMark} /><Text style={styles.status}>{integrationStatusLabel(entry.id, savedStatus, configured)}</Text></View>
          <Text style={[styles.description, compact && styles.compactDescription]}>{compact && showDetails ? entry.nextStep : entry.description}</Text>
          {!compact && <Text style={styles.detail}>{entry.nextStep}</Text>}
          {!compact && voiceProvider && !authenticatedUserId && <Text style={styles.detail}>Sign in to authorize an assistant for your home.</Text>}
          <View style={styles.cardActions}>
            {voiceProvider ? (
              <Pressable disabled={actionDisabled} accessibilityLabel={saved ? `Remove ${entry.title} authorization` : `Authorize ${entry.title}`}
                accessibilityState={{ disabled: actionDisabled }} onPress={saved ? unlink : () => { void authorize(); }}
                style={[styles.action, actionDisabled && styles.disabled]}>
                <Text style={styles.actionText}>{busy ? "Authorizing…" : saved ? "Remove authorization" : configured ? authenticatedUserId ? "Open authorization" : "Sign in required" : "Setup required"}</Text>
              </Pressable>
            ) : entry.id === "bridge" && runtimePolicy.allowDirectMqtt ? (
              <Pressable accessibilityLabel="Open development connection tools" onPress={() => openHomeFeature(navigation.dispatch, "Settings")} style={styles.action}>
                <Text style={styles.actionText}>Development connection tools</Text>
              </Pressable>
            ) : <Text style={styles.planned}>No connection is available yet.</Text>}
          </View>
        </View>

        <View style={styles.feedbackArea}><Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback || (compact ? "Setup status does not confirm a device connection." : "3D controls and assistant integrations share the same home. Setup status never confirms a device connection.")}</Text></View>
        <View style={styles.pager}>
          <Pressable accessibilityLabel="Previous integration" disabled={page === 0 || busy} accessibilityState={{ disabled: page === 0 || busy }}
            onPress={() => changePage(page - 1)} style={[styles.iconButton, (page === 0 || busy) && styles.disabled]}>
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>
          {compact ? (
            <Pressable accessibilityLabel={showDetails ? "Show integration overview" : "Show integration setup details"}
              accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(!showDetails)} style={styles.detailsButton}>
              <Text style={styles.pageCount}>{showDetails ? "Overview" : "Setup details"} · {page + 1} / {INTEGRATION_ENTRIES.length}</Text>
            </Pressable>
          ) : <Text style={styles.pageCount}>{page + 1} / {INTEGRATION_ENTRIES.length}</Text>}
          <Pressable accessibilityLabel="Next integration" disabled={page === INTEGRATION_ENTRIES.length - 1 || busy}
            accessibilityState={{ disabled: page === INTEGRATION_ENTRIES.length - 1 || busy }} onPress={() => changePage(page + 1)}
            style={[styles.iconButton, (page === INTEGRATION_ENTRIES.length - 1 || busy) && styles.disabled]}>
            <Ionicons name="chevron-forward" size={22} color={theme.colors.text} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg0 },
  content: { flex: 1, width: "100%", maxWidth: 900, alignSelf: "center", padding: 24, gap: 20 },
  compactContent: { padding: 12, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 8 },
  headerText: { flex: 1 },
  eyebrow: { color: theme.colors.subtext, fontSize: 10, fontWeight: "500", letterSpacing: 2 },
  title: { color: theme.colors.text, fontSize: 23, fontWeight: "400", letterSpacing: -0.5 },
  iconButton: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", gap: 5, borderBottomWidth: 1, borderBottomColor: theme.colors.stroke },
  tab: { flex: 1, minWidth: 44, minHeight: 58, gap: 5, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent", paddingBottom: 8 },
  selectedTab: { borderBottomColor: theme.colors.accent },
  tabLabel: { color: theme.colors.subtext, fontSize: 11, fontWeight: "600" },
  selectedText: { color: theme.colors.accent },
  card: { flex: 1, minHeight: 0, paddingVertical: 24, paddingHorizontal: 4, gap: 20, justifyContent: "center" },
  compactCard: { paddingVertical: 8, gap: 10 },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  providerTitle: { flex: 1, color: theme.colors.text, fontSize: 38, fontWeight: "400", letterSpacing: -1 },
  compactTitle: { fontSize: 27, letterSpacing: -0.5 },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusMark: { width: 16, height: 1, backgroundColor: theme.colors.accent },
  status: { color: theme.colors.accent, fontSize: 11, fontWeight: "500", letterSpacing: 0.5 },
  description: { color: theme.colors.text, fontSize: 17, lineHeight: 25, maxWidth: 560 },
  compactDescription: { fontSize: 13, lineHeight: 18 },
  detail: { color: theme.colors.subtext, fontSize: 13, lineHeight: 20, maxWidth: 560 },
  cardActions: { paddingTop: 8, alignItems: "flex-start" },
  action: { minHeight: 48, minWidth: 220, maxWidth: "100%", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 4, backgroundColor: theme.colors.accent, alignItems: "center", justifyContent: "center" },
  actionText: { color: theme.colors.bg0, fontSize: 13, fontWeight: "700", textAlign: "center" },
  disabled: { opacity: 0.45 },
  planned: { color: theme.colors.muted, fontSize: 13, lineHeight: 18 },
  feedbackArea: { minHeight: 48, justifyContent: "center", borderTopWidth: 1, borderTopColor: theme.colors.stroke, paddingTop: 12 },
  feedback: { color: theme.colors.subtext, fontSize: 12, lineHeight: 16 },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pageCount: { color: theme.colors.subtext, fontSize: 13, fontWeight: "600" },
  detailsButton: { minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 },
});
