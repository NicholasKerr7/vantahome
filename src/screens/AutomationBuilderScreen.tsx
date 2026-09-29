import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import Pressable from "../components/Pressable";
import { theme } from "../theme/theme";
import { ROUTINE_EXECUTION } from "../features/routines/executionAvailability";
import {
  useHomeStore,
  type FlowAction,
  type FlowCondition,
  type FlowTrigger,
} from "../store/useHomeStore";
import { selectVisibleRoutines, type RoutineDraft } from "../store/routines";
import { useCollectionDirectory } from "./components/useCollectionDirectory";
import {
  describeAction,
  describeCondition,
  describeTrigger,
} from "./components/collectionDescriptions";
import { RoutineSectionCard } from "./routines/RoutineSectionCard";
import { RoutineStepEditor } from "./routines/RoutineStepEditor";
import { useRoutineEditorGuard } from "./routines/useRoutineEditorGuard";
import {
  supportsRoutinePower,
  type RoutineSection,
  type RoutineStep,
} from "./routines/routineEditorModel";

type Props = NativeStackScreenProps<RootStackParamList, "AutomationBuilder">;
type Editor = { section: RoutineSection; index?: number };
const SWITCH_COLORS = {
  false: theme.colors.stroke,
  true: theme.colors.accent2,
};

/** One editor serves existing flows, legacy time rules and device schedule shortcuts. */
export default function AutomationBuilderScreen({ navigation, route }: Props) {
  const guard = useRoutineEditorGuard();
  const routines = useHomeStore(useShallow(selectVisibleRoutines));
  const addRoutine = useHomeStore((state) => state.addRoutine);
  const updateRoutine = useHomeStore((state) => state.updateRoutine);
  const removeRoutine = useHomeStore((state) => state.removeRoutine);
  const directory = useCollectionDirectory();
  const { routineId, flowId, deviceId, preset } = route.params ?? {};
  const existing = routines.find((routine) =>
    routineId
      ? routine.id === routineId
      : flowId
        ? routine.source.kind === "flow" && routine.source.id === flowId
        : false,
  );
  const device = directory.devices.find((entry) => entry.id === deviceId);
  const missing = Boolean((routineId || flowId) && !existing);
  const [name, setName] = useState(
    existing?.name ?? (device ? `${device.name} schedule` : ""),
  );
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [triggers, setTriggers] = useState<FlowTrigger[]>(
    existing?.triggers ??
      (preset === "time" ? [{ type: "time", hour: 7, minute: 0 }] : []),
  );
  const [conditions, setConditions] = useState<FlowCondition[]>(
    existing?.conditions ?? [],
  );
  const [actions, setActions] = useState<FlowAction[]>(
    existing?.actions ??
      (device && supportsRoutinePower(device)
        ? [{ type: "toggle", deviceId: device.id, on: true }]
        : []),
  );
  const [showConditions, setShowConditions] = useState(
    Boolean(existing?.conditions.length),
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave = Boolean(
    name.trim() &&
      triggers.length &&
      actions.length &&
      !missing &&
      !guard.unavailable,
  );

  /** Commit only the edited section; all other steps retain their exact saved values and order. */
  function saveStep(step: RoutineStep) {
    if (!editor) return;
    const { index, section } = editor;
    if (section === "trigger")
      setTriggers((items) =>
        index === undefined
          ? [...items, step as FlowTrigger]
          : items.map((item, position) =>
              position === index ? (step as FlowTrigger) : item,
            ),
      );
    if (section === "condition")
      setConditions((items) =>
        index === undefined
          ? [...items, step as FlowCondition]
          : items.map((item, position) =>
              position === index ? (step as FlowCondition) : item,
            ),
      );
    if (section === "action")
      setActions((items) =>
        index === undefined
          ? [...items, step as FlowAction]
          : items.map((item, position) =>
              position === index ? (step as FlowAction) : item,
            ),
      );
    setEditor(null);
    setError(null);
  }

  /** Preserve the canonical identity of a legacy schedule when editing it into a richer routine. */
  function saveRoutine() {
    if (!canSave) {
      setError("Add a name, at least one When step and one Do step.");
      return;
    }
    const draft: RoutineDraft = {
      name: name.trim(),
      enabled,
      triggers,
      conditions,
      actions,
    };
    const validationError = guard.validate(existing?.id, draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      if (existing) updateRoutine(existing.id, draft);
      else addRoutine(draft);
      navigation.goBack();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The routine could not be saved.",
      );
    }
  }

  /** Require an explicit second action before deleting the complete saved routine. */
  function deleteRoutine() {
    if (!existing) return;
    const validationError = guard.validate(existing.id);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      removeRoutine(existing.id);
      navigation.goBack();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The routine could not be removed.",
      );
    }
  }

  /** Move an action earlier without changing the order of any other execution steps. */
  function moveActionUp(index: number) {
    setActions((previous) => {
      const next = [...previous];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  const editedItem =
    editor?.index === undefined
      ? undefined
      : (editor.section === "trigger"
          ? triggers
          : editor.section === "condition"
            ? conditions
            : actions)[editor.index];
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          {existing ? "Edit routine" : "New routine"}
        </Text>
        <Pressable
          accessibilityLabel="Save routine"
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={saveRoutine}
          style={[styles.saveButton, !canSave && styles.disabled]}
        >
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        overScrollMode="never"
      >
        {missing || guard.unavailable ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Routine unavailable</Text>
            <Text style={styles.helper}>
              {guard.unavailable ??
                "It may have been removed, or your household access has changed. Return to Routines to choose another."}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.eyebrow}>BUILT AROUND YOUR DAY</Text>
              <Text style={styles.label}>Routine name</Text>
              <TextInput
                accessibilityLabel="Routine name"
                value={name}
                onChangeText={setName}
                placeholder="Evening, effortlessly"
                placeholderTextColor={theme.colors.muted}
                maxLength={100}
                style={styles.input}
              />
              <View style={styles.enabledRow}>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>
                    {enabled ? "Enabled" : "Paused"}
                  </Text>
                  <Text style={styles.helper}>{ROUTINE_EXECUTION.summary}</Text>
                </View>
                <Switch
                  accessibilityLabel="Routine enabled"
                  value={enabled}
                  onValueChange={setEnabled}
                  trackColor={SWITCH_COLORS}
                  thumbColor={theme.colors.accent}
                />
              </View>
            </View>
            <RoutineSectionCard
              section="trigger"
              title="When"
              hint="Any of these events can start the routine."
              descriptions={triggers.map((item) =>
                describeTrigger(item, directory),
              )}
              onAdd={() => setEditor({ section: "trigger" })}
              onEdit={(index) => setEditor({ section: "trigger", index })}
              onRemove={(index) =>
                setTriggers((items) =>
                  items.filter((_, position) => position !== index),
                )
              }
            />
            {showConditions ? (
              <RoutineSectionCard
                section="condition"
                title="Only if"
                hint="Every condition must be true. This is optional."
                descriptions={conditions.map((item) =>
                  describeCondition(item, directory),
                )}
                onAdd={() => setEditor({ section: "condition" })}
                onEdit={(index) => setEditor({ section: "condition", index })}
                onRemove={(index) =>
                  setConditions((items) =>
                    items.filter((_, position) => position !== index),
                  )
                }
              />
            ) : (
              <Pressable
                accessibilityLabel="Add conditions"
                accessibilityState={{ expanded: false }}
                onPress={() => setShowConditions(true)}
                style={styles.optionalButton}
              >
                <Ionicons
                  name="options-outline"
                  size={18}
                  color={theme.colors.accent}
                />
                <Text style={styles.optionalText}>
                  Only if · Add optional conditions
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={theme.colors.muted}
                />
              </Pressable>
            )}
            <RoutineSectionCard
              section="action"
              title="Do"
              hint="Actions run in this order. Add a wait from More options."
              descriptions={actions.map((item) =>
                describeAction(item, directory),
              )}
              onAdd={() => setEditor({ section: "action" })}
              onEdit={(index) => setEditor({ section: "action", index })}
              onRemove={(index) =>
                setActions((items) =>
                  items.filter((_, position) => position !== index),
                )
              }
              onMoveUp={moveActionUp}
            />
            {!canSave && (
              <Text style={styles.helper}>
                A routine needs a name, a When step and a Do step.
              </Text>
            )}
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            {existing && (
              <View style={styles.deleteArea}>
                {confirmDelete && (
                  <Text style={styles.helper}>
                    This removes the routine and all its steps.
                  </Text>
                )}
                <Pressable
                  accessibilityLabel={
                    confirmDelete ? "Confirm delete routine" : "Delete routine"
                  }
                  onPress={deleteRoutine}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={18} color="#FFC8BB" />
                  <Text style={styles.deleteText}>
                    {confirmDelete ? "Confirm delete" : "Delete routine"}
                  </Text>
                </Pressable>
                {confirmDelete && (
                  <Pressable
                    accessibilityLabel="Keep routine"
                    onPress={() => setConfirmDelete(false)}
                    style={styles.optionalButton}
                  >
                    <Text style={styles.optionalText}>Keep routine</Text>
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
      {editor && !guard.unavailable && !missing && (
        <RoutineStepEditor
          key={`${editor.section}-${editor.index ?? "new"}`}
          section={editor.section}
          item={editedItem}
          deviceId={deviceId}
          directory={directory}
          onSave={saveStep}
          onClose={() => setEditor(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: theme.colors.bg0 },
  header: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: theme.colors.card,
  },
  title: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "500",
    letterSpacing: -0.5,
  },
  saveButton: {
    minHeight: 44,
    minWidth: 60,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
  },
  saveText: { color: theme.colors.bg0, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.35 },
  scroll: { flex: 1, minHeight: 0 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 14,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  eyebrow: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.5,
  },
  label: { color: theme.colors.subtext, fontSize: 12 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card2,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 17,
  },
  enabledRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  sectionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "500" },
  helper: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  optionalButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  optionalText: {
    flexShrink: 1,
    color: theme.colors.accent,
    fontSize: 12,
    lineHeight: 18,
  },
  error: { color: "#FFC8BB", fontSize: 12, lineHeight: 18 },
  deleteArea: { gap: 6 },
  deleteButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#663C3C",
  },
  deleteText: { color: "#FFC8BB", fontSize: 13, fontWeight: "600" },
});
