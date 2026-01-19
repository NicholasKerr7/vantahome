import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "./Pressable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { useHomeStore } from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import { LinearGradient } from "expo-linear-gradient";

export default function RoomScenesRow({
  title = "Scenes",
  scenes,
  onRun,
  horizontalInset,
}: {
  title?: string;
  scenes: Array<{ id: string; name: string }>;
  onRun: (sceneId: string) => void;
  horizontalInset?: number;
}) {
  const activeSceneId = useHomeStore((s) => s.activeSceneId);
  const { gutter, isTablet, scale, contentWidth } = useResponsive();
  const inset = horizontalInset ?? gutter;
  const titleSize = Math.round((isTablet ? 18 : 16) * scale);
  const chipHeight = Math.round((isTablet ? 36 : 32) * scale);
  const chipRadius = Math.round(chipHeight / 2);
  const pillHeight = Math.round((isTablet ? 46 : 40) * scale);
  const pillRadius = Math.round(pillHeight * 0.44);
  const pillText = Math.round((isTablet ? 13 : 12) * scale);
  const headerGap = Math.round((isTablet ? 8 : 6) * scale);
  const rowGap = Math.round((isTablet ? 12 : 10) * scale);
  const infoPad = Math.round((isTablet ? 20 : 16) * scale);
  const infoRadius = Math.round((isTablet ? 24 : 20) * scale);
  const infoTitleSize = Math.round((isTablet ? 18 : 16) * scale);
  const infoTextSize = Math.round((isTablet ? 13 : 12) * scale);
  const infoButtonHeight = Math.round((isTablet ? 44 : 40) * scale);
  const infoButtonRadius = Math.round(infoButtonHeight * 0.45);
  const [showInfo, setShowInfo] = useState(false);
  const wrapStyle: StyleProp<ViewStyle> = { marginTop: 14 };
  const headerStyle: StyleProp<ViewStyle> = [
    styles.header,
    { paddingHorizontal: inset },
  ];
  const headerTitleStyle: StyleProp<TextStyle> = [
    styles.h,
    { fontSize: titleSize },
  ];
  const headerChipStyle: StyleProp<ViewStyle> = [
    styles.hChip,
    {
      height: chipHeight,
      borderRadius: chipRadius,
      paddingHorizontal: headerGap * 2,
    },
  ];
  const headerChipTextStyle: StyleProp<TextStyle> = [
    styles.hChipText,
    { fontSize: pillText },
  ];
  const rowContentStyle: StyleProp<ViewStyle> = [
    styles.row,
    { paddingHorizontal: inset, gap: rowGap },
  ];
  const pillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.pill,
    {
      height: pillHeight,
      borderRadius: pillRadius,
      paddingHorizontal: Math.round(pillHeight * 0.4),
    },
    active && styles.pillActive,
  ];
  const pillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.pillText,
    { fontSize: pillText },
    active && styles.pillTextActive,
  ];
  const infoCardStyle: StyleProp<ViewStyle> = [
    styles.infoCard,
    {
      padding: infoPad,
      borderRadius: infoRadius,
      maxWidth: isTablet ? 520 : undefined,
      width: isTablet ? Math.min(contentWidth - gutter * 2, 520) : undefined,
    },
  ];
  const infoTitleStyle: StyleProp<TextStyle> = [
    styles.infoTitle,
    { fontSize: infoTitleSize },
  ];
  const infoTextStyle: StyleProp<TextStyle> = [
    styles.infoText,
    { fontSize: infoTextSize },
  ];
  const infoButtonStyle: StyleProp<ViewStyle> = [
    styles.infoButton,
    { height: infoButtonHeight, borderRadius: infoButtonRadius },
  ];
  const infoButtonTextStyle: StyleProp<TextStyle> = [
    styles.infoButtonText,
    { fontSize: infoTextSize },
  ];

  if (!scenes.length) return null;

  return (
    <View style={wrapStyle}>
      <View style={headerStyle}>
        <Text style={headerTitleStyle}>{title}</Text>
        <Pressable
          style={headerChipStyle}
          pressedStyle={styles.hChipPressed}
          onPress={() => setShowInfo(true)}
        >
          <Ionicons
            name="information-circle"
            size={Math.round((isTablet ? 16 : 14) * scale)}
            color={theme.colors.text}
          />
          <Text style={headerChipTextStyle}>
            How it works
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={rowContentStyle}
      >
        {scenes.map((s) => (
          <Pressable
            key={s.id}
            style={pillStyle(s.id === activeSceneId)}
            onPress={() => onRun(s.id)}
          >
            <Text style={pillTextStyle(s.id === activeSceneId)}>
              {s.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Modal
        transparent
        visible={showInfo}
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <View style={styles.infoOverlay}>
          <Pressable
            style={styles.infoBackdrop}
            onPress={() => setShowInfo(false)}
          />
          <LinearGradient
            colors={["rgba(255,255,255,0.98)", "rgba(245,238,255,0.92)"]}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={infoCardStyle}
          >
            <Text style={infoTitleStyle}>One-tap scenes</Text>
            <Text style={infoTextStyle}>
              Tap a scene chip to apply it instantly to this room. You can undo
              for a few seconds after it runs.
            </Text>
            <Pressable
              style={infoButtonStyle}
              onPress={() => setShowInfo(false)}
            >
              <Text style={infoButtonTextStyle}>Got it</Text>
            </Pressable>
          </LinearGradient>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h: { color: theme.colors.text, fontWeight: "900", fontSize: 16 },
  hChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  hChipPressed: { transform: [{ scale: 0.98 }] },
  hChipText: { color: theme.colors.subtext, fontWeight: "800", fontSize: 12 },

  row: { gap: 10, paddingTop: 12, paddingBottom: 6 },
  pill: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 18,
    backgroundColor: "rgba(180,107,255,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: {
    backgroundColor: "rgba(180,107,255,0.42)",
    borderColor: "rgba(180,107,255,0.75)",
    shadowColor: theme.colors.glow,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  pillText: { color: theme.colors.text, fontWeight: "900" },
  pillTextActive: { color: "#FFFFFF" },
  infoOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
    justifyContent: "center",
    padding: 18,
  },
  infoBackdrop: { ...StyleSheet.absoluteFillObject },
  infoCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    alignSelf: "center",
  },
  infoTitle: { color: "#1B1535", fontWeight: "900" },
  infoText: {
    color: "rgba(12,12,18,0.62)",
    fontWeight: "700",
    marginTop: 8,
    lineHeight: 18,
  },
  infoButton: {
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6B3CFF",
  },
  infoButtonText: { color: "#FFFFFF", fontWeight: "900" },
});
