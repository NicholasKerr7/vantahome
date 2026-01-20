import React, { useMemo, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Animated,
  Easing,
  TextInput,
  Alert,
} from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import BackgroundLines from "../components/BackgroundLines";
import ScreenFrame from "../components/ScreenFrame";
import ScreenSectionLayout from "../components/ScreenSectionLayout";
import { theme } from "../theme/theme";
import { type IntegrationProvider, useHomeStore } from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import { deviceClient, type ConnectionStatus } from "../services/deviceClient";
import {
  bootstrapHome,
  devicesToStateEvents,
  pushDeviceStateBatch,
} from "../services/cloudRegistry";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const voiceRedirectUri = AuthSession.makeRedirectUri({
  scheme: "vantahome",
  path: "voice-link",
});

type IntegrationRowProps = {
  provider: IntegrationProvider;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export default function SettingsScreen() {
  const { width, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(900);
  const isWide = isTablet && isLandscape;
  const isPortrait = !isLandscape;
  const titleSize = Math.round((isTablet ? 30 : 26) * scale);
  const cardPad = Math.round((isTablet ? 20 : 16) * scale);
  const cardRadius = Math.round((isTablet ? 30 : 28) * scale);
  const heroOuterPad = Math.round(cardPad * (isWide ? 1 : 0.9));
  const heroPanelPad = Math.round((isTablet ? 18 : 14) * scale);
  const heroPanelRadius = Math.round((isTablet ? 22 : 20) * scale);
  const heroGap = Math.round((isTablet ? 18 : 12) * scale);
  const heroIconWrap = Math.round((isTablet ? 50 : 44) * scale);
  const heroIconSize = Math.round((isTablet ? 22 : 20) * scale);
  const heroTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const heroSubSize = Math.round((isTablet ? 13 : 12) * scale);
  const heroBadgeTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const heroStatTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const heroProgressHeight = Math.max(4, Math.round(6 * scale));
  const framePad = Math.round((isTablet ? 14 : 10) * scale);
  const frameRadius = Math.round((isTablet ? 30 : 26) * scale);
  const outerGutter = isWide ? Math.round(gutter * 0.6) : isTablet ? gutter : 0;
  const innerGutter = isWide ? Math.round(gutter * 0.75) : gutter;
  const minCardWidth = Math.round((isTablet ? 300 : 260) * scale);
  const sectionTitleSize = Math.round((isTablet ? 16 : 14) * scale);
  const rowLabelSize = Math.round((isTablet ? 14 : 13) * scale);
  const rowValueSize = Math.round((isTablet ? 14 : 13) * scale);
  const gridGap = Math.round((isTablet ? 18 : 12) * scale);
  const integrationPad = Math.round((isTablet ? 14 : 12) * scale);
  const integrationRadius = Math.round((isTablet ? 20 : 18) * scale);
  const integrationIconSize = Math.round((isTablet ? 22 : 18) * scale);
  const integrationIconWrap = Math.round((isTablet ? 40 : 34) * scale);
  const statusHeight = Math.round((isTablet ? 28 : 24) * scale);
  const statusRadius = Math.round(statusHeight / 2);
  const inputHeight = Math.round((isTablet ? 46 : 42) * scale);
  const inputRadius = Math.round(inputHeight * 0.28);
  const buttonSize = Math.round((isTablet ? 36 : 32) * scale);
  const primaryBtnHeight = Math.round((isTablet ? 36 : 32) * scale);
  const primaryBtnRadius = Math.round(primaryBtnHeight / 2);
  const wideBtnHeight = Math.round((isTablet ? 44 : 40) * scale);
  const wideBtnRadius = Math.round(wideBtnHeight * 0.4);
  const insets = useSafeAreaInsets();
  const tabInset = isTablet ? (isLandscape ? 28 : 24) : gutter;
  const tabBarInset = insets.bottom > 0 ? insets.bottom + 8 : tabInset;
  const tabBarHeight = Math.round(
    (isTablet ? (isLandscape ? 74 : 72) : 68) * scale,
  );
  const tabBarGap = Math.round((isTablet ? 12 : 8) * scale);
  const tabBarPad = tabBarInset + tabBarHeight + tabBarGap;
  const roomsCount = useHomeStore((s) => s.rooms.length);
  const devicesCount = useHomeStore((s) => s.devices.length);
  const devices = useHomeStore((s) => s.devices);
  const profile = useHomeStore((s) => s.profile);
  const integrations = useHomeStore((s) => s.integrations);
  const prefs = useHomeStore((s) => s.preferences);
  const realtime = useHomeStore((s) => s.realtime);
  const linkIntegration = useHomeStore((s) => s.linkIntegration);
  const setIntegrationStatus = useHomeStore((s) => s.setIntegrationStatus);
  const unlinkIntegration = useHomeStore((s) => s.unlinkIntegration);
  const resyncIntegration = useHomeStore((s) => s.resyncIntegration);
  const setPreferences = useHomeStore((s) => s.setPreferences);
  const setRealtime = useHomeStore((s) => s.setRealtime);
  const userName = useHomeStore((s) => s.userName);
  const navigation = useNavigation<any>();
  const voiceFunctionsBase = useMemo(() => {
    const explicit = process.env.EXPO_PUBLIC_VOICE_FUNCTIONS_URL?.trim();
    if (explicit) return explicit.replace(/\/$/, "");
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
    if (!supabaseUrl) return null;
    const normalized = supabaseUrl.replace(/\/$/, "");
    if (normalized.includes(".functions.supabase.co")) return normalized;
    return normalized.replace(/\.supabase\.co$/, ".functions.supabase.co");
  }, []);
  const voiceAuthorizeUrl = voiceFunctionsBase
    ? `${voiceFunctionsBase}/voice-authorize`
    : null;
  const voiceClientIds = useMemo<Record<IntegrationProvider, string>>(
    () => ({
      alexa: process.env.EXPO_PUBLIC_VOICE_ALEXA_CLIENT_ID?.trim() ?? "",
      google: process.env.EXPO_PUBLIC_VOICE_GOOGLE_CLIENT_ID?.trim() ?? "",
      homekit: "",
      matter: "",
    }),
    [],
  );

  const homeTitle = useMemo(() => {
    const custom = profile.homeName?.trim();
    if (custom) return custom;
    return userName ? `${userName}'s Home` : "Your Home";
  }, [profile.homeName, userName]);
  const columnCount = useMemo(() => {
    if (!isWide) return 1;
    const availableWidth = width - outerGutter * 2 - innerGutter * 2;
    const maxColumns = Math.floor(
      (availableWidth + gridGap) / (minCardWidth + gridGap),
    );
    return Math.max(1, Math.min(3, maxColumns));
  }, [
    gridGap,
    innerGutter,
    isWide,
    minCardWidth,
    outerGutter,
    width,
  ]);
  const dividerPad = Math.round((isTablet ? 16 : 12) * scale);
  const scrollBottomPad = Math.round(gridGap * 1.2);
  const [connection, setConnection] = useState<{
    status: ConnectionStatus;
    error?: string;
  }>({
    status: "disconnected",
  });
  const [cloudSyncLoading, setCloudSyncLoading] = useState(false);
  const contentStyle: StyleProp<ViewStyle> = [
    styles.content,
    {
      paddingHorizontal: isWide ? outerGutter : isTablet ? gutter : 0,
      paddingTop: topPad,
      paddingBottom: tabBarPad,
    },
  ];
  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    { padding: cardPad, borderRadius: cardRadius, width: "100%" },
    isWide && styles.cardLandscape,
  ];
  const heroCardStyle: StyleProp<ViewStyle> = [
    styles.card,
    styles.heroCard,
    { borderRadius: cardRadius },
  ];
  const headerWrapStyle: StyleProp<ViewStyle> = {
    paddingHorizontal: innerGutter,
  };
  const headerTitleStyle: StyleProp<TextStyle> = [
    styles.h1,
    { fontSize: titleSize },
  ];
  const headerDividerWrapStyle: StyleProp<ViewStyle> = {
    paddingVertical: dividerPad,
  };
  const sectionsScrollContentStyle: StyleProp<ViewStyle> = {
    paddingBottom: scrollBottomPad,
    paddingHorizontal: innerGutter,
  };
  const cardsGridLandscapeStyle: StyleProp<ViewStyle> = [
    styles.cardsGrid,
    styles.cardsGridLandscape,
    { gap: gridGap },
  ];
  const cardsStackStyle: StyleProp<ViewStyle> = [
    styles.cardsStack,
    { gap: gridGap },
  ];
  const cardsColumnStyle: StyleProp<ViewStyle> = [
    styles.cardsColumn,
    { gap: gridGap },
  ];
  const sectionTitleStyle: StyleProp<TextStyle> = [
    styles.sectionTitle,
    { fontSize: sectionTitleSize },
  ];
  const sectionSubStyle: StyleProp<TextStyle> = [
    styles.sectionSub,
    { fontSize: rowValueSize },
  ];
  const rowLabelStyle: StyleProp<TextStyle> = [
    styles.rowLabel,
    { fontSize: rowLabelSize },
  ];
  const rowValueStyle: StyleProp<TextStyle> = [
    styles.rowValue,
    { fontSize: rowValueSize },
  ];
  const primaryBtnTextStyle: StyleProp<TextStyle> = [
    styles.primaryBtnText,
    { fontSize: rowValueSize },
  ];
  const secondaryWideBtnTextStyle: StyleProp<TextStyle> = [
    styles.secondaryWideBtnText,
    { fontSize: rowValueSize },
  ];
  const statusTextStyle: StyleProp<TextStyle> = [
    styles.statusText,
    { fontSize: rowValueSize },
  ];
  const statusPillBaseStyle: ViewStyle = {
    height: statusHeight,
    borderRadius: statusRadius,
  };
  const heroContentStyle: StyleProp<ViewStyle> = [
    styles.heroContent,
    { paddingHorizontal: heroOuterPad, paddingVertical: heroOuterPad },
  ];
  const heroLayoutStyle: StyleProp<ViewStyle> = [
    styles.heroLayout,
    { gap: heroGap },
    isWide && styles.heroLayoutLandscape,
  ];
  const heroColumnStyle: StyleProp<ViewStyle> = [
    styles.heroColumn,
    { minWidth: 0 },
  ];
  const heroPanelStyle: StyleProp<ViewStyle> = [
    styles.heroPanel,
    { padding: heroPanelPad, borderRadius: heroPanelRadius },
  ];
  const heroIdentityPanelStyle: StyleProp<ViewStyle> = [
    heroPanelStyle,
    heroColumnStyle,
    styles.heroIdentity,
  ];
  const heroMetaPanelStyle: StyleProp<ViewStyle> = [
    heroPanelStyle,
    heroColumnStyle,
    styles.heroMeta,
  ];
  const heroActionsPanelStyle: StyleProp<ViewStyle> = [
    heroPanelStyle,
    heroColumnStyle,
    styles.heroActions,
  ];
  const heroIconStyle: StyleProp<ViewStyle> = [
    styles.heroIconWrap,
    {
      width: heroIconWrap,
      height: heroIconWrap,
      borderRadius: Math.round(heroIconWrap * 0.35),
    },
  ];
  const heroTitleStyle: StyleProp<TextStyle> = [
    styles.heroTitle,
    { fontSize: heroTitleSize },
  ];
  const heroSubStyle: StyleProp<TextStyle> = [
    styles.heroSub,
    { fontSize: heroSubSize },
  ];
  const heroBadgeTextStyle: StyleProp<TextStyle> = [
    styles.heroBadgeText,
    { fontSize: heroBadgeTextSize },
  ];
  const heroStatTextStyle: StyleProp<TextStyle> = [
    styles.heroStatText,
    { fontSize: heroStatTextSize },
  ];
  const heroHintTextStyle: StyleProp<TextStyle> = [
    styles.heroHint,
    { fontSize: heroStatTextSize },
  ];
  const heroProgressTrackStyle: StyleProp<ViewStyle> = [
    styles.heroProgressTrack,
    { height: heroProgressHeight },
  ];
  const integrationLabelStyle: StyleProp<TextStyle> = [
    styles.integrationLabel,
    { fontSize: rowLabelSize },
  ];
  const integrationSubStyle: StyleProp<TextStyle> = [
    styles.integrationSub,
    { fontSize: rowValueSize },
  ];
  const secondaryWideBtnStyle: StyleProp<ViewStyle> = [
    styles.secondaryWideBtn,
    { marginTop: 12, height: wideBtnHeight, borderRadius: wideBtnRadius },
  ];
  const primaryWideBtnStyle: StyleProp<ViewStyle> = [
    styles.primaryBtn,
    { marginTop: 12, height: wideBtnHeight, borderRadius: wideBtnRadius },
    cloudSyncLoading && styles.primaryBtnDisabled,
  ];
  const realtimeInputStyle: StyleProp<ViewStyle> = [
    styles.realtimeInput,
    { height: inputHeight, borderRadius: inputRadius },
  ];
  const switchScaleStyle: ViewStyle = {
    transform: [{ scale: isTablet ? 1.05 : 1 }],
  };
  const isLinking = useMemo(
    () =>
      Object.values(integrations).some(
        (integration) => integration.status === "linking",
      ),
    [integrations],
  );
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLinking) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isLinking, pulse]);

  useEffect(() => {
    const unsubscribe = deviceClient.subscribeConnection((evt) =>
      setConnection({ status: evt.status, error: evt.error }),
    );
    return () => {
      unsubscribe();
    };
  }, []);

  const realtimeActive = realtime.enabled && realtime.wsUrl.trim().length > 0;
  const realtimeStatus = useMemo(() => {
    if (!realtime.enabled)
      return { label: "Disabled", status: "disabled" as const };
    if (!realtimeActive)
      return { label: "Add URL", status: "offline" as const };
    switch (connection.status) {
      case "connected":
        return { label: "Connected", status: "connected" as const };
      case "connecting":
        return { label: "Connecting", status: "connecting" as const };
      case "error":
        return { label: "Error", status: "error" as const };
      default:
        return { label: "Offline", status: "offline" as const };
    }
  }, [connection.status, realtime.enabled, realtimeActive]);
  const realtimeStatusPillStyle: StyleProp<ViewStyle> = [
    styles.statusPill,
    statusPillBaseStyle,
    realtimeStatus.status === "connected"
      ? styles.statusOn
      : realtimeStatus.status === "connecting"
        ? styles.statusLinking
        : realtimeStatus.status === "error"
          ? styles.statusError
          : styles.statusOff,
  ];
  const realtimeStatusTextStyle: StyleProp<TextStyle> = [
    statusTextStyle,
    realtimeStatus.status === "connected"
      ? styles.statusTextOn
      : styles.statusTextOff,
  ];

  const handleCloudSync = async () => {
    if (cloudSyncLoading) return;
    setCloudSyncLoading(true);
    try {
      const homeName = profile.homeName?.trim() || `${userName}'s Home`;
      await bootstrapHome(homeName);
      const events = devicesToStateEvents(devices);
      const result = await pushDeviceStateBatch(events);
      Alert.alert("Cloud sync", `Synced ${result.updated} devices.`);
    } catch (err: any) {
      Alert.alert(
        "Cloud sync failed",
        err?.message ?? "Unable to sync to cloud.",
      );
    } finally {
      setCloudSyncLoading(false);
    }
  };

  const handleVoiceLink = async (provider: IntegrationProvider) => {
    if (provider !== "alexa" && provider !== "google") {
      Alert.alert(
        "Coming soon",
        "This integration uses a future bridge and is not available yet.",
      );
      return;
    }
    if (!voiceAuthorizeUrl) {
      Alert.alert(
        "Missing configuration",
        "Set EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_VOICE_FUNCTIONS_URL first.",
      );
      return;
    }
    const clientId = voiceClientIds[provider];
    if (!clientId) {
      Alert.alert(
        "Missing configuration",
        "Set the voice client ID in your .env file to enable linking.",
      );
      return;
    }
    if (integrations[provider]?.status === "linking") return;

    const state = `${provider}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setIntegrationStatus(provider, "linking");
    try {
      const authUrl = `${voiceAuthorizeUrl}?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: voiceRedirectUri,
        response_type: "code",
        state,
      }).toString()}`;
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        voiceRedirectUri,
      );
      if (result.type !== "success" || !result.url) {
        setIntegrationStatus(provider, "not-linked");
        return;
      }

      const params = new URL(result.url).searchParams;
      const code = params.get("code");
      const returnedState = params.get("state");
      if (!code) {
        setIntegrationStatus(provider, "not-linked");
        Alert.alert("Linking failed", "No authorization code returned.");
        return;
      }
      if (returnedState && returnedState !== state) {
        setIntegrationStatus(provider, "not-linked");
        Alert.alert("Linking failed", "Invalid state returned.");
        return;
      }

      const accountLabel =
        profile.email?.trim() || userName?.trim() || "Linked account";
      linkIntegration(provider, accountLabel);
    } catch (err: any) {
      setIntegrationStatus(provider, "not-linked");
      Alert.alert(
        "Linking failed",
        err?.message ?? "Unable to complete linking.",
      );
    }
  };

  const renderIntegration = ({
    provider,
    label,
    description,
    icon,
  }: IntegrationRowProps) => {
    const state = integrations[provider];
    const linked = state?.status === "linked";
    const linking = state?.status === "linking";
  const integrationRowStyle: StyleProp<ViewStyle> = [
    styles.integrationRow,
    { paddingVertical: integrationPad, borderRadius: integrationRadius },
  ];
    const integrationIconStyle: StyleProp<ViewStyle> = [
      styles.integrationIcon,
      {
        width: integrationIconWrap,
        height: integrationIconWrap,
        borderRadius: Math.round(integrationIconWrap * 0.35),
      },
    ];
    const statusPillStyle: StyleProp<ViewStyle> = [
      styles.statusPill,
      statusPillBaseStyle,
      linked ? styles.statusOn : linking ? styles.statusLinking : styles.statusOff,
      linking && { opacity: pulse },
    ];
    const statusTextTone = linked ? styles.statusTextOn : styles.statusTextOff;
    const statusTextToneStyle: StyleProp<TextStyle> = [
      statusTextStyle,
      statusTextTone,
    ];
    const secondaryBtnStyle: StyleProp<ViewStyle> = [
      styles.secondaryBtn,
      {
        width: buttonSize,
        height: buttonSize,
        borderRadius: Math.round(buttonSize * 0.35),
      },
    ];
    const primaryBtnStyle: StyleProp<ViewStyle> = [
      styles.primaryBtn,
      { height: primaryBtnHeight, borderRadius: primaryBtnRadius },
      linking && styles.primaryBtnDisabled,
    ];
    const integrationActionsStyle: StyleProp<ViewStyle> = [
      styles.integrationActions,
      isWide && styles.integrationActionsLandscape,
    ];
    const integrationButtonsStyle: StyleProp<ViewStyle> = [
      styles.integrationButtons,
      isWide && styles.integrationButtonsLandscape,
    ];
    const statusPillInlineStyle: StyleProp<ViewStyle> = [
      statusPillStyle,
      isWide && styles.statusPillLandscape,
    ];

    return (
      <View style={integrationRowStyle} key={provider}>
        <View style={styles.integrationLeft}>
          <View style={integrationIconStyle}>
            <Ionicons
              name={icon}
              size={integrationIconSize}
              color="rgba(60,60,80,0.9)"
            />
          </View>
          <View style={styles.integrationText}>
            <Text style={integrationLabelStyle}>{label}</Text>
            <Text style={integrationSubStyle}>{description}</Text>
          </View>
        </View>

        <View style={integrationActionsStyle}>
          <Animated.View style={statusPillInlineStyle}>
            <Text style={statusTextToneStyle}>
              {linked ? "Linked" : linking ? "Linking…" : "Not linked"}
            </Text>
          </Animated.View>

          <View style={integrationButtonsStyle}>
            {linked ? (
              <>
                <Pressable
                  onPress={() => resyncIntegration(provider)}
                  style={secondaryBtnStyle}
                  hitSlop={10}
                >
                  <Ionicons
                    name="refresh"
                    size={Math.round(16 * scale)}
                    color="rgba(60,60,80,0.9)"
                  />
                </Pressable>
                <Pressable
                  onPress={() => unlinkIntegration(provider)}
                  style={secondaryBtnStyle}
                  hitSlop={10}
                >
                  <Ionicons
                    name="close"
                    size={Math.round(16 * scale)}
                    color="rgba(60,60,80,0.9)"
                  />
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => {
                  if (linking) return;
                  void handleVoiceLink(provider);
                }}
                style={primaryBtnStyle}
                hitSlop={10}
              >
                <Text style={primaryBtnTextStyle}>
                  {linking ? "Linking…" : "Link account"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  const integrationStates = Object.values(integrations);
  const linkedCount = integrationStates.filter(
    (integration) => integration.status === "linked",
  ).length;
  const linkingCount = integrationStates.filter(
    (integration) => integration.status === "linking",
  ).length;
  const availableCount = integrationStates.length;
  const pendingCount = Math.max(0, availableCount - linkedCount);
  const integrationProgress =
    availableCount > 0 ? linkedCount / availableCount : 0;
  const heroProgressFillStyle: StyleProp<ViewStyle> = [
    styles.heroProgressFill,
    { width: `${Math.round(integrationProgress * 100)}%` },
  ];
  const heroBadges: Array<{
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    tone: string;
  }> = [
    {
      icon: linkedCount ? "checkmark-circle" : "time-outline",
      label: linkedCount ? `${linkedCount} linked` : "No links yet",
      tone: linkedCount
        ? "rgba(122,92,255,0.9)"
        : "rgba(255,190,120,0.9)",
    },
    {
      icon: voiceAuthorizeUrl ? "mic" : "alert-circle",
      label: voiceAuthorizeUrl ? "Voice ready" : "Voice link off",
      tone: voiceAuthorizeUrl
        ? "rgba(122,92,255,0.9)"
        : "rgba(255,120,140,0.9)",
    },
  ];
  if (linkingCount) {
    heroBadges.push({
      icon: "sync",
      label: `${linkingCount} linking`,
      tone: "rgba(122,92,255,0.9)",
    });
  }
  const heroHint = voiceAuthorizeUrl
    ? "Connect assistants and bridges to trigger routines and scenes."
    : "Voice linking needs a configured functions URL.";

  const integrationsCard = (
    <View style={heroCardStyle} key="integrations">
      <LinearGradient
        colors={[
          "rgba(122,92,255,0.22)",
          "rgba(255,255,255,0.06)",
        ]}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBackdrop}
        pointerEvents="none"
      />
      <View style={styles.heroGlow} pointerEvents="none" />
      <View style={styles.heroGlowSecondary} pointerEvents="none" />
      <View style={heroContentStyle}>
        <View style={heroLayoutStyle}>
          <View style={heroIdentityPanelStyle}>
            <View style={styles.heroIdentityRow}>
              <View style={heroIconStyle}>
                <Ionicons
                  name="mic-outline"
                  size={heroIconSize}
                  color="rgba(60,60,80,0.9)"
                />
              </View>
              <View style={styles.heroIdentityText}>
                <Text style={heroTitleStyle}>Voice & Integrations</Text>
                <Text style={heroSubStyle}>
                  Link assistants and bridges for hands-free control.
                </Text>
                <View style={styles.heroBadges}>
                  {heroBadges.map((badge) => (
                    <View style={styles.heroBadgePill} key={badge.label}>
                      <Ionicons
                        name={badge.icon}
                        size={Math.round(12 * scale)}
                        color={badge.tone}
                      />
                      <Text style={heroBadgeTextStyle}>{badge.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View style={heroMetaPanelStyle}>
            <View style={styles.heroStatsRow}>
              {[
                { label: "Linked", value: linkedCount },
                { label: "Pending", value: pendingCount },
                { label: "Available", value: availableCount },
              ].map((stat) => (
                <View style={styles.heroStatPill} key={stat.label}>
                  <Text style={heroStatTextStyle}>
                    {stat.label} {stat.value}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.heroProgressWrap}>
              <View style={heroProgressTrackStyle}>
                <View style={heroProgressFillStyle} />
              </View>
              <View style={styles.heroProgressMeta}>
                <Text style={heroStatTextStyle}>
                  Connected {linkedCount}/{availableCount}
                </Text>
                <Text style={heroStatTextStyle}>
                  {Math.round(integrationProgress * 100)}%
                </Text>
              </View>
            </View>
            <Text style={heroHintTextStyle}>{heroHint}</Text>
          </View>

          <View style={heroActionsPanelStyle}>
            <View style={styles.heroIntegrationList}>
              {renderIntegration({
                provider: "alexa",
                label: "Amazon Alexa",
                description: "Control devices with Alexa voice routines.",
                icon: "logo-amazon",
              })}
              {renderIntegration({
                provider: "google",
                label: "Google Home",
                description: "Use Assistant to trigger scenes & devices.",
                icon: "logo-google",
              })}
              {renderIntegration({
                provider: "homekit",
                label: "Apple HomeKit",
                description: "Expose devices to Home via a bridge (stub).",
                icon: "logo-apple",
              })}
              {renderIntegration({
                provider: "matter",
                label: "Matter Bridge",
                description: "Multi-ecosystem bridge (stub).",
                icon: "link-outline",
              })}
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const homeProfileCard = (
    <View style={cardStyle} key="home-profile">
      <Text style={sectionTitleStyle}>Home Profile</Text>
      <View style={styles.row}>
        <Text style={rowLabelStyle}>Home</Text>
        <Text style={rowValueStyle}>{homeTitle}</Text>
      </View>
      <View style={styles.row}>
        <Text style={rowLabelStyle}>Rooms</Text>
        <Text style={rowValueStyle}>{roomsCount}</Text>
      </View>
      <View style={styles.row}>
        <Text style={rowLabelStyle}>Devices</Text>
        <Text style={rowValueStyle}>{devicesCount}</Text>
      </View>
      <Pressable
        style={secondaryWideBtnStyle}
        onPress={() => navigation.navigate("Profile")}
      >
        <Ionicons
          name="person"
          size={Math.round(16 * scale)}
          color="rgba(60,60,80,0.9)"
        />
        <Text style={secondaryWideBtnTextStyle}>Edit profile</Text>
      </Pressable>
      <Pressable
        style={primaryWideBtnStyle}
        onPress={handleCloudSync}
        disabled={cloudSyncLoading}
      >
        <Text style={primaryBtnTextStyle}>
          {cloudSyncLoading ? "Syncing…" : "Resync to cloud"}
        </Text>
      </Pressable>
    </View>
  );

  const preferencesCard = (
    <View style={cardStyle} key="preferences">
      <Text style={sectionTitleStyle}>Preferences</Text>
      <View style={styles.row}>
        <Text style={rowLabelStyle}>Haptics</Text>
        <Switch
          value={prefs.haptics}
          onValueChange={(v) => setPreferences({ haptics: v })}
          thumbColor={
            prefs.haptics
              ? theme.colors.accent
              : "rgba(255,255,255,0.8)"
          }
          trackColor={{
            true: "rgba(180,107,255,0.45)",
            false: "rgba(255,255,255,0.24)",
          }}
          style={switchScaleStyle}
        />
      </View>
      <View style={styles.row}>
        <Text style={rowLabelStyle}>Notifications</Text>
        <Switch
          value={prefs.notifications}
          onValueChange={(v) => setPreferences({ notifications: v })}
          thumbColor={
            prefs.notifications
              ? theme.colors.accent
              : "rgba(255,255,255,0.8)"
          }
          trackColor={{
            true: "rgba(180,107,255,0.45)",
            false: "rgba(255,255,255,0.24)",
          }}
          style={switchScaleStyle}
        />
      </View>
      <View style={styles.row}>
        <Text style={rowLabelStyle}>Appearance</Text>
        <Text style={rowValueStyle}>Purple</Text>
      </View>
    </View>
  );

  const realtimeCard = (
    <View style={cardStyle} key="realtime">
      <Text style={sectionTitleStyle}>Realtime (Dev)</Text>
      <Text style={sectionSubStyle}>Connect to a local WebSocket bridge.</Text>
      <View style={styles.row}>
        <Text style={rowLabelStyle}>Enable realtime</Text>
        <Switch
          value={realtime.enabled}
          onValueChange={(v) => setRealtime({ enabled: v })}
          thumbColor={
            realtime.enabled
              ? theme.colors.accent
              : "rgba(255,255,255,0.8)"
          }
          trackColor={{
            true: "rgba(180,107,255,0.45)",
            false: "rgba(255,255,255,0.24)",
          }}
          style={switchScaleStyle}
        />
      </View>
      <View style={styles.row}>
        <Text style={rowLabelStyle}>Status</Text>
        <View style={realtimeStatusPillStyle}>
          <Text style={realtimeStatusTextStyle}>{realtimeStatus.label}</Text>
        </View>
      </View>
      <Text style={rowLabelStyle}>WebSocket endpoint</Text>
      <TextInput
        value={realtime.wsUrl}
        onChangeText={(value) => setRealtime({ wsUrl: value })}
        placeholder="ws://localhost:8088"
        placeholderTextColor="rgba(255,255,255,0.45)"
        style={realtimeInputStyle}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );

  const supportCard = (
    <View style={cardStyle} key="support">
      <Text style={sectionTitleStyle}>Support</Text>
      <View style={styles.row}>
        <Text style={rowLabelStyle}>App Version</Text>
        <Text style={rowValueStyle}>1.0.0 (stub)</Text>
      </View>
      <Pressable
        style={secondaryWideBtnStyle}
        onPress={() => {}}
      >
        <Ionicons
          name="mail"
          size={Math.round(16 * scale)}
          color="rgba(60,60,80,0.9)"
        />
        <Text style={secondaryWideBtnTextStyle}>Send feedback</Text>
      </Pressable>
    </View>
  );
  const cards = [homeProfileCard, preferencesCard, realtimeCard, supportCard];
  const cardColumns = Array.from(
    { length: columnCount },
    () => [] as React.ReactNode[],
  );
  cards.forEach((card, index) => {
    cardColumns[index % columnCount].push(card);
  });

  const frameEnabled = isPortrait || isWide;

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <BackgroundLines />

      <View style={contentStyle}>
        <ScreenFrame
          isPortrait={isPortrait}
          enabled={frameEnabled}
          isWide={isWide}
          pad={framePad}
          radius={frameRadius}
        >
          <ScreenSectionLayout
            header={<Text style={headerTitleStyle}>Settings</Text>}
            headerWrapStyle={headerWrapStyle}
            showDivider={isWide}
            dividerWrapStyle={headerDividerWrapStyle}
            scrollStyle={styles.sectionsScroll}
            contentContainerStyle={sectionsScrollContentStyle}
            showsVerticalScrollIndicator={false}
          >
            <View style={cardsStackStyle}>
              {integrationsCard}
              {isWide && columnCount > 1 ? (
                <View style={cardsGridLandscapeStyle}>
                  {cardColumns.map((column, index) => (
                    <View
                      key={`settings-column-${index}`}
                      style={cardsColumnStyle}
                    >
                      {column}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.cardsGrid}>{cards}</View>
              )}
            </View>
          </ScreenSectionLayout>
        </ScreenFrame>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: "center" },
  sectionsScroll: { flex: 1 },
  h1: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 12,
  },
  cardsGrid: { gap: 12, width: "100%" },
  cardsGridLandscape: { flexDirection: "row", alignItems: "flex-start" },
  cardsColumn: { flex: 1 },
  cardsStack: { width: "100%" },

  card: {
    borderRadius: 28,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  cardLandscape: { marginTop: 0 },
  heroCard: {
    marginTop: 0,
    padding: 0,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.38)",
    position: "relative",
    overflow: "hidden",
  },
  heroBackdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  heroGlow: {
    position: "absolute",
    top: -80,
    right: -120,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(122,92,255,0.35)",
  },
  heroGlowSecondary: {
    position: "absolute",
    bottom: -110,
    left: -120,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(180,107,255,0.25)",
  },
  heroContent: { position: "relative", zIndex: 1 },
  heroLayout: {
    width: "100%",
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  heroLayoutLandscape: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  heroColumn: { flex: 1 },
  heroPanel: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroIdentity: {
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 8,
  },
  heroIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroIdentityText: { flex: 1, alignItems: "flex-start" },
  heroIconWrap: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: theme.colors.text, fontWeight: "900" },
  heroSub: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginTop: 4,
  },
  heroBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  heroBadgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  heroBadgeText: { color: theme.colors.text, fontWeight: "800" },
  heroMeta: {
    width: "100%",
    alignItems: "flex-start",
    gap: 12,
  },
  heroStatsRow: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-start",
  },
  heroStatPill: {
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  heroStatText: { color: theme.colors.text, fontWeight: "800" },
  heroProgressWrap: {
    marginTop: 16,
    gap: 8,
    width: "100%",
    alignItems: "flex-start",
  },
  heroProgressTrack: {
    height: 6,
    width: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
  },
  heroProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(122,92,255,0.9)",
  },
  heroProgressMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  heroHint: { color: theme.colors.subtext, fontWeight: "700" },
  heroActions: {
    width: "100%",
    alignItems: "flex-start",
    gap: 14,
  },
  heroIntegrationList: { width: "100%" },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: "900",
    marginBottom: 12,
  },
  sectionSub: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginBottom: 12,
  },

  integrationRow: {
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  integrationLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  integrationIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  integrationText: { flex: 1, minWidth: 0 },
  integrationLabel: {
    color: "rgba(255,255,255,0.95)",
    fontWeight: "900",
    flexShrink: 1,
  },
  integrationSub: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginTop: 2,
    flexShrink: 1,
  },

  integrationActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  integrationActionsLandscape: {
    marginTop: 10,
    alignItems: "flex-start",
  },
  statusPill: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statusPillLandscape: { maxWidth: 120 },
  statusOn: {
    backgroundColor: "rgba(180,107,255,0.22)",
    borderColor: "rgba(180,107,255,0.35)",
  },
  statusOff: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.16)",
  },
  statusLinking: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.20)",
  },
  statusError: {
    backgroundColor: "rgba(255,120,140,0.18)",
    borderColor: "rgba(255,120,140,0.35)",
  },
  statusText: { fontWeight: "900", fontSize: 12 },
  statusTextOn: { color: theme.colors.text },
  statusTextOff: { color: theme.colors.subtext },
  realtimeInput: {
    marginTop: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    color: theme.colors.text,
    fontWeight: "700",
  },

  integrationButtons: { flexDirection: "row", alignItems: "center", gap: 10 },
  integrationButtonsLandscape: {
    flexWrap: "wrap",
    justifyContent: "flex-end",
    flexShrink: 1,
    gap: 8,
  },
  primaryBtn: {
    height: 40,
    borderRadius: 16,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(180,107,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  secondaryBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 12,
  },
  rowLabel: {
    color: theme.colors.text,
    fontWeight: "800",
    flexShrink: 1,
  },
  rowValue: {
    color: theme.colors.subtext,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "60%",
  },

  secondaryWideBtn: {
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryWideBtnText: { color: "rgba(255,255,255,0.92)", fontWeight: "900" },
});
