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
import { runtimePolicy } from "../config/runtimeMode";

/** Keep room scenes beside the device collection, with one tap to recall a setting. */
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
  const chipHeight = Math.max(44, Math.round(44 * scale));
  const chipRadius = theme.radius.sm;
  const pillHeight = Math.max(44, Math.round((isTablet ? 48 : 44) * scale));
  const pillRadius = theme.radius.sm;
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
  const wrapStyle: StyleProp<ViewStyle> = styles.wrap;
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
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={rowContentStyle}
      >
        {scenes.map((s) => (
          <Pressable
            key={s.id}
            accessibilityLabel={`Run ${s.name} scene`}
            accessibilityState={{ selected: s.id === activeSceneId }}
            style={pillStyle(s.id === activeSceneId)}
            onPress={() => onRun(s.id)}
          >
            <Ionicons name="sparkles-outline" size={15} color={theme.colors.accentText} />
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
            colors={[theme.colors.card, theme.colors.card2]}
            start={{ x: 0.1, y: 0.1 }}
            end={{ x: 1, y: 1 }}
            style={infoCardStyle}
          >
            <Text style={infoTitleStyle}>One-tap scenes</Text>
            <Text style={infoTextStyle}>
              {runtimePolicy.requireRealTransport
                ? "Tap a scene chip to request its settings. Devices update after their state is observed. Undo requests the previous settings."
                : "Tap a scene chip to apply it instantly to this room. You can undo for a few seconds after it runs."}
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
  wrap: { flexShrink: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  h: { color: theme.colors.text, fontWeight: "600", fontSize: 16 },
  hChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  hChipPressed: { transform: [{ scale: 0.98 }] },
  hChipText: { color: theme.colors.subtext, fontWeight: "600", fontSize: 12 },

  row: { gap: 10, paddingTop: 12, paddingBottom: 6 },
  pill: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 18,
    backgroundColor: theme.colors.card2,
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: {
    backgroundColor: theme.colors.bg1,
    borderColor: theme.colors.accent,
  },
  pillText: { color: theme.colors.text, fontWeight: "600" },
  pillTextActive: { color: theme.colors.accentText },
  infoOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlayStrong,
    justifyContent: "center",
    padding: 18,
  },
  infoBackdrop: { ...StyleSheet.absoluteFillObject },
  infoCard: {
    backgroundColor: theme.colors.glass,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignSelf: "center",
  },
  infoTitle: { color: theme.colors.text, fontWeight: "600" },
  infoText: {
    color: theme.colors.subtext,
    fontWeight: "400",
    marginTop: 8,
    lineHeight: 20,
  },
  infoButton: {
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  infoButtonText: { color: theme.colors.bg0, fontWeight: "600" },
});
