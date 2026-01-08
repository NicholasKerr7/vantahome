import React, { useMemo, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Animated,
  Easing,
  TextInput,
  Alert,
} from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import BackgroundLines from "../components/BackgroundLines";
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
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(900);
  const isWide = isTablet && isLandscape;
  const titleSize = Math.round((isTablet ? 30 : 26) * scale);
  const cardPad = Math.round((isTablet ? 20 : 16) * scale);
  const cardRadius = Math.round((isTablet ? 30 : 28) * scale);
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
  const [connection, setConnection] = useState<{
    status: ConnectionStatus;
    error?: string;
  }>({
    status: "disconnected",
  });
  const [cloudSyncLoading, setCloudSyncLoading] = useState(false);
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
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
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
    return () => unsubscribe();
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

    return (
      <View
        style={[
          styles.integrationRow,
          { paddingVertical: integrationPad, borderRadius: integrationRadius },
        ]}
        key={provider}
      >
        <View style={styles.integrationLeft}>
          <View
            style={[
              styles.integrationIcon,
              {
                width: integrationIconWrap,
                height: integrationIconWrap,
                borderRadius: Math.round(integrationIconWrap * 0.35),
              },
            ]}
          >
            <Ionicons
              name={icon}
              size={integrationIconSize}
              color="rgba(60,60,80,0.9)"
            />
          </View>
          <View>
            <Text style={[styles.integrationLabel, { fontSize: rowLabelSize }]}>
              {label}
            </Text>
            <Text style={[styles.integrationSub, { fontSize: rowValueSize }]}>
              {description}
            </Text>
          </View>
        </View>

        <View style={styles.integrationActions}>
          <Animated.View
            style={[
              styles.statusPill,
              { height: statusHeight, borderRadius: statusRadius },
              linked
                ? styles.statusOn
                : linking
                  ? styles.statusLinking
                  : styles.statusOff,
              linking && { opacity: pulse },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { fontSize: rowValueSize },
                linked ? styles.statusTextOn : styles.statusTextOff,
              ]}
            >
              {linked ? "Linked" : linking ? "Linking…" : "Not linked"}
            </Text>
          </Animated.View>

          <View style={styles.integrationButtons}>
            {linked ? (
              <>
                <Pressable
                  onPress={() => resyncIntegration(provider)}
                  style={[
                    styles.secondaryBtn,
                    {
                      width: buttonSize,
                      height: buttonSize,
                      borderRadius: Math.round(buttonSize * 0.35),
                    },
                  ]}
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
                  style={[
                    styles.secondaryBtn,
                    {
                      width: buttonSize,
                      height: buttonSize,
                      borderRadius: Math.round(buttonSize * 0.35),
                    },
                  ]}
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
                style={[
                  styles.primaryBtn,
                  { height: primaryBtnHeight, borderRadius: primaryBtnRadius },
                  linking && styles.primaryBtnDisabled,
                ]}
                hitSlop={10}
              >
                <Text
                  style={[styles.primaryBtnText, { fontSize: rowValueSize }]}
                >
                  {linking ? "Linking…" : "Link account"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <BackgroundLines />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isTablet ? gutter : 0,
            paddingTop: topPad,
            paddingBottom: tabBarPad,
          },
        ]}
      >
        <View
          style={{
            width: contentWidth,
            paddingHorizontal: isTablet ? 0 : gutter,
          }}
        >
          <Text style={[styles.h1, { fontSize: titleSize }]}>Settings</Text>

          <View
            style={[
              styles.cardsGrid,
              isWide && {
                flexDirection: "row",
                flexWrap: "wrap",
                gap: gridGap,
              },
            ]}
          >
            <View
              style={[
                styles.card,
                {
                  padding: cardPad,
                  borderRadius: cardRadius,
                  width: isWide ? (contentWidth - gridGap) / 2 : "100%",
                },
              ]}
            >
              <Text
                style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}
              >
                Voice & Integrations
              </Text>
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

            <View
              style={[
                styles.card,
                {
                  padding: cardPad,
                  borderRadius: cardRadius,
                  width: isWide ? (contentWidth - gridGap) / 2 : "100%",
                },
              ]}
            >
              <Text
                style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}
              >
                Home Profile
              </Text>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontSize: rowLabelSize }]}>
                  Home
                </Text>
                <Text style={[styles.rowValue, { fontSize: rowValueSize }]}>
                  {homeTitle}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontSize: rowLabelSize }]}>
                  Rooms
                </Text>
                <Text style={[styles.rowValue, { fontSize: rowValueSize }]}>
                  {roomsCount}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontSize: rowLabelSize }]}>
                  Devices
                </Text>
                <Text style={[styles.rowValue, { fontSize: rowValueSize }]}>
                  {devicesCount}
                </Text>
              </View>
              <Pressable
                style={[
                  styles.secondaryWideBtn,
                  {
                    marginTop: 12,
                    height: wideBtnHeight,
                    borderRadius: wideBtnRadius,
                  },
                ]}
                onPress={() => navigation.navigate("Profile")}
              >
                <Ionicons
                  name="person"
                  size={Math.round(16 * scale)}
                  color="rgba(60,60,80,0.9)"
                />
                <Text
                  style={[
                    styles.secondaryWideBtnText,
                    { fontSize: rowValueSize },
                  ]}
                >
                  Edit profile
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.primaryBtn,
                  {
                    marginTop: 12,
                    height: wideBtnHeight,
                    borderRadius: wideBtnRadius,
                  },
                  cloudSyncLoading && styles.primaryBtnDisabled,
                ]}
                onPress={handleCloudSync}
                disabled={cloudSyncLoading}
              >
                <Text
                  style={[styles.primaryBtnText, { fontSize: rowValueSize }]}
                >
                  {cloudSyncLoading ? "Syncing…" : "Resync to cloud"}
                </Text>
              </Pressable>
            </View>

            <View
              style={[
                styles.card,
                {
                  padding: cardPad,
                  borderRadius: cardRadius,
                  width: isWide ? (contentWidth - gridGap) / 2 : "100%",
                },
              ]}
            >
              <Text
                style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}
              >
                Preferences
              </Text>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontSize: rowLabelSize }]}>
                  Haptics
                </Text>
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
                  style={{ transform: [{ scale: isTablet ? 1.05 : 1 }] }}
                />
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontSize: rowLabelSize }]}>
                  Notifications
                </Text>
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
                  style={{ transform: [{ scale: isTablet ? 1.05 : 1 }] }}
                />
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontSize: rowLabelSize }]}>
                  Appearance
                </Text>
                <Text style={[styles.rowValue, { fontSize: rowValueSize }]}>
                  Purple
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.card,
                {
                  padding: cardPad,
                  borderRadius: cardRadius,
                  width: isWide ? (contentWidth - gridGap) / 2 : "100%",
                },
              ]}
            >
              <Text
                style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}
              >
                Realtime (Dev)
              </Text>
              <Text style={[styles.sectionSub, { fontSize: rowValueSize }]}>
                Connect to a local WebSocket bridge.
              </Text>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontSize: rowLabelSize }]}>
                  Enable realtime
                </Text>
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
                  style={{ transform: [{ scale: isTablet ? 1.05 : 1 }] }}
                />
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontSize: rowLabelSize }]}>
                  Status
                </Text>
                <View
                  style={[
                    styles.statusPill,
                    { height: statusHeight, borderRadius: statusRadius },
                    realtimeStatus.status === "connected"
                      ? styles.statusOn
                      : realtimeStatus.status === "connecting"
                        ? styles.statusLinking
                        : realtimeStatus.status === "error"
                          ? styles.statusError
                          : styles.statusOff,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { fontSize: rowValueSize },
                      realtimeStatus.status === "connected"
                        ? styles.statusTextOn
                        : styles.statusTextOff,
                    ]}
                  >
                    {realtimeStatus.label}
                  </Text>
                </View>
              </View>
              <Text style={[styles.rowLabel, { fontSize: rowLabelSize }]}>
                WebSocket endpoint
              </Text>
              <TextInput
                value={realtime.wsUrl}
                onChangeText={(value) => setRealtime({ wsUrl: value })}
                placeholder="ws://localhost:8088"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={[
                  styles.realtimeInput,
                  { height: inputHeight, borderRadius: inputRadius },
                ]}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View
              style={[
                styles.card,
                {
                  padding: cardPad,
                  borderRadius: cardRadius,
                  width: isWide ? (contentWidth - gridGap) / 2 : "100%",
                },
              ]}
            >
              <Text
                style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}
              >
                Support
              </Text>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { fontSize: rowLabelSize }]}>
                  App Version
                </Text>
                <Text style={[styles.rowValue, { fontSize: rowValueSize }]}>
                  1.0.0 (stub)
                </Text>
              </View>
              <Pressable
                style={[
                  styles.secondaryWideBtn,
                  {
                    marginTop: 12,
                    height: wideBtnHeight,
                    borderRadius: wideBtnRadius,
                  },
                ]}
                onPress={() => {}}
              >
                <Ionicons
                  name="mail"
                  size={Math.round(16 * scale)}
                  color="rgba(60,60,80,0.9)"
                />
                <Text
                  style={[
                    styles.secondaryWideBtnText,
                    { fontSize: rowValueSize },
                  ]}
                >
                  Send feedback
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { alignItems: "center" },
  h1: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 12,
  },
  cardsGrid: { gap: 12 },

  card: {
    borderRadius: 28,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: "900",
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
  integrationLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  integrationIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  integrationLabel: { color: "rgba(255,255,255,0.95)", fontWeight: "900" },
  integrationSub: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginTop: 2,
  },

  integrationActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  statusPill: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
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
  },
  rowLabel: { color: theme.colors.text, fontWeight: "800" },
  rowValue: { color: theme.colors.subtext, fontWeight: "800" },

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
