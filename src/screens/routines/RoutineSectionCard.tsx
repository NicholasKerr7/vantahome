import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Pressable from "../../components/Pressable";
import { theme } from "../../theme/theme";
import type { RoutineSection } from "./routineEditorModel";

type Props = {
  section: RoutineSection;
  title: string;
  hint: string;
  descriptions: readonly string[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onMoveUp?: (index: number) => void;
};

/** Show a readable ordered routine section with explicit edit, removal and action-order controls. */
export function RoutineSectionCard({
  section,
  title,
  hint,
  descriptions,
  onAdd,
  onEdit,
  onRemove,
  onMoveUp,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        <Pressable
          accessibilityLabel={`Add ${section}`}
          onPress={onAdd}
          style={styles.addButton}
        >
          <Ionicons name="add" size={19} color={theme.colors.accent} />
        </Pressable>
      </View>
      {!descriptions.length && (
        <Text style={styles.empty}>
          Choose{" "}
          {section === "trigger"
            ? "what starts this routine."
            : section === "condition"
              ? "an optional requirement."
              : "what your home should do."}
        </Text>
      )}
      {descriptions.map((description, index) => (
        <View key={`${section}-${index}`} style={styles.step}>
          <Pressable
            accessibilityLabel={`Edit ${section} ${index + 1}: ${description}`}
            onPress={() => onEdit(index)}
            style={styles.stepCopy}
          >
            <Text style={styles.stepIndex}>
              {String(index + 1).padStart(2, "0")}
            </Text>
            <Text style={styles.stepText}>{description}</Text>
            <Ionicons
              name="create-outline"
              size={16}
              color={theme.colors.muted}
            />
          </Pressable>
          <View style={styles.stepActions}>
            {onMoveUp && index > 0 && (
              <Pressable
                accessibilityLabel={`Move action ${index + 1} earlier`}
                style={styles.iconButton}
                onPress={() => onMoveUp(index)}
              >
                <Ionicons
                  name="arrow-up"
                  size={17}
                  color={theme.colors.subtext}
                />
              </Pressable>
            )}
            <Pressable
              accessibilityLabel={`Remove ${section} ${index + 1}`}
              onPress={() => onRemove(index)}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={19} color={theme.colors.subtext} />
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card2,
    gap: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1, minWidth: 0 },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "500",
    letterSpacing: -0.4,
  },
  hint: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  addButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.card,
    borderRadius: 15,
  },
  empty: { color: theme.colors.muted, fontSize: 12, lineHeight: 18 },
  step: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.stroke,
    paddingTop: 4,
  },
  stepCopy: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepIndex: { color: theme.colors.muted, fontSize: 10 },
  stepText: { flex: 1, color: theme.colors.text, fontSize: 13, lineHeight: 20 },
  stepActions: { flexDirection: "row", justifyContent: "flex-end" },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
