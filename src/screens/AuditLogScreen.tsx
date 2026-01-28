import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import ScreenFrame from "../components/ScreenFrame";
import { theme } from "../theme/theme";
import { useResponsive } from "../theme/layout";
import Pressable from "../components/Pressable";
import { supabase } from "../services/supabaseClient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "AuditLog">;

type AuditRow = {
  id: string;
  action: string;
  actor_name: string | null;
  actor_email: string | null;
  created_at: string;
  payload: Record<string, unknown>;
};

export default function AuditLogScreen({ navigation }: Props) {
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(900);
  const isWide = isTablet && isLandscape;
  const insets = useSafeAreaInsets();
  const cardPad = Math.round((isTablet ? 18 : 14) * scale);
  const cardRadius = Math.round((isTablet ? 22 : 18) * scale);
  const titleSize = Math.round((isTablet ? 26 : 22) * scale);
  const subSize = Math.round((isTablet ? 13 : 12) * scale);
  const rowSize = Math.round((isTablet ? 13 : 12) * scale);
  const gap = Math.round((isTablet ? 14 : 10) * scale);
  const framePad = Math.round((isTablet ? 12 : 10) * scale);
  const frameRadius = Math.round((isTablet ? 30 : 26) * scale);
  const tabInset = isTablet ? (isLandscape ? 28 : 24) : gutter;
  const tabBarInset = insets.bottom > 0 ? insets.bottom + 8 : tabInset;
  const tabBarHeight = Math.round(
    (isTablet ? (isLandscape ? 74 : 72) : 68) * scale,
  );
  const tabBarGap = Math.round((isTablet ? 12 : 8) * scale);
  const tabBarPad = tabBarInset + tabBarHeight + tabBarGap;

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const contentStyle: StyleProp<ViewStyle> = [
    styles.content,
    {
      paddingHorizontal: gutter,
      paddingTop: topPad,
      paddingBottom: tabBarPad,
    },
  ];
  const headerTitleStyle: StyleProp<TextStyle> = [
    styles.title,
    { fontSize: titleSize },
  ];
  const headerSubStyle: StyleProp<TextStyle> = [
    styles.subTitle,
    { fontSize: subSize },
  ];
  const rowTextStyle: StyleProp<TextStyle> = [
    styles.rowText,
    { fontSize: rowSize },
  ];

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setError("Supabase is not configured.");
      setRows([]);
      return;
    }
    let active = true;
    const fetchRows = async () => {
      const { data, error: fetchError } = await client
        .from("device_audit_logs")
        .select("id, action, actor_name, actor_email, created_at, payload")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!active) return;
      if (fetchError) {
        setError(fetchError.message);
        setRows([]);
        return;
      }
      setRows((data as AuditRow[]) ?? []);
    };
    fetchRows();
    return () => {
      active = false;
    };
  }, []);

  const cards = useMemo(
    () =>
      rows.map((row) => (
        <View key={row.id} style={[styles.card, { padding: cardPad, borderRadius: cardRadius }]}>
          <View style={styles.rowHeader}>
            <Text style={styles.action}>{row.action}</Text>
            <Text style={styles.time}>
              {new Date(row.created_at).toLocaleString()}
            </Text>
          </View>
          <Text style={rowTextStyle}>
            {row.actor_name || row.actor_email || "Unknown actor"}
          </Text>
          <Text style={styles.payloadText} numberOfLines={2}>
            {JSON.stringify(row.payload)}
          </Text>
        </View>
      )),
    [cardPad, cardRadius, rowTextStyle, rows],
  );

  return (
    <LinearGradient colors={[theme.colors.bg1, theme.colors.bg0]} style={styles.root}>
      <View style={contentStyle}>
        <ScreenFrame
          enabled={!isWide}
          isWide={isWide}
          isPortrait={!isLandscape}
          pad={framePad}
          radius={frameRadius}
        >
          <View style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={headerTitleStyle}>Device activity</Text>
              <Text style={headerSubStyle}>Recent changes across the home.</Text>
            </View>
          </View>
          {error ? (
            <Text style={styles.errorText}>Unable to load audit log: {error}</Text>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap }}
            >
              {cards.length ? cards : <Text style={styles.emptyText}>No activity yet.</Text>}
            </ScrollView>
          )}
        </ScreenFrame>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  headerText: { flex: 1 },
  title: { color: theme.colors.text, fontWeight: "900" },
  subTitle: { color: theme.colors.subtext, fontWeight: "700", marginTop: 4 },
  card: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  action: { color: theme.colors.text, fontWeight: "900" },
  time: { color: theme.colors.subtext, fontWeight: "700" },
  rowText: { color: theme.colors.text, fontWeight: "700" },
  payloadText: {
    marginTop: 6,
    color: theme.colors.subtext,
    fontWeight: "600",
  },
  errorText: { color: "#F27B8D", fontWeight: "700" },
  emptyText: { color: theme.colors.subtext, fontWeight: "700" },
});
