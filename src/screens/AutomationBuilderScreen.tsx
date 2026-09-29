import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useShallow } from "zustand/react/shallow";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import Pressable from "../components/Pressable";
import ThemedSwitch from '../components/ThemedSwitch';
import { DeepAction, DeepPager, DeepScreen, DeepTabs } from '../components/deep/DeepScreen';
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
const EDITOR_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'sparkles-outline' },
  { id: 'trigger', label: 'When', icon: 'time-outline' },
  { id: 'condition', label: 'Only if', icon: 'options-outline' },
  { id: 'action', label: 'Do', icon: 'flash-outline' },
] as const;
type EditorSection = typeof EDITOR_SECTIONS[number]['id'];

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
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<EditorSection>('overview');
  const canSave = Boolean(
    name.trim() &&
      triggers.length &&
      actions.length &&
      !missing &&
      !guard.unavailable,
  );

  /** Keep one complete routine chapter visible while preserving the unsaved draft across tabs. */
  function selectSection(section: EditorSection) {
    setSelectedSection(section);
  }

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
    <DeepScreen title={existing ? 'Edit routine' : 'New routine'} eyebrow="YOUR HOME / ROUTINES"
      onBack={() => navigation.goBack()} actions={<DeepAction label="Save" accessibilityLabel="Save routine" primary disabled={!canSave} onPress={saveRoutine} />}>
      <DeepTabs items={EDITOR_SECTIONS} selectedId={selectedSection} onSelect={selectSection} />
      <ScrollView
        key={selectedSection}
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
            {selectedSection === 'overview' && <View style={styles.card}>
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
                <ThemedSwitch
                  accessibilityLabel="Routine enabled"
                  value={enabled}
                  onValueChange={setEnabled}
                  trackColor={SWITCH_COLORS}
                  thumbColor={theme.colors.accent}
                />
              </View>
              <View style={styles.summary}>
                <DeepAction label={`When · ${triggers.length} ${triggers.length === 1 ? 'event' : 'events'}`} icon="time-outline" onPress={() => selectSection('trigger')} />
                <DeepAction label={`Do · ${actions.length} ${actions.length === 1 ? 'action' : 'actions'}`} icon="flash-outline" onPress={() => selectSection('action')} />
              </View>
              <DeepAction label={conditions.length ? `${conditions.length} ${conditions.length === 1 ? 'condition' : 'conditions'}` : 'Add conditions'} accessibilityLabel="Add conditions" icon="options-outline" onPress={() => selectSection('condition')} />
            </View>}
            {selectedSection === 'trigger' && <RoutineSectionCard
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
            />}
            {selectedSection === 'condition' && (
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
            )}
            {selectedSection === 'action' && <RoutineSectionCard
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
            />}
            {!canSave && selectedSection === 'overview' && (
              <Text style={styles.helper}>
                A routine needs a name, a When step and a Do step.
              </Text>
            )}
            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            {existing && selectedSection === 'overview' && (
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
      <DeepPager page={EDITOR_SECTIONS.findIndex((entry) => entry.id === selectedSection)} pageCount={EDITOR_SECTIONS.length}
        onChange={(page) => selectSection(EDITOR_SECTIONS[page].id)} label="routine sections" />
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
    </DeepScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingBottom: 12,
    gap: 14,
  },
  card: {
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
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
    color: theme.colors.accentText,
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
