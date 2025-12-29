import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Slider from "@react-native-community/slider";
import { theme } from "../theme/theme";
import {
  AC_TEMP_MAX_C,
  AC_TEMP_MIN_C,
  useHomeStore,
} from "../store/useHomeStore";
import BackgroundLines from "../components/BackgroundLines";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useResponsive } from "../theme/layout";
import { useNavigation } from "@react-navigation/native";

export default function AutomationsScreen() {
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(920);
  const isWide = isTablet && isLandscape;
  const titleSize = Math.round((isTablet ? 30 : 26) * scale);
  const subtitleSize = Math.round((isTablet ? 15 : 13) * scale);
  const pillHeight = Math.round((isTablet ? 36 : 32) * scale);
  const pillText = Math.round((isTablet ? 13 : 12) * scale);
  const sectionTitleSize = Math.round((isTablet ? 18 : 16) * scale);
  const sectionSubSize = Math.round((isTablet ? 13 : 12) * scale);
  const cardPad = Math.round((isTablet ? 18 : 16) * scale);
  const cardRadius = Math.round((isTablet ? 24 : 22) * scale);
  const cardTitleSize = Math.round((isTablet ? 16 : 14) * scale);
  const cardSubSize = Math.round((isTablet ? 13 : 12) * scale);
  const cardGap = Math.round((isTablet ? 18 : 12) * scale);
  const ctaHeight = Math.round((isTablet ? 48 : 44) * scale);
  const ctaRadius = Math.round(ctaHeight * 0.4);
  const modalPad = Math.round((isTablet ? 20 : 18) * scale);
  const modalRadius = Math.round((isTablet ? 24 : 22) * scale);
  const modalTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const modalSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const modalLabelSize = Math.round((isTablet ? 13 : 12) * scale);
  const modalInputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const modalBtnHeight = Math.round((isTablet ? 46 : 42) * scale);
  const rules = useHomeStore((s) => s.rules);
  const flows = useHomeStore((s) => s.flows);
  const toggleRule = useHomeStore((s) => s.toggleRule);
  const addRule = useHomeStore((s) => s.addRule);
  const updateRule = useHomeStore((s) => s.updateRule);
  const removeRule = useHomeStore((s) => s.removeRule);
  const toggleFlow = useHomeStore((s) => s.toggleFlow);
  const devices = useHomeStore((s) => s.devices);
  const navigation = useNavigation<any>();

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [hour, setHour] = useState("21");
  const [minute, setMinute] = useState("00");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    devices[0]?.id ?? null,
  );
  const [toggleOn, setToggleOn] = useState(true);
  const [temp, setTemp] = useState(22);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) ?? devices[0],
    [devices, selectedDeviceId],
  );
  const isAC = selectedDevice?.kind === "ac";

  const canCreate =
    selectedDevice && /^\d{1,2}$/.test(hour) && /^\d{1,2}$/.test(minute);
  const isEditing = modalMode === "edit";
  const editingRule = rules.find((r) => r.id === editingId);
  const flowSummary = (count: number, label: string) =>
    `${count} ${label}${count === 1 ? "" : "s"}`;

  const openAdd = () => {
    setEditingId(null);
    setRuleName("");
    setHour("21");
    setMinute("00");
    setSelectedDeviceId(devices[0]?.id ?? null);
    setToggleOn(true);
    setTemp(22);
    setModalMode("add");
  };

  const openEdit = (ruleId: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;
    setEditingId(rule.id);
    setRuleName(rule.name);
    setHour(String(rule.trigger.hour).padStart(2, "0"));
    setMinute(String(rule.trigger.minute).padStart(2, "0"));
    setSelectedDeviceId(rule.action.deviceId);
    if (rule.action.type === "set-ac") {
      setTemp(rule.action.tempC);
    } else {
      setToggleOn(rule.action.on);
    }
    setModalMode("edit");
  };

  const handleSubmit = () => {
    if (!selectedDevice) return;
    const h = Math.max(0, Math.min(23, parseInt(hour, 10)));
    const m = Math.max(0, Math.min(59, parseInt(minute, 10)));
    const name =
      ruleName.trim() ||
      `${selectedDevice.name} @ ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    const action =
      selectedDevice.kind === "ac"
        ? {
            type: "set-ac" as const,
            deviceId: selectedDevice.id,
            tempC: Math.max(AC_TEMP_MIN_C, Math.min(AC_TEMP_MAX_C, temp)),
            mode: selectedDevice.mode ?? "cold",
          }
        : {
            type: "toggle" as const,
            deviceId: selectedDevice.id,
            on: toggleOn,
          };

    if (isEditing && editingId) {
      updateRule(editingId, {
        name,
        trigger: { type: "time", hour: h, minute: m },
        action,
        enabled: editingRule?.enabled ?? true,
      });
    } else {
      addRule({
        name,
        enabled: true,
        trigger: { type: "time", hour: h, minute: m },
        action,
      });
    }

    setRuleName("");
    setModalMode(null);
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
            paddingBottom: Math.round(
              (isTablet ? (isLandscape ? 120 : 140) : 120) * scale,
            ),
          },
        ]}
      >
        <View
          style={{
            width: contentWidth,
            paddingHorizontal: isTablet ? 0 : gutter,
          }}
        >
          <View style={styles.header}>
            <View>
              <Text style={[styles.h1, { fontSize: titleSize }]}>
                Automations
              </Text>
              <Text style={[styles.p, { fontSize: subtitleSize }]}>
                Build flows and schedules.
              </Text>
            </View>
            <View style={styles.headerActions}>
              <View
                style={[
                  styles.countPill,
                  {
                    height: pillHeight,
                    borderRadius: Math.round(pillHeight / 2),
                  },
                ]}
              >
                <Ionicons
                  name="flash"
                  size={Math.round(14 * scale)}
                  color={theme.colors.text}
                />
                <Text style={[styles.countText, { fontSize: pillText }]}>
                  {flowSummary(flows.length, "Flow")}
                </Text>
              </View>
              <Pressable
                style={[
                  styles.addPill,
                  {
                    height: pillHeight,
                    borderRadius: Math.round(pillHeight / 2),
                  },
                ]}
                onPress={() => navigation.navigate("AutomationBuilder")}
              >
                <Ionicons
                  name="add"
                  size={Math.round(16 * scale)}
                  color={theme.colors.text}
                />
                <Text style={[styles.addText, { fontSize: pillText }]}>
                  New flow
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text
                style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}
              >
                Flows
              </Text>
              <Text style={[styles.sectionSub, { fontSize: sectionSubSize }]}>
                Triggers → Conditions → Actions
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.grid,
              isWide && {
                flexDirection: "row",
                flexWrap: "wrap",
                gap: cardGap,
              },
            ]}
          >
            {flows.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { padding: cardPad, borderRadius: cardRadius },
                ]}
              >
                <Text style={styles.emptyTitle}>No flows yet</Text>
                <Text style={styles.emptySub}>
                  Create a flow to chain triggers and actions.
                </Text>
              </View>
            ) : (
              flows.map((flow) => (
                <Pressable
                  key={flow.id}
                  style={[
                    styles.card,
                    {
                      padding: cardPad,
                      borderRadius: cardRadius,
                      width: isWide ? (contentWidth - cardGap) / 2 : "100%",
                    },
                  ]}
                  onPress={() =>
                    navigation.navigate("AutomationBuilder", {
                      flowId: flow.id,
                    })
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { fontSize: cardTitleSize }]}>
                      {flow.name}
                    </Text>
                    <Text style={[styles.sub, { fontSize: cardSubSize }]}>
                      {flowSummary(flow.triggers.length, "trigger")} •{" "}
                      {flowSummary(flow.conditions.length, "condition")} •{" "}
                      {flowSummary(flow.actions.length, "action")}
                    </Text>
                  </View>
                  <Switch
                    value={flow.enabled}
                    onValueChange={() => toggleFlow(flow.id)}
                    style={{ transform: [{ scale: isTablet ? 1.05 : 1 }] }}
                  />
                </Pressable>
              ))
            )}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text
                style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}
              >
                Schedules
              </Text>
              <Text style={[styles.sectionSub, { fontSize: sectionSubSize }]}>
                Time-based device rules
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.grid,
              isWide && {
                flexDirection: "row",
                flexWrap: "wrap",
                gap: cardGap,
              },
            ]}
          >
            {rules.map((r) => (
              <Pressable
                key={r.id}
                style={[
                  styles.card,
                  {
                    padding: cardPad,
                    borderRadius: cardRadius,
                    width: isWide ? (contentWidth - cardGap) / 2 : "100%",
                  },
                ]}
                onPress={() => openEdit(r.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { fontSize: cardTitleSize }]}>
                    {r.name}
                  </Text>
                  <Text style={[styles.sub, { fontSize: cardSubSize }]}>
                    Trigger: {String(r.trigger.hour).padStart(2, "0")}:
                    {String(r.trigger.minute).padStart(2, "0")} • Action:{" "}
                    {r.action.type === "set-ac"
                      ? `AC → ${r.action.tempC}°C`
                      : `Toggle → ${r.action.on ? "ON" : "OFF"}`}
                  </Text>
                </View>
                <Switch
                  value={r.enabled}
                  onValueChange={() => toggleRule(r.id)}
                  style={{ transform: [{ scale: isTablet ? 1.05 : 1 }] }}
                />
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[
              styles.cta,
              {
                height: ctaHeight,
                borderRadius: ctaRadius,
                marginTop: cardGap,
              },
            ]}
            onPress={openAdd}
          >
            <Text style={[styles.ctaText, { fontSize: cardTitleSize }]}>
              + Add Schedule
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={modalMode !== null}
        animationType="fade"
        onRequestClose={() => setModalMode(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setModalMode(null)}
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
                {
                  padding: modalPad,
                  borderRadius: modalRadius,
                  maxWidth: isTablet ? 560 : undefined,
                  width: isTablet
                    ? Math.min(contentWidth - gutter * 2, 560)
                    : undefined,
                  alignSelf: isTablet ? "center" : "stretch",
                },
              ]}
            >
              <Text style={[styles.modalTitle, { fontSize: modalTitleSize }]}>
                {isEditing ? "Edit schedule" : "New schedule"}
              </Text>
              <Text style={[styles.modalSub, { fontSize: modalSubSize }]}>
                {isEditing
                  ? "Update your schedule or device action."
                  : "Pick a device and schedule a time."}
              </Text>

              <Text style={[styles.modalLabel, { fontSize: modalLabelSize }]}>
                Name
              </Text>
              <TextInput
                value={ruleName}
                onChangeText={setRuleName}
                placeholder="Morning routine"
                placeholderTextColor="rgba(12,12,18,0.45)"
                style={[
                  styles.modalInput,
                  {
                    height: modalInputHeight,
                    borderRadius: Math.round(modalInputHeight * 0.28),
                  },
                ]}
              />

              <Text style={[styles.modalLabel, { fontSize: modalLabelSize }]}>
                Device
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.deviceRow}
              >
                {devices.map((d) => {
                  const active = d.id === selectedDevice?.id;
                  return (
                    <Pressable
                      key={d.id}
                      style={[
                        styles.devicePill,
                        {
                          height: modalInputHeight,
                          borderRadius: Math.round(modalInputHeight / 2),
                        },
                        active && styles.devicePillActive,
                      ]}
                      onPress={() => {
                        setSelectedDeviceId(d.id);
                        if (d.kind === "ac") setTemp(d.tempC ?? 22);
                      }}
                    >
                      <Text
                        style={[
                          styles.devicePillText,
                          { fontSize: modalLabelSize },
                          active && styles.devicePillTextActive,
                        ]}
                      >
                        {d.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={[styles.modalLabel, { fontSize: modalLabelSize }]}>
                Time
              </Text>
              <View style={styles.timeRow}>
                <TextInput
                  value={hour}
                  onChangeText={setHour}
                  placeholder="21"
                  keyboardType="number-pad"
                  style={[
                    styles.timeInput,
                    {
                      height: modalInputHeight,
                      borderRadius: Math.round(modalInputHeight * 0.28),
                    },
                  ]}
                  maxLength={2}
                />
                <Text style={styles.timeColon}>:</Text>
                <TextInput
                  value={minute}
                  onChangeText={setMinute}
                  placeholder="00"
                  keyboardType="number-pad"
                  style={[
                    styles.timeInput,
                    {
                      height: modalInputHeight,
                      borderRadius: Math.round(modalInputHeight * 0.28),
                    },
                  ]}
                  maxLength={2}
                />
              </View>

              {isAC ? (
                <>
                  <Text
                    style={[styles.modalLabel, { fontSize: modalLabelSize }]}
                  >
                    Temperature
                  </Text>
                  <View style={styles.sliderRow}>
                    <Text
                      style={[styles.sliderValue, { fontSize: modalLabelSize }]}
                    >
                      {temp}°C
                    </Text>
                    <Slider
                      style={{ flex: 1 }}
                      minimumValue={AC_TEMP_MIN_C}
                      maximumValue={AC_TEMP_MAX_C}
                      value={temp}
                      minimumTrackTintColor="rgba(180,107,255,0.8)"
                      maximumTrackTintColor="rgba(12,12,18,0.1)"
                      thumbTintColor="#fff"
                      onValueChange={(v) => setTemp(Math.round(v))}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text
                    style={[styles.modalLabel, { fontSize: modalLabelSize }]}
                  >
                    Action
                  </Text>
                  <View style={styles.toggleRow}>
                    <Pressable
                      style={[
                        styles.toggleBtn,
                        {
                          height: modalInputHeight,
                          borderRadius: Math.round(modalInputHeight * 0.28),
                        },
                        toggleOn && styles.toggleBtnActive,
                      ]}
                      onPress={() => setToggleOn(true)}
                    >
                      <Ionicons
                        name="power"
                        size={Math.round(16 * scale)}
                        color={toggleOn ? "#fff" : "rgba(12,12,18,0.7)"}
                      />
                      <Text
                        style={[
                          styles.toggleText,
                          { fontSize: modalLabelSize },
                          toggleOn && styles.toggleTextActive,
                        ]}
                      >
                        On
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.toggleBtn,
                        {
                          height: modalInputHeight,
                          borderRadius: Math.round(modalInputHeight * 0.28),
                        },
                        !toggleOn && styles.toggleBtnActive,
                      ]}
                      onPress={() => setToggleOn(false)}
                    >
                      <Ionicons
                        name="power"
                        size={Math.round(16 * scale)}
                        color={!toggleOn ? "#fff" : "rgba(12,12,18,0.7)"}
                      />
                      <Text
                        style={[
                          styles.toggleText,
                          { fontSize: modalLabelSize },
                          !toggleOn && styles.toggleTextActive,
                        ]}
                      >
                        Off
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}

              <View style={styles.modalRow}>
                <Pressable
                  style={[
                    styles.modalGhost,
                    {
                      height: modalBtnHeight,
                      borderRadius: Math.round(modalBtnHeight * 0.28),
                    },
                  ]}
                  onPress={() => setModalMode(null)}
                >
                  <Text
                    style={[
                      styles.modalGhostText,
                      { fontSize: modalLabelSize },
                    ]}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalPrimary,
                    {
                      height: modalBtnHeight,
                      borderRadius: Math.round(modalBtnHeight * 0.28),
                    },
                    !canCreate && styles.modalPrimaryDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!canCreate}
                >
                  <Text
                    style={[
                      styles.modalPrimaryText,
                      { fontSize: modalLabelSize },
                    ]}
                  >
                    {isEditing ? "Save" : "Create"}
                  </Text>
                </Pressable>
              </View>
              {isEditing ? (
                <Pressable
                  style={[
                    styles.modalDelete,
                    {
                      height: modalBtnHeight,
                      borderRadius: Math.round(modalBtnHeight * 0.28),
                    },
                  ]}
                  onPress={() => {
                    if (!editingId) return;
                    removeRule(editingId);
                    setModalMode(null);
                  }}
                >
                  <Text
                    style={[
                      styles.modalDeleteText,
                      { fontSize: modalLabelSize },
                    ]}
                  >
                    Delete schedule
                  </Text>
                </Pressable>
              ) : null}
            </LinearGradient>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  h1: { color: theme.colors.text, fontSize: 28, fontWeight: "900" },
  p: { color: theme.colors.subtext, marginTop: 4, fontWeight: "700" },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  countText: { color: theme.colors.text, fontWeight: "800" },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(180,107,255,0.3)",
    borderWidth: 1,
    borderColor: "rgba(180,107,255,0.45)",
  },
  addText: { color: theme.colors.text, fontWeight: "800" },
  sectionHeader: { marginTop: 8, marginBottom: 10 },
  sectionTitle: { color: theme.colors.text, fontWeight: "900" },
  sectionSub: { color: theme.colors.subtext, marginTop: 4, fontWeight: "700" },
  grid: { gap: 12 },
  card: {
    marginTop: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  name: { color: theme.colors.text, fontWeight: "900" },
  sub: { color: theme.colors.subtext, marginTop: 6, fontWeight: "700" },
  emptyCard: {
    marginTop: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  emptyTitle: { color: theme.colors.text, fontWeight: "900" },
  emptySub: { color: theme.colors.subtext, marginTop: 6, fontWeight: "700" },
  cta: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    alignItems: "center",
    backgroundColor: "rgba(180,107,255,0.22)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  ctaText: { color: theme.colors.text, fontWeight: "900" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.40)",
  },
  modalTitle: { color: "rgba(12,12,18,0.9)", fontWeight: "900", fontSize: 18 },
  modalSub: { color: "rgba(12,12,18,0.55)", fontWeight: "700", marginTop: 6 },
  modalLabel: {
    color: "rgba(12,12,18,0.75)",
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    paddingHorizontal: 12,
    color: "rgba(12,12,18,0.9)",
    fontWeight: "700",
  },
  deviceRow: { gap: 8, paddingVertical: 6 },
  devicePill: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(12,12,18,0.06)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  devicePillActive: {
    backgroundColor: "rgba(107,60,255,0.2)",
    borderColor: "rgba(107,60,255,0.3)",
  },
  devicePillText: {
    color: "rgba(12,12,18,0.7)",
    fontWeight: "800",
    fontSize: 12,
  },
  devicePillTextActive: { color: "rgba(12,12,18,0.9)" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  timeInput: {
    width: 60,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    textAlign: "center",
    color: "rgba(12,12,18,0.9)",
    fontWeight: "800",
  },
  timeColon: { fontSize: 18, fontWeight: "900", color: "rgba(12,12,18,0.65)" },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sliderValue: { width: 64, color: "rgba(12,12,18,0.9)", fontWeight: "900" },
  toggleRow: { flexDirection: "row", gap: 10 },
  toggleBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  toggleBtnActive: { backgroundColor: "#6B3CFF", borderColor: "#6B3CFF" },
  toggleText: { color: "rgba(12,12,18,0.7)", fontWeight: "800" },
  toggleTextActive: { color: "#fff" },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalGhostText: { color: "rgba(12,12,18,0.75)", fontWeight: "800" },
  modalPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#6B3CFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryDisabled: { opacity: 0.6 },
  modalPrimaryText: { color: "#FFFFFF", fontWeight: "900" },
  modalDelete: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 99, 132, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalDeleteText: { color: "#8b1e3a", fontWeight: "900" },
});
