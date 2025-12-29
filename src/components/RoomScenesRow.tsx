import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import Pressable from "./Pressable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { useHomeStore } from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";

export default function RoomScenesRow({
  title = "Scenes",
  scenes,
  onRun,
}: {
  title?: string;
  scenes: Array<{ id: string; name: string }>;
  onRun: (sceneId: string) => void;
}) {
  const activeSceneId = useHomeStore((s) => s.activeSceneId);
  const { gutter, isTablet, scale } = useResponsive();
  const titleSize = Math.round((isTablet ? 18 : 16) * scale);
  const chipHeight = Math.round((isTablet ? 36 : 32) * scale);
  const chipRadius = Math.round(chipHeight / 2);
  const pillHeight = Math.round((isTablet ? 46 : 40) * scale);
  const pillRadius = Math.round(pillHeight * 0.44);
  const pillText = Math.round((isTablet ? 13 : 12) * scale);
  const headerGap = Math.round((isTablet ? 8 : 6) * scale);
  const rowGap = Math.round((isTablet ? 12 : 10) * scale);

  if (!scenes.length) return null;

  return (
    <View style={{ marginTop: 14 }}>
      <View style={[styles.header, { paddingHorizontal: gutter }]}>
        <Text style={[styles.h, { fontSize: titleSize }]}>{title}</Text>
        <View
          style={[
            styles.hChip,
            {
              height: chipHeight,
              borderRadius: chipRadius,
              paddingHorizontal: headerGap * 2,
            },
          ]}
        >
          <Ionicons
            name="sparkles"
            size={Math.round((isTablet ? 16 : 14) * scale)}
            color={theme.colors.text}
          />
          <Text style={[styles.hChipText, { fontSize: pillText }]}>
            One tap
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.row,
          { paddingHorizontal: gutter, gap: rowGap },
        ]}
      >
        {scenes.map((s) => (
          <Pressable
            key={s.id}
            style={[
              styles.pill,
              {
                height: pillHeight,
                borderRadius: pillRadius,
                paddingHorizontal: Math.round(pillHeight * 0.4),
              },
              s.id === activeSceneId && styles.pillActive,
            ]}
            onPress={() => onRun(s.id)}
          >
            <Text
              style={[
                styles.pillText,
                { fontSize: pillText },
                s.id === activeSceneId && styles.pillTextActive,
              ]}
            >
              {s.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
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
});
