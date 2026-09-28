import { useEffect, useRef, useState } from "react";
import { Alert, Linking } from "react-native";
import Constants from "expo-constants";
import { runtimePolicy } from "../../config/runtimeMode";
import { useCommandActivityLauncher } from "../../components/command-feedback/CommandActivityContext";
import { bootstrapHome } from "../../services/cloudRegistry";
import { deviceClient, type ConnectionStatus } from "../../services/deviceClient";
import { selectVisibleDevices, selectVisibleRooms, useHomeStore } from "../../store/useHomeStore";

/** Subscribe to existing settings and delivery state without introducing another transport. */
export function useSettingsWorkspace() {
  const profile = useHomeStore((state) => state.profile);
  const userName = useHomeStore((state) => state.userName);
  const roomCount = useHomeStore((state) => selectVisibleRooms(state).length);
  const deviceCount = useHomeStore((state) => selectVisibleDevices(state).length);
  const preferences = useHomeStore((state) => state.preferences);
  const setPreferences = useHomeStore((state) => state.setPreferences);
  const realtime = useHomeStore((state) => state.realtime);
  const setRealtime = useHomeStore((state) => state.setRealtime);
  const commandActivity = useCommandActivityLauncher();
  const [connection, setConnection] = useState<ConnectionStatus>("disconnected");
  const [retry, setRetry] = useState<{ pending: number; nextAttemptAt?: number }>({ pending: 0 });
  const [cloudBusy, setCloudBusy] = useState(false);
  const cloudRequest = useRef(false);
  const homeTitle = profile.homeName?.trim() || (userName ? `${userName}'s Home` : "Your Home");
  const version = Constants.expoConfig?.version ?? "Unknown";
  const configuredEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
  const supportEmail = configuredEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredEmail) ? configuredEmail : null;
  const mqtt = {
    endpoint: process.env.EXPO_PUBLIC_MQTT_URL?.trim() ?? "",
    stateTopic: process.env.EXPO_PUBLIC_MQTT_TOPIC_STATE ?? "vantahome/devices/state",
    commandTopic: process.env.EXPO_PUBLIC_MQTT_TOPIC_COMMAND ?? "vantahome/devices/command",
    publishesState: (process.env.EXPO_PUBLIC_MQTT_PUBLISH_STATE ?? "").toLowerCase() === "true",
  };

  useEffect(() => {
    const unsubscribeConnection = deviceClient.subscribeConnection((event) => setConnection(event.status));
    const unsubscribeRetry = deviceClient.subscribeRetry(setRetry);
    return () => { unsubscribeConnection(); unsubscribeRetry(); };
  }, []);

  /** Keep completion feedback inside the account that requested setup. */
  async function initializeCloudHome() {
    if (cloudRequest.current) return;
    cloudRequest.current = true;
    setCloudBusy(true);
    const scope = useHomeStore.getState();
    const isCurrent = () => {
      const current = useHomeStore.getState();
      return scope.authenticatedUserId === current.authenticatedUserId && scope.sessionEpoch === current.sessionEpoch;
    };
    try {
      await bootstrapHome(homeTitle);
      if (isCurrent()) Alert.alert("Cloud home ready", "Your home is ready. Device connections still need setup.");
    } catch {
      if (isCurrent()) Alert.alert("Cloud setup unavailable", "Your home could not be initialized. Check your connection and sign-in, then try again.");
    } finally {
      cloudRequest.current = false;
      setCloudBusy(false);
    }
  }

  /** Open the configured support address only after an explicit feedback action. */
  async function sendFeedback() {
    if (!supportEmail) return;
    try {
      await Linking.openURL(`mailto:${supportEmail}?subject=${encodeURIComponent(`VantaHome ${version} feedback`)}`);
    } catch {
      Alert.alert("Email unavailable", "An email app could not be opened on this device.");
    }
  }

  let connectionLabel = "Disabled";
  if (realtime.enabled) {
    if (!(realtime.useMqtt ? mqtt.endpoint : realtime.wsUrl).trim()) connectionLabel = "Endpoint required";
    else {
      const status = realtime.useMqtt ? realtime.mqttStatus : connection;
      connectionLabel = status === "connected" ? "Connected" : status === "connecting" ? "Connecting" : status === "error" ? "Connection error" : "Offline";
    }
  }
  let retryLabel = retry.pending ? `${retry.pending} pending` : "None";
  if (retry.pending && retry.nextAttemptAt) retryLabel += ` · next ${new Date(retry.nextAttemptAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return {
    homeTitle, roomCount, deviceCount, preferences, setPreferences, realtime, setRealtime,
    commandActivity, cloudBusy, initializeCloudHome, version, supportEmail, sendFeedback,
    mqtt, connectionLabel, retryLabel, developmentTools: runtimePolicy.allowDirectMqtt,
    runtimeLabel: runtimePolicy.mode === "demo" ? "Demo · local simulation" : runtimePolicy.mode,
  };
}

export type SettingsWorkspaceModel = ReturnType<typeof useSettingsWorkspace>;
