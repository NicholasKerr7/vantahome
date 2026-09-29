import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import {
  DeepScreen,
  DeepCard,
  DeepAction,
  DeepPager,
} from "../components/deep/DeepScreen";
import ModalCard from "../components/ModalCard";
import { theme } from "../theme/theme";
import { supabase } from "../services/supabaseClient";
import { useActivityPages } from "../features/activity/useActivityPages";

type Props = NativeStackScreenProps<RootStackParamList, "AuditLog">;
type AuditRow = {
  id: string;
  action: string;
  actor_name: string | null;
  actor_email: string | null;
  created_at: string;
  payload: Record<string, unknown>;
};
const DIALOG_COLORS = [theme.colors.bg0, theme.colors.bg1] as const;

/** Validate external audit rows before rendering dates or structured event details. */
function isAuditRow(value: unknown): value is AuditRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.action === "string" &&
    typeof row.created_at === "string" &&
    Number.isFinite(Date.parse(row.created_at)) &&
    (row.actor_name === null || typeof row.actor_name === "string") &&
    (row.actor_email === null || typeof row.actor_email === "string") &&
    Boolean(
      row.payload &&
      typeof row.payload === "object" &&
      !Array.isArray(row.payload),
    )
  );
}

/** Turn service action names into readable event headings while retaining the original in details. */
function actionLabel(action: string) {
  const label = action.replace(/[_.-]+/g, " ").trim();
  return label ? label[0].toUpperCase() + label.slice(1) : "Device update";
}

/** A paged timeline of household changes with optional complete event details. */
export default function AuditLogScreen({ navigation }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);
  const pages = useActivityPages(rows.length, 128);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      setRows([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    /** Load the existing bounded remote history and ignore results after this view closes. */
    async function fetchRows() {
      try {
        const { data, error: fetchError } = await client!
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
        if (!Array.isArray(data)) {
          setRows([]);
          return;
        }
        const validRows = data.filter(isAuditRow);
        if (validRows.length !== data.length) {
          setError(
            "Some activity records could not be read. Please try again.",
          );
          setRows([]);
          return;
        }
        setRows(validRows);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The activity service could not be reached.",
          );
          setRows([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void fetchRows();
    return () => {
      active = false;
    };
  }, [refresh]);

  return (
    <DeepScreen
      title="Device activity"
      eyebrow="HOME HISTORY"
      subtitle="A record of the changes made across your home."
      onBack={() => navigation.goBack()}
      actions={
        supabase ? (
          <DeepAction
            label="Refresh"
            icon="refresh-outline"
            onPress={() => setRefresh((value) => value + 1)}
            disabled={loading}
          />
        ) : undefined
      }
    >
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>
          {loading ? "Loading history" : `${rows.length} recent events`}
        </Text>
        <Text style={styles.summaryLabel}>Newest first</Text>
      </View>
      <View style={styles.list} onLayout={pages.onLayout}>
        {loading ? (
          <DeepCard style={styles.empty}>
            <ActivityIndicator color={theme.colors.accentText} />
            <Text style={styles.description}>Loading your home activity…</Text>
          </DeepCard>
        ) : error ? (
          <DeepCard style={styles.empty}>
            <Ionicons
              name="cloud-offline-outline"
              size={32}
              color={theme.colors.accentText}
            />
            <Text style={styles.eventTitle}>Activity unavailable</Text>
            <Text style={styles.description}>
              Unable to load audit log: {error}
            </Text>
            <DeepAction
              label="Try again"
              onPress={() => setRefresh((value) => value + 1)}
              icon="refresh-outline"
            />
          </DeepCard>
        ) : rows.length ? (
          rows.slice(pages.start, pages.start + pages.pageSize).map((row) => (
            <DeepCard key={row.id} style={styles.event}>
              <View style={styles.eventHeading}>
                <View style={styles.eventIcon}>
                  <Ionicons
                    name="pulse-outline"
                    size={20}
                    color={theme.colors.accentText}
                  />
                </View>
                <View style={styles.eventIdentity}>
                  <Text style={styles.eventTitle} numberOfLines={1}>
                    {actionLabel(row.action)}
                  </Text>
                  <Text style={styles.actor} numberOfLines={1}>
                    {row.actor_name || row.actor_email || "Unknown actor"}
                  </Text>
                </View>
                <DeepAction
                  label="Details"
                  accessibilityLabel={`Details for ${actionLabel(row.action)}`}
                  icon="arrow-forward-outline"
                  onPress={() => setSelectedRow(row)}
                />
              </View>
              <View style={styles.eventFooter}>
                <Text style={styles.time}>
                  {new Date(row.created_at).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
                <Text style={styles.time}>
                  {new Date(row.created_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </DeepCard>
          ))
        ) : (
          <DeepCard style={styles.empty}>
            <Ionicons
              name="time-outline"
              size={32}
              color={theme.colors.accentText}
            />
            <Text style={styles.eventTitle}>
              {supabase ? "No activity yet." : "Your history starts here"}
            </Text>
            <Text style={styles.description}>
              {supabase
                ? "Changes made to connected devices will appear here."
                : "Connect your home account to see its device history. Recent local commands are available in Command activity."}
            </Text>
          </DeepCard>
        )}
      </View>
      <DeepPager
        page={pages.page}
        pageCount={pages.pageCount}
        onChange={pages.setPage}
        label="activity"
      />
      <ModalCard
        visible={Boolean(selectedRow)}
        onRequestClose={() => setSelectedRow(null)}
        backdropAccessibilityLabel="Dismiss activity details"
        colors={DIALOG_COLORS}
        animationType="none"
        cardStyle={styles.detailCard}
      >
        <View style={styles.detailHeader}>
          <Text accessibilityRole="header" style={styles.detailTitle}>
            Event details
          </Text>
          <DeepAction label="Done" onPress={() => setSelectedRow(null)} />
        </View>
        {selectedRow ? (
          <ScrollView
            style={styles.detailScroll}
            bounces={false}
            overScrollMode="never"
            decelerationRate="normal"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.detailContent}
          >
            <Text style={styles.eventTitle}>
              {actionLabel(selectedRow.action)}
            </Text>
            <Text style={styles.description}>
              {selectedRow.actor_name ||
                selectedRow.actor_email ||
                "Unknown actor"}
            </Text>
            <Text style={styles.time}>
              {new Date(selectedRow.created_at).toLocaleString()}
            </Text>
            <View style={styles.detailDivider} />
            <Text style={styles.detailLabel}>EVENT</Text>
            <Text selectable style={styles.description}>
              {selectedRow.action}
            </Text>
            <Text style={styles.detailLabel}>DETAILS</Text>
            <Text selectable style={styles.payload}>
              {JSON.stringify(selectedRow.payload, null, 2)}
            </Text>
          </ScrollView>
        ) : null}
      </ModalCard>
    </DeepScreen>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryValue: { color: theme.colors.text, fontSize: 21, fontWeight: "500" },
  summaryLabel: { color: theme.colors.muted, fontSize: 11 },
  list: { flex: 1, minHeight: 0, gap: 12 },
  event: {
    minHeight: 128,
    justifyContent: "space-between",
    padding: 16,
    gap: 16,
  },
  eventHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  eventIdentity: { flex: 1, minWidth: 0, gap: 5 },
  eventTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "500" },
  actor: { color: theme.colors.subtext, fontSize: 12 },
  eventFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.stroke,
    paddingTop: 10,
  },
  time: { color: theme.colors.muted, fontSize: 11 },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  description: { color: theme.colors.subtext, fontSize: 13, lineHeight: 20 },
  detailCard: {
    alignSelf: "center",
    width: "92%",
    maxWidth: 620,
    maxHeight: "84%",
    padding: 22,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  detailTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "500",
  },
  detailScroll: { minHeight: 0, flexShrink: 1 },
  detailContent: { gap: 12, paddingBottom: 12 },
  detailDivider: {
    height: 1,
    backgroundColor: theme.colors.stroke,
    marginVertical: 8,
  },
  detailLabel: {
    color: theme.colors.accentText,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.4,
  },
  payload: { color: theme.colors.subtext, fontSize: 12, lineHeight: 20 },
});
