import React, { useMemo } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../app/AppNavigator";
import { useResponsive } from "../theme/layout";
import { useHomeStore } from "../store/useHomeStore";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
};

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    title: "Air Conditioner",
    body: "Set to 22°C • Cool",
    time: "Just now",
  },
  {
    id: "n2",
    title: "Bedroom AC",
    body: "Scene “Movie Time” applied",
    time: "5m ago",
  },
  {
    id: "n3",
    title: "Automation",
    body: "Night Cool scheduled for 9:00 PM",
    time: "1h ago",
  },
];

export default function NotificationsScreen() {
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(900);
  const isWide = isTablet && isLandscape;
  const iconBtnSize = Math.round((isTablet ? 46 : 40) * scale);
  const iconBtnRadius = Math.round(iconBtnSize * 0.4);
  const titleSize = Math.round((isTablet ? 26 : 24) * scale);
  const cardPad = Math.round((isTablet ? 18 : 14) * scale);
  const cardRadius = Math.round((isTablet ? 22 : 18) * scale);
  const iconWrapSize = Math.round((isTablet ? 40 : 36) * scale);
  const iconWrapRadius = Math.round(iconWrapSize * 0.34);
  const iconSize = Math.round((isTablet ? 20 : 18) * scale);
  const textSize = Math.round((isTablet ? 14 : 13) * scale);
  const bodySize = Math.round((isTablet ? 13 : 12) * scale);
  const gap = Math.round((isTablet ? 16 : 10) * scale);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const energy = useHomeStore((s) =>
    s.devices.find((device) => device.kind === "energy"),
  );
  const powerOutage =
    energy?.gridAvailable === false && (energy?.gridOutageAlerts ?? true);
  const solarActive = (energy?.solarW ?? 0) > 0;
  const notifications = useMemo(() => {
    if (!powerOutage) return MOCK_NOTIFICATIONS;
    const outageNotice: NotificationItem = {
      id: "n-power-outage",
      title: "Power outage",
      body: solarActive
        ? "Main power offline • Solar active"
        : "Main power offline • Backup required",
      time: "Just now",
    };
    return [outageNotice, ...MOCK_NOTIFICATIONS];
  }, [powerOutage, solarActive]);

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={[styles.root, { paddingTop: topPad }]}
    >
      <View
        style={[
          styles.topBar,
          {
            paddingHorizontal: gutter,
            width: contentWidth,
            alignSelf: "center",
          },
        ]}
      >
        <Pressable
          style={[
            styles.iconBtn,
            {
              width: iconBtnSize,
              height: iconBtnSize,
              borderRadius: iconBtnRadius,
            },
          ]}
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate("Main");
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.h1, { fontSize: titleSize }]}>Notifications</Text>
        <View style={{ width: iconBtnSize }} />
      </View>
      <View
        style={{
          width: contentWidth,
          alignSelf: "center",
          paddingHorizontal: isTablet ? 0 : gutter,
        }}
      >
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          numColumns={isWide ? 2 : 1}
          columnWrapperStyle={isWide ? { gap } : undefined}
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: Math.round(
              (isTablet ? (isLandscape ? 120 : 140) : 24) * scale,
            ),
            gap,
            paddingHorizontal: isTablet ? gutter : 0,
          }}
          style={{ width: "100%" }}
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                {
                  padding: cardPad,
                  borderRadius: cardRadius,
                  width: isWide ? (contentWidth - gap) / 2 : "100%",
                },
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  {
                    width: iconWrapSize,
                    height: iconWrapSize,
                    borderRadius: iconWrapRadius,
                  },
                ]}
              >
                <Ionicons
                  name="notifications"
                  size={iconSize}
                  color={theme.colors.text}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { fontSize: textSize }]}>
                  {item.title}
                </Text>
                <Text style={[styles.body, { fontSize: bodySize }]}>
                  {item.body}
                </Text>
              </View>
              <Text style={[styles.time, { fontSize: bodySize }]}>
                {item.time}
              </Text>
            </View>
          )}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  h1: { color: theme.colors.text, fontSize: 24, fontWeight: "900" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  title: { color: theme.colors.text, fontWeight: "900" },
  body: { color: theme.colors.subtext, fontWeight: "700", marginTop: 4 },
  time: { color: theme.colors.subtext, fontWeight: "700" },
});
