import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Pressable from "./Pressable";
import { theme } from "../theme/theme";
import type { AnalyticsDatasets, AnalyticsWindow } from "../data/analyticsHistory";

type Props = {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  datasets: AnalyticsDatasets;
  cardStyle?: StyleProp<ViewStyle>;
  accentColor?: string;
};

const WINDOW_OPTIONS: AnalyticsWindow[] = ["24h", "7d"];

export default function AnalyticsHistoryCard({
  title,
  subtitle,
  icon,
  datasets,
  cardStyle,
  accentColor = theme.colors.accent,
}: Props) {
  const [window, setWindow] = useState<AnalyticsWindow>("24h");
  const dataset = datasets[window];
  const maxValue = useMemo(
    () => Math.max(...dataset.points.map((point) => point.value), 0),
    [dataset.points],
  );

  return (
    <View style={[styles.card, cardStyle]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <View style={[styles.iconWrap, { borderColor: accentColor }]}>
            <Ionicons name={icon} size={16} color={accentColor} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        <View style={styles.windowRow}>
          {WINDOW_OPTIONS.map((option) => {
            const active = option === window;
            return (
              <Pressable
                key={option}
                style={[
                  styles.windowChip,
                  active && { backgroundColor: accentColor, borderColor: accentColor },
                ]}
                onPress={() => setWindow(option)}
              >
                <Text style={[styles.windowChipText, active && styles.windowChipTextActive]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.summary}>{dataset.summary}</Text>

      <View style={styles.statsRow}>
        {dataset.stats.map((stat) => (
          <View key={`${title}-${window}-${stat.label}`} style={styles.statCard}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.chartFrame}>
        {dataset.points.map((point, index) => {
          const height =
            maxValue > 0 ? Math.max(8, (point.value / maxValue) * 84) : 8;
          const emphasized = index === dataset.points.length - 1;
          return (
            <View key={`${title}-${window}-${point.label}-${index}`} style={styles.barSlot}>
              <View
                style={[
                  styles.bar,
                  {
                    height,
                    backgroundColor: accentColor,
                    opacity: emphasized ? 1 : 0.6,
                  },
                ]}
              />
              <Text style={styles.barLabel}>{point.label}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.footer}>{dataset.footer ?? dataset.emptyText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: theme.colors.text, fontWeight: "900", fontSize: 14 },
  subtitle: {
    color: theme.colors.subtext,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 2,
  },
  windowRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  windowChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  windowChipText: {
    color: theme.colors.subtext,
    fontWeight: "800",
    fontSize: 11,
  },
  windowChipTextActive: {
    color: "#FFFFFF",
  },
  summary: {
    color: theme.colors.subtext,
    fontWeight: "700",
    fontSize: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: "rgba(8,10,18,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  statValue: {
    color: theme.colors.text,
    fontWeight: "900",
    fontSize: 14,
  },
  statLabel: {
    color: theme.colors.subtext,
    fontWeight: "700",
    fontSize: 11,
    marginTop: 4,
  },
  chartFrame: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 108,
  },
  barSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    minWidth: 0,
  },
  bar: {
    width: "100%",
    borderRadius: 999,
    minHeight: 8,
  },
  barLabel: {
    color: theme.colors.subtext,
    fontWeight: "700",
    fontSize: 10,
    textAlign: "center",
  },
  footer: {
    color: theme.colors.subtext,
    fontWeight: "700",
    fontSize: 11,
  },
});
