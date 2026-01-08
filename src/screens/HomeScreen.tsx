import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { theme } from "../theme/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AvatarChip from "../components/AvatarChip";
import GradientOrb from "../components/GradientOrb";
import BackgroundLines from "../components/BackgroundLines";
import RoomCarousel from "../components/RoomCarousel";
import {
  AC_TEMP_MAX_C,
  AC_TEMP_MIN_C,
  useHomeStore,
} from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import {
  notifyAirAlert,
  notifyPowerStatus,
  notifyWaterAlert,
} from "../services/notifications";
import { deviceClient } from "../services/deviceClient";
import Voice from "@react-native-voice/voice";

export default function HomeScreen() {
  const { contentWidth, gutter, isTablet, isLandscape, topPad, scale } =
    useResponsive(720);
  const greetingSize = Math.round((isTablet ? 22 : 16) * scale);
  const bellSize = Math.round((isTablet ? 44 : 38) * scale);
  const bellRadius = Math.round(bellSize * 0.36);
  const bellIcon = Math.round((isTablet ? 22 : 20) * scale);
  const roomsTitleSize = Math.round((isTablet ? 18 : 16) * scale);
  const roomsBtnHeight = Math.round((isTablet ? 38 : 34) * scale);
  const roomsBtnText = Math.round((isTablet ? 13 : 12) * scale);
  const roomsGap = Math.round((isTablet ? 10 : 8) * scale);
  const heroGap = Math.round((isTablet ? 28 : 16) * scale);
  const avatarSize = Math.round(
    (isTablet ? (isLandscape ? 48 : 52) : 38) * scale,
  );
  const topGutter = isTablet ? Math.max(12, gutter - 8) : gutter;
  const modalTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const modalSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const modalInputHeight = Math.round((isTablet ? 48 : 46) * scale);
  const modalButtonHeight = Math.round((isTablet ? 46 : 44) * scale);
  const insets = useSafeAreaInsets();
  const tabInset = isTablet ? (isLandscape ? 28 : 24) : gutter;
  const tabBarInset = insets.bottom > 0 ? insets.bottom + 8 : tabInset;
  const tabBarHeight = Math.round(
    (isTablet ? (isLandscape ? 74 : 72) : 68) * scale,
  );
  const tabBarGap = Math.round((isTablet ? 8 : 4) * scale);
  const tabBarPad = tabBarInset + tabBarHeight + tabBarGap;
  const nav = useNavigation<any>();
  const goRoot = (name: string, params?: Record<string, any>) => {
    // Navigate from nested stacks without needing to know the active parent.
    const parent = nav.getParent?.();
    if (parent?.navigate) parent.navigate(name as never, params as never);
    else nav.navigate(name as never, params as never);
  };

  const userName = useHomeStore((s) => s.userName);
  const profile = useHomeStore((s) => s.profile);
  const tempUnit = profile.tempUnit ?? "C";
  const outdoor = useHomeStore((s) => s.outdoor);
  const rooms = useHomeStore((s) => s.rooms);
  const devicesAll = useHomeStore((s) => s.devices);
  const prefs = useHomeStore((s) => s.preferences);
  const addRoom = useHomeStore((s) => s.addRoom);
  const indoorFallback = useHomeStore((s) => s.indoor);
  const [activeRoomIndex, setActiveRoomIndex] = useState(0);
  const lastPowerOutage = useRef<boolean | null>(null);
  const lastWaterAlert = useRef<{
    budgetExceeded: boolean;
    lowPressure: boolean;
    highPressure: boolean;
  } | null>(null);
  const lastAirAlert = useRef<
    Record<
      string,
      {
        aqi: boolean;
        co2: boolean;
        voc: boolean;
        pm25: boolean;
        pm10: boolean;
        pollen: boolean;
      }
    >
  >({});

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [showVoice, setShowVoice] = useState(false);
  const canCreate = roomName.trim().length > 1;
  const [clock, setClock] = useState(() => new Date());
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceTranscriptRef = useRef("");
  const runVoiceCommandRef = useRef<
    (raw: string) => { ok: boolean; message: string }
  >(() => ({ ok: false, message: "" }));
  const VOICE_TIMEOUT_MS = 6000;

  useEffect(() => {
    // Refresh greeting at minute granularity so it stays accurate without over-rendering.
    const timer = setInterval(() => setClock(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    Voice.onSpeechResults = (event: any) => {
      const phrase = event?.value?.[0]?.trim?.();
      if (phrase) {
        voiceTranscriptRef.current = phrase;
      }
    };
    Voice.onSpeechEnd = () => {
      const phrase = voiceTranscriptRef.current.trim();
      if (phrase) {
        runVoiceCommandRef.current(phrase);
      }
      voiceTranscriptRef.current = "";
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }
      setShowVoice(false);
    };
    Voice.onSpeechError = () => {
      voiceTranscriptRef.current = "";
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }
      setShowVoice(false);
    };
    return () => {
      Voice.destroy()
        .then(() => Voice.removeAllListeners())
        .catch(() => {});
    };
  }, []);

  const greeting = useMemo(() => {
    const hour = clock.getHours();
    if (hour < 5) return "Good night";
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    if (hour < 21) return "Good evening";
    return "Good night";
  }, [clock]);

  useEffect(() => {
    const energy = devicesAll.find((device) => device.kind === "energy");
    if (!energy) return;
    const currentOutage = energy.gridAvailable === false;
    const alertsEnabled = energy.gridOutageAlerts ?? true;
    if (lastPowerOutage.current === null) {
      lastPowerOutage.current = currentOutage;
      return;
    }
    if (!prefs.notifications || !alertsEnabled) {
      lastPowerOutage.current = currentOutage;
      return;
    }
    if (currentOutage !== lastPowerOutage.current) {
      lastPowerOutage.current = currentOutage;
      notifyPowerStatus({
        isOutage: currentOutage,
        solarActive: (energy.solarW ?? 0) > 0,
      }).catch(() => {});
    }
  }, [devicesAll, prefs.notifications]);

  useEffect(() => {
    const water = devicesAll.find((device) => device.kind === "water");
    if (!water) return;
    const waterBudget = water.waterBudgetL ?? 0;
    const waterToday = water.waterTodayL ?? 0;
    const budgetExceeded = waterBudget > 0 && waterToday >= waterBudget;
    const pressureLimit = water.waterPressureLowPsi ?? 40;
    const pressureHighLimit = water.waterPressureHighPsi ?? 80;
    const pressureAlerts = water.waterPressureAlerts ?? true;
    const pressureValue = water.waterPressurePsi ?? 0;
    const lowPressure =
      pressureAlerts && pressureValue > 0 && pressureValue < pressureLimit;
    const highPressure =
      pressureAlerts &&
      pressureHighLimit > 0 &&
      pressureValue > pressureHighLimit;

    if (lastWaterAlert.current === null) {
      lastWaterAlert.current = { budgetExceeded, lowPressure, highPressure };
      return;
    }

    if (!prefs.notifications) {
      lastWaterAlert.current = { budgetExceeded, lowPressure, highPressure };
      return;
    }

    if (budgetExceeded && !lastWaterAlert.current.budgetExceeded) {
      notifyWaterAlert({
        kind: "budget",
        current: waterToday,
        limit: waterBudget,
      }).catch(() => {});
    }
    if (lowPressure && !lastWaterAlert.current.lowPressure) {
      notifyWaterAlert({
        kind: "pressure-low",
        current: pressureValue,
        limit: pressureLimit,
      }).catch(() => {});
    }
    if (highPressure && !lastWaterAlert.current.highPressure) {
      notifyWaterAlert({
        kind: "pressure-high",
        current: pressureValue,
        limit: pressureHighLimit,
      }).catch(() => {});
    }

    lastWaterAlert.current = { budgetExceeded, lowPressure, highPressure };
  }, [devicesAll, prefs.notifications]);

  useEffect(() => {
    const airDevices = devicesAll.filter((device) => device.kind === "air");
    if (!airDevices.length) return;
    const nextState = { ...lastAirAlert.current };

    airDevices.forEach((device) => {
      const alertsEnabled = device.airAlertsEnabled ?? true;
      const aqiLimit = device.airAlertAqi ?? 100;
      const co2Limit = device.airAlertCo2 ?? 1200;
      const vocLimit = device.airAlertVoc ?? 300;
      const pm25Limit = device.airAlertPm25 ?? 35;
      const pm10Limit = device.airAlertPm10 ?? 50;
      const pollenLimit = device.airAlertPollen ?? 3;

      const aqi = device.airQualityIndex ?? 0;
      const co2 = device.airCo2 ?? 0;
      const voc = device.airVoc ?? 0;
      const pm25 = device.airPm25 ?? 0;
      const pm10 = device.airPm10 ?? 0;
      const pollen = device.airPollen ?? 0;

      const aqiExceeded = alertsEnabled && aqi > 0 && aqi >= aqiLimit;
      const co2Exceeded = alertsEnabled && co2 > 0 && co2 >= co2Limit;
      const vocExceeded = alertsEnabled && voc > 0 && voc >= vocLimit;
      const pm25Exceeded = alertsEnabled && pm25 > 0 && pm25 >= pm25Limit;
      const pm10Exceeded = alertsEnabled && pm10 > 0 && pm10 >= pm10Limit;
      const pollenExceeded =
        alertsEnabled && pollen > 0 && pollen >= pollenLimit;

      const prev = nextState[device.id] ?? {
        aqi: false,
        co2: false,
        voc: false,
        pm25: false,
        pm10: false,
        pollen: false,
      };

      if (prefs.notifications && alertsEnabled) {
        if (aqiExceeded && !prev.aqi) {
          notifyAirAlert({
            deviceName: device.name,
            kind: "aqi",
            current: aqi,
            limit: aqiLimit,
          }).catch(() => {});
        }
        if (co2Exceeded && !prev.co2) {
          notifyAirAlert({
            deviceName: device.name,
            kind: "co2",
            current: co2,
            limit: co2Limit,
          }).catch(() => {});
        }
        if (vocExceeded && !prev.voc) {
          notifyAirAlert({
            deviceName: device.name,
            kind: "voc",
            current: voc,
            limit: vocLimit,
          }).catch(() => {});
        }
        if (pm25Exceeded && !prev.pm25) {
          notifyAirAlert({
            deviceName: device.name,
            kind: "pm25",
            current: pm25,
            limit: pm25Limit,
          }).catch(() => {});
        }
        if (pm10Exceeded && !prev.pm10) {
          notifyAirAlert({
            deviceName: device.name,
            kind: "pm10",
            current: pm10,
            limit: pm10Limit,
          }).catch(() => {});
        }
        if (pollenExceeded && !prev.pollen) {
          notifyAirAlert({
            deviceName: device.name,
            kind: "pollen",
            current: pollen,
            limit: pollenLimit,
          }).catch(() => {});
        }
      }

      nextState[device.id] = {
        aqi: aqiExceeded,
        co2: co2Exceeded,
        voc: vocExceeded,
        pm25: pm25Exceeded,
        pm10: pm10Exceeded,
        pollen: pollenExceeded,
      };
    });

    lastAirAlert.current = nextState;
  }, [devicesAll, prefs.notifications]);

  const handleCreateRoom = () => {
    if (!canCreate) return;
    addRoom(roomName.trim());
    setRoomName("");
    setShowAddRoom(false);
  };

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const normalizeText = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9% ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const escapeRegex = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const includesWord = (text: string, word: string) => {
    if (!word) return false;
    return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(text);
  };

  const includesPhrase = (text: string, phrase: string) => {
    if (!phrase) return false;
    const tokens = phrase.split(" ").filter(Boolean).map(escapeRegex);
    if (!tokens.length) return false;
    return new RegExp(`\\b${tokens.join("\\s+")}\\b`, "i").test(text);
  };

  const matchesDeviceName = (deviceName: string, text: string) => {
    const name = normalizeText(deviceName);
    if (!name) return false;
    if (name.length <= 3) return includesWord(text, name);
    if (name.includes(" ")) return includesPhrase(text, name);
    return includesWord(text, name) || text.includes(name);
  };

  const runVoiceCommand = (raw: string) => {
    const normalized = normalizeText(raw);
    if (!normalized) {
      return { ok: false, message: "Say a command first." };
    }

    const wantsOn = /(turn on|switch on|enable)/.test(normalized);
    const wantsOff = /(turn off|switch off|disable)/.test(normalized);
    const brightnessMatch = normalized.match(/(\d{1,3})\s*%/);
    const tempMatch = normalized.match(/(\d{1,2})\s*(degrees|degree|c|f)\b/);

    const roomMatch = rooms.find((room) => {
      const roomName = normalizeText(room.name);
      return includesPhrase(normalized, roomName);
    });
    const scopedDevices = roomMatch
      ? devicesAll.filter((device) => device.roomId === roomMatch.id)
      : devicesAll;

    const nameMatches = scopedDevices.filter((device) =>
      matchesDeviceName(device.name, normalized),
    );
    let targets = nameMatches;

    if (targets.length === 0) {
      if (includesWord(normalized, "light") || includesWord(normalized, "lights"))
        targets = scopedDevices.filter((device) => device.kind === "light");
      else if (
        includesPhrase(normalized, "air conditioner") ||
        includesWord(normalized, "aircon") ||
        includesWord(normalized, "ac")
      )
        targets = scopedDevices.filter((device) => device.kind === "ac");
      else if (
        includesWord(normalized, "tv") ||
        includesPhrase(normalized, "television")
      )
        targets = scopedDevices.filter((device) => device.kind === "tv");
      else if (includesWord(normalized, "fan"))
        targets = scopedDevices.filter((device) => device.kind === "fan");
    }

    if (targets.length === 0) {
      return { ok: false, message: "No matching devices found." };
    }

    if (brightnessMatch) {
      const value = clamp(parseInt(brightnessMatch[1], 10), 0, 100);
      const lights = targets.filter((device) => device.kind === "light");
      if (lights.length === 0) {
        return { ok: false, message: "Brightness works for lights." };
      }
      lights.forEach((device) => {
        void deviceClient.sendCommand({
          op: "set-brightness",
          deviceId: device.id,
          value,
        });
      });
      return {
        ok: true,
        message: `Set ${lights.length} light${lights.length === 1 ? "" : "s"} to ${value}%.`,
      };
    }

    if (tempMatch) {
      let value = parseInt(tempMatch[1], 10);
      if (tempMatch[0].includes("f")) {
        value = Math.round((value - 32) / 1.8);
      }
      value = clamp(value, AC_TEMP_MIN_C, AC_TEMP_MAX_C);
      const acs = targets.filter((device) => device.kind === "ac");
      if (acs.length === 0) {
        return { ok: false, message: "Temperature works for AC units." };
      }
      acs.forEach((device) => {
        void deviceClient.sendCommand({
          op: "set-temp",
          deviceId: device.id,
          value,
        });
      });
      return {
        ok: true,
        message: `Set ${acs.length} AC${acs.length === 1 ? "" : "s"} to ${value}C.`,
      };
    }

    if (wantsOn || wantsOff) {
      const on =
        wantsOn && !wantsOff ? true : wantsOff && !wantsOn ? false : null;
      if (on === null) {
        return { ok: false, message: "Say turn on or turn off." };
      }
      targets.forEach((device) => {
        void deviceClient.sendCommand({
          op: "toggle",
          deviceId: device.id,
          on,
        });
      });
      return {
        ok: true,
        message: `Turned ${on ? "on" : "off"} ${targets.length} device${
          targets.length === 1 ? "" : "s"
        }.`,
      };
    }

    return {
      ok: false,
      message: "Try: Turn on lights or set AC to 22 degrees.",
    };
  };
  runVoiceCommandRef.current = runVoiceCommand;

  const handleVoicePress = async () => {
    if (showVoice) {
      try {
        await Voice.stop();
      } catch {
        // Ignore stop errors so the UI still recovers.
      }
      if (voiceTimeoutRef.current) {
        clearTimeout(voiceTimeoutRef.current);
        voiceTimeoutRef.current = null;
      }
      setShowVoice(false);
      return;
    }
    voiceTranscriptRef.current = "";
    setShowVoice(true);
    try {
      await Voice.start("en-US");
    } catch {
      setShowVoice(false);
      return;
    }
    if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
    voiceTimeoutRef.current = setTimeout(() => {
      Voice.stop().catch(() => {});
    }, VOICE_TIMEOUT_MS);
  };

  const activeRoom =
    rooms[Math.max(0, Math.min(activeRoomIndex, rooms.length - 1))];
  const roomDevices = useMemo(
    () => devicesAll.filter((d) => d.roomId === activeRoom?.id),
    [devicesAll, activeRoom?.id],
  );
  const indoorSensors = useMemo(
    () =>
      devicesAll.filter(
        (d) => d.kind === "air" && typeof d.tempC === "number",
      ),
    [devicesAll],
  );
  const featuredDevices = useMemo(() => {
    // Pick attention-worthy devices first, then fill with active/any devices.
    const picked: typeof devicesAll = [];
    const seen = new Set<string>();
    const add = (device?: (typeof devicesAll)[number]) => {
      if (!device || seen.has(device.id)) return;
      picked.push(device);
      seen.add(device.id);
    };

    const alerts = devicesAll.filter(
      (d) =>
        (d.kind === "smoke" && d.smokeDetected) ||
        (d.kind === "water" &&
          (d.waterLeakDetected ||
            ((d.waterBudgetL ?? 0) > 0 &&
              (d.waterTodayL ?? 0) >= (d.waterBudgetL ?? 0)) ||
            ((d.waterPressureAlerts ?? true) &&
              (d.waterPressurePsi ?? 0) > 0 &&
              ((d.waterPressurePsi ?? 0) < (d.waterPressureLowPsi ?? 40) ||
                (d.waterPressurePsi ?? 0) >
                  (d.waterPressureHighPsi ?? 80))))) ||
        (d.kind === "energy" &&
          d.gridAvailable === false &&
          (d.gridOutageAlerts ?? true)) ||
        (d.kind === "camera" && d.recording),
    );
    alerts.forEach(add);

    ["energy", "water", "camera"].forEach((kind) => {
      if (picked.length >= 3) return;
      add(devicesAll.find((d) => d.kind === kind));
    });

    if (picked.length < 3) {
      devicesAll.filter((d) => d.isOn).forEach(add);
    }

    if (picked.length < 3) {
      devicesAll.forEach(add);
    }

    return picked.slice(0, 3);
  }, [devicesAll]);
  const hasWholeHome = featuredDevices.length > 0;
  const roomAcs = roomDevices.filter(
    (d) => d.kind === "ac" && d.isOn && typeof d.tempC === "number",
  );
  const indoorSensorTemp =
    indoorSensors.length > 0
      ? Math.round(
          indoorSensors.reduce((sum, d) => sum + (d.tempC ?? 0), 0) /
            indoorSensors.length,
        )
      : null;
  const indoorEstimate =
    roomAcs.length > 0
      ? Math.round(
          roomAcs.reduce((sum, d) => sum + (d.tempC ?? 0), 0) / roomAcs.length,
        )
      : null;
  const indoorTemp =
    indoorFallback.source && indoorFallback.source !== "seed"
      ? indoorFallback.tempC
      : indoorSensorTemp ?? indoorEstimate ?? indoorFallback.tempC;
  const indoor = {
    ...indoorFallback,
    tempC: indoorTemp,
    label: indoorFallback.label,
  };

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <BackgroundLines />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingBottom: tabBarPad,
          },
        ]}
      >
        <View style={{ width: contentWidth }}>
          <View style={{ paddingHorizontal: topGutter, paddingTop: topPad }}>
            <View style={styles.topBar}>
              <Text
                style={[styles.greeting, { fontSize: greetingSize }]}
                numberOfLines={1}
              >
                {greeting}, {profile.name || userName}!
              </Text>
              <View style={styles.topActions}>
                <Pressable
                  style={[
                    styles.bell,
                    {
                      width: bellSize,
                      height: bellSize,
                      borderRadius: bellRadius,
                    },
                  ]}
                  onPress={() => goRoot("Notifications")}
                  testID="home-notifications-button"
                >
                  <Ionicons
                    name="notifications-outline"
                    size={bellIcon}
                    color={theme.colors.text}
                  />
                </Pressable>
                <Pressable
                  style={styles.avatarBtn}
                  onPress={() => goRoot("Profile")}
                  hitSlop={8}
                  testID="home-avatar-button"
                >
                  <AvatarChip
                    name={profile.name || userName}
                    color={profile.avatarColor}
                    uri={profile.avatarUri}
                    size={avatarSize}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.heroStack}>
            <GradientOrb
              outdoor={outdoor}
              indoor={indoor}
              unit={tempUnit}
              voiceActive={showVoice}
              onVoicePress={handleVoicePress}
            />

            <View
              style={[
                styles.roomsSection,
                { width: contentWidth, marginTop: heroGap },
              ]}
            >
              <View style={[styles.roomsHeader, { paddingHorizontal: gutter }]}>
                <Text style={[styles.roomsTitle, { fontSize: roomsTitleSize }]}>
                  Rooms
                </Text>
                <View style={[styles.roomsActions, { gap: roomsGap }]}>
                  <Pressable
                    style={[styles.roomsAdd, { height: roomsBtnHeight }]}
                    onPress={() => goRoot("ManageRooms")}
                  >
                    <Ionicons
                      name="settings-outline"
                      size={Math.round(14 * scale)}
                      color={theme.colors.text}
                    />
                    <Text
                      style={[styles.roomsAddText, { fontSize: roomsBtnText }]}
                    >
                      Manage
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.roomsAdd, { height: roomsBtnHeight }]}
                    onPress={() => setShowAddRoom(true)}
                  >
                    <Ionicons
                      name="add"
                      size={Math.round(16 * scale)}
                      color={theme.colors.text}
                    />
                    <Text
                      style={[styles.roomsAddText, { fontSize: roomsBtnText }]}
                    >
                      Add room
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.roomsCarouselWrap}>
                <RoomCarousel
                  rooms={rooms}
                  devices={devicesAll}
                  onRoomPress={(roomId) => goRoot("Room", { roomId })}
                  onDevicePress={(deviceId) =>
                    goRoot("DeviceDetail", { deviceId })
                  }
                  onIndexChange={(index) =>
                    setActiveRoomIndex(
                      hasWholeHome ? Math.max(0, index - 1) : index,
                    )
                  }
                  wholeHomeDevices={hasWholeHome ? featuredDevices : undefined}
                  onWholeHomePress={() => goRoot("Room", { showAll: true })}
                />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={showAddRoom}
        animationType="fade"
        onRequestClose={() => setShowAddRoom(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowAddRoom(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.select({ ios: "padding", android: undefined })}
          >
            <LinearGradient
              colors={["rgba(255,255,255,0.96)", "rgba(246,238,255,0.90)"]}
              start={{ x: 0.1, y: 0.1 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.modalCard,
                isTablet && {
                  maxWidth: 520,
                  width: Math.min(contentWidth - gutter * 2, 520),
                  alignSelf: "center",
                },
              ]}
            >
              <Text style={[styles.modalTitle, { fontSize: modalTitleSize }]}>
                Add room
              </Text>
              <Text style={[styles.modalSub, { fontSize: modalSubSize }]}>
                Name your space so it stays organized.
              </Text>

              <TextInput
                value={roomName}
                onChangeText={setRoomName}
                placeholder="Office, Patio, Studio..."
                placeholderTextColor="rgba(12,12,18,0.45)"
                style={[
                  styles.modalInput,
                  {
                    height: modalInputHeight,
                    borderRadius: Math.round(modalInputHeight * 0.3),
                  },
                ]}
                autoCapitalize="words"
                returnKeyType="done"
              />

              <View style={styles.modalRow}>
                <Pressable
                  style={[
                    styles.modalGhost,
                    {
                      height: modalButtonHeight,
                      borderRadius: Math.round(modalButtonHeight * 0.3),
                    },
                  ]}
                  onPress={() => setShowAddRoom(false)}
                >
                  <Text
                    style={[styles.modalGhostText, { fontSize: modalSubSize }]}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalPrimary,
                    {
                      height: modalButtonHeight,
                      borderRadius: Math.round(modalButtonHeight * 0.3),
                    },
                    !canCreate && styles.modalPrimaryDisabled,
                  ]}
                  onPress={handleCreateRoom}
                  disabled={!canCreate}
                >
                  <Text
                    style={[
                      styles.modalPrimaryText,
                      { fontSize: modalSubSize },
                    ]}
                  >
                    Create
                  </Text>
                </Pressable>
              </View>
            </LinearGradient>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  avatarBtn: { padding: 1 },
  greeting: { flex: 1, color: theme.colors.text, fontWeight: "800" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  bell: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroStack: { marginTop: 8, alignItems: "center" },
  roomsSection: { alignSelf: "center" },
  roomsCarouselWrap: { alignItems: "center" },
  roomsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  roomsActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  roomsTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16 },
  roomsAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  roomsAddText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.40)",
  },
  modalTitle: { color: "rgba(12,12,18,0.9)", fontWeight: "900", fontSize: 18 },
  modalSub: { color: "rgba(12,12,18,0.55)", fontWeight: "700", marginTop: 6 },
  modalInput: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    paddingHorizontal: 12,
    color: "rgba(12,12,18,0.9)",
    fontWeight: "700",
  },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalGhostText: { color: "rgba(12,12,18,0.75)", fontWeight: "800" },
  modalPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#6B3CFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryDisabled: { opacity: 0.6 },
  modalPrimaryText: { color: "#FFFFFF", fontWeight: "900" },
});
