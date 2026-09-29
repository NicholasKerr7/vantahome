import React, { useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import Pressable from "../../components/Pressable";
import { theme } from "../../theme/theme";
import type { CollectionDirectory } from "../components/collectionDescriptions";
import {
  buildRoutineStep,
  createStepDraft,
  STEP_CHOICES,
  supportsRoutinePower,
  WEEK_DAYS,
  type RoutineSection,
  type RoutineStep,
  type StepDraft,
} from "./routineEditorModel";

type Props = {
  section: RoutineSection;
  item?: RoutineStep;
  deviceId?: string;
  directory: CollectionDirectory;
  onSave: (step: RoutineStep) => void;
  onClose: () => void;
};
type Choice = { id: string; label: string };
const TITLES = { trigger: "When", condition: "Only if", action: "Do" };

/** Reusable wrapping choices stay readable with large text and inside the bounded editor. */
function Choices({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly Choice[];
  selected: string | readonly string[];
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {options.map((choice) => {
          const active =
            typeof selected === "string"
              ? selected === choice.id
              : selected.includes(choice.id);
          return (
            <Pressable
              key={choice.id}
              accessibilityLabel={`${label}: ${choice.label}`}
              accessibilityState={{ selected: active }}
              style={[styles.choice, active && styles.choiceSelected]}
              onPress={() => onSelect(choice.id)}
            >
              <Text
                style={[styles.choiceText, active && styles.choiceTextSelected]}
              >
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {!options.length && (
        <Text style={styles.helper}>No available choices.</Text>
      )}
    </View>
  );
}

/** Pair labeled 24-hour fields without accepting a partially parsed or out-of-range time. */
function TimeFields({
  label,
  hour,
  minute,
  onHour,
  onMinute,
}: {
  label: string;
  hour: string;
  minute: string;
  onHour: (value: string) => void;
  onMinute: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label} · 24-hour time</Text>
      <View style={styles.timeRow}>
        <TextInput
          accessibilityLabel={`${label} hour`}
          value={hour}
          onChangeText={onHour}
          maxLength={2}
          keyboardType="number-pad"
          style={[styles.input, styles.timeInput]}
        />
        <Text style={styles.timeColon}>:</Text>
        <TextInput
          accessibilityLabel={`${label} minute`}
          value={minute}
          onChangeText={onMinute}
          maxLength={2}
          keyboardType="number-pad"
          style={[styles.input, styles.timeInput]}
        />
      </View>
    </View>
  );
}

/** Edit one routine step in isolation; advanced step kinds remain available without crowding the first choice. */
export function RoutineStepEditor({
  section,
  item,
  deviceId,
  directory,
  onSave,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(() =>
    createStepDraft(section, item, deviceId),
  );
  const [advanced, setAdvanced] = useState(
    Boolean(
      item &&
        STEP_CHOICES[section].findIndex((choice) => choice.id === item.type) >
          1,
    ),
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const options = STEP_CHOICES[section];
  const deviceOptions = useMemo(
    () =>
      directory.devices.filter((device) => {
        if (draft.type === "set-ac") return device.kind === "ac";
        if (draft.type === "set-brightness") return device.kind === "light";
        return (
          draft.type !== "toggle" ||
          supportsRoutinePower(device) ||
          device.id === (item && "deviceId" in item ? item.deviceId : "")
        );
      }),
    [directory.devices, draft.type, item],
  );
  const usesDevice = ["device", "toggle", "set-ac", "set-brightness"].includes(
    draft.type,
  );
  const usesScene = draft.type === "scene" || draft.type === "run-scene";
  const shownDevices = deviceOptions.filter((device) =>
    device.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  /** Keep individual field changes local and clear obsolete validation feedback. */
  function change<K extends keyof StepDraft>(key: K, value: StepDraft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setError(null);
  }

  /** Reinitialize type-specific values while preserving a still-relevant selected device. */
  function selectType(type: string) {
    setDraft((previous) => ({
      ...previous,
      type,
      value: type === "set-ac" ? "22" : type === "delay" ? "30" : "60",
    }));
    setError(null);
  }

  /** Validate reference availability as well as field ranges before returning an edited step. */
  function save() {
    if (
      usesDevice &&
      !deviceOptions.some((device) => device.id === draft.deviceId)
    ) {
      setError("Choose an available device for this action.");
      return;
    }
    if (
      usesScene &&
      !directory.scenes.some((scene) => scene.id === draft.sceneId)
    ) {
      setError("Choose an available scene.");
      return;
    }
    if (
      draft.type === "presence" &&
      !directory.household.some((member) => member.id === draft.memberId)
    ) {
      setError("Choose an available household member.");
      return;
    }
    const result = buildRoutineStep(section, draft);
    if (!result.step) {
      setError(result.error ?? "Check this step.");
      return;
    }
    onSave(result.step);
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>
                {item ? "EDIT STEP" : "ADD STEP"}
              </Text>
              <Text accessibilityRole="header" style={styles.title}>
                {TITLES[section]}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close routine step"
              onPress={onClose}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={23} color={theme.colors.text} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            overScrollMode="never"
          >
            <Choices
              label="Step type"
              options={advanced ? options : options.slice(0, 2)}
              selected={draft.type}
              onSelect={selectType}
            />
            {options.length > 2 && (
              <Pressable
                accessibilityLabel={
                  advanced ? "Fewer step options" : "More step options"
                }
                accessibilityState={{ expanded: advanced }}
                style={styles.advancedButton}
                onPress={() => setAdvanced(!advanced)}
              >
                <Text style={styles.accentText}>
                  {advanced ? "Fewer options" : "More options"}
                </Text>
                <Ionicons
                  name={advanced ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={theme.colors.accent}
                />
              </Pressable>
            )}
            {draft.type === "time" && (
              <>
                <TimeFields
                  label="Time"
                  hour={draft.hour}
                  minute={draft.minute}
                  onHour={(value) => change("hour", value)}
                  onMinute={(value) => change("minute", value)}
                />
                <Text style={styles.helper}>
                  Repeats daily in the device’s local time. Add an Only if
                  condition to choose days.
                </Text>
              </>
            )}
            {draft.type === "time-range" && (
              <>
                <TimeFields
                  label="Start"
                  hour={draft.hour}
                  minute={draft.minute}
                  onHour={(value) => change("hour", value)}
                  onMinute={(value) => change("minute", value)}
                />
                <TimeFields
                  label="End"
                  hour={draft.endHour}
                  minute={draft.endMinute}
                  onHour={(value) => change("endHour", value)}
                  onMinute={(value) => change("endMinute", value)}
                />
                <Text style={styles.helper}>
                  A window can continue past midnight.
                </Text>
              </>
            )}
            {usesDevice && (
              <>
                <TextInput
                  accessibilityLabel="Find device"
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Find a device"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                />
                <Choices
                  label="Device"
                  options={shownDevices.map((device) => ({
                    id: device.id,
                    label: device.name,
                  }))}
                  selected={draft.deviceId}
                  onSelect={(value) => change("deviceId", value)}
                />
              </>
            )}
            {(draft.type === "device" || draft.type === "toggle") && (
              <Choices
                label="State"
                options={[
                  { id: "on", label: "On" },
                  { id: "off", label: "Off" },
                ]}
                selected={draft.on ? "on" : "off"}
                onSelect={(value) => change("on", value === "on")}
              />
            )}
            {usesScene && (
              <Choices
                label="Scene"
                options={directory.scenes.map((scene) => ({
                  id: scene.id,
                  label: scene.name,
                }))}
                selected={draft.sceneId}
                onSelect={(value) => change("sceneId", value)}
              />
            )}
            {draft.type === "presence" && (
              <>
                <Choices
                  label="Household member"
                  options={directory.household.map((member) => ({
                    id: member.id,
                    label: member.name,
                  }))}
                  selected={draft.memberId}
                  onSelect={(value) => change("memberId", value)}
                />
                <Choices
                  label="Presence"
                  options={[
                    { id: "home", label: "Arrives home" },
                    { id: "away", label: "Leaves home" },
                  ]}
                  selected={draft.on ? "home" : "away"}
                  onSelect={(value) => change("on", value === "home")}
                />
              </>
            )}
            {draft.type === "day" && (
              <Choices
                label="Days"
                options={WEEK_DAYS.map((day) => ({ id: day, label: day }))}
                selected={draft.days}
                onSelect={(value) => {
                  const day = WEEK_DAYS.find((entry) => entry === value)!;
                  change(
                    "days",
                    draft.days.includes(day)
                      ? draft.days.filter((entry) => entry !== day)
                      : [...draft.days, day],
                  );
                }}
              />
            )}
            {["set-ac", "set-brightness", "delay"].includes(draft.type) && (
              <View style={styles.field}>
                <Text style={styles.label}>
                  {draft.type === "set-ac"
                    ? "Temperature (°C)"
                    : draft.type === "delay"
                      ? "Wait (seconds)"
                      : "Brightness (%)"}
                </Text>
                <TextInput
                  accessibilityLabel="Step value"
                  keyboardType="number-pad"
                  value={draft.value}
                  onChangeText={(value) => change("value", value)}
                  style={styles.input}
                />
              </View>
            )}
            {draft.type === "set-ac" && (
              <Choices
                label="AC mode"
                options={[
                  { id: "cold", label: "Cool" },
                  { id: "fan", label: "Fan" },
                  { id: "dry", label: "Dry" },
                ]}
                selected={draft.mode}
                onSelect={(value) =>
                  change(
                    "mode",
                    value === "fan" || value === "dry" ? value : "cold",
                  )
                }
              />
            )}
            {draft.type === "notify" && (
              <View style={styles.field}>
                <Text style={styles.label}>Notification</Text>
                <TextInput
                  accessibilityLabel="Notification message"
                  value={draft.message}
                  onChangeText={(value) => change("message", value)}
                  maxLength={500}
                  style={styles.input}
                />
              </View>
            )}
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
          </ScrollView>
          <Pressable
            accessibilityLabel="Save routine step"
            style={styles.saveButton}
            onPress={save}
          >
            <Text style={styles.saveText}>Use this step</Text>
            <Ionicons name="checkmark" size={20} color={theme.colors.bg0} />
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.72)",
    padding: 12,
  },
  sheet: {
    width: "100%",
    maxWidth: 600,
    maxHeight: "94%",
    backgroundColor: theme.colors.bg1,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    borderRadius: 24,
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, padding: 16 },
  headerCopy: { flex: 1 },
  eyebrow: { color: theme.colors.muted, fontSize: 9, letterSpacing: 1.3 },
  title: { color: theme.colors.text, fontSize: 25, marginTop: 4 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 20, gap: 14 },
  field: { gap: 8 },
  label: { color: theme.colors.subtext, fontSize: 12, fontWeight: "600" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    maxWidth: "100%",
  },
  choiceSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent2,
  },
  choiceText: { color: theme.colors.subtext, fontSize: 13 },
  choiceTextSelected: { color: theme.colors.text },
  advancedButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accentText: { color: theme.colors.accent, fontSize: 12 },
  helper: { color: theme.colors.muted, fontSize: 12, lineHeight: 18 },
  input: {
    color: theme.colors.text,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  timeInput: {
    flex: 1,
    textAlign: "center",
    fontSize: 22,
    fontVariant: ["tabular-nums"],
  },
  timeColon: { color: theme.colors.text, fontSize: 22 },
  error: { color: "#FFC8BB", fontSize: 12, lineHeight: 18 },
  saveButton: {
    minHeight: 48,
    margin: 16,
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  saveText: { color: theme.colors.bg0, fontWeight: "700", fontSize: 14 },
});
