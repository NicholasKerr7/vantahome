import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";
import type { RootStackParamList } from "../app/AppNavigator";
import { openHomeFeature } from "../app/homeNavigation";
import { useHomeStore } from "../store/useHomeStore";
import { canManageRoutines, selectVisibleRoutines } from "../store/routines";
import { theme } from "../theme/theme";
import { EmbeddedAutomations } from "./components/EmbeddedCollections";
import { useCollectionDirectory } from "./components/useCollectionDirectory";

export type AutomationsScreenProps = {
  /** The home workspace supplies safe areas, the title and primary navigation. */
  embedded?: boolean;
  /** Device controls can open this same collection filtered to their relevant routines. */
  deviceId?: string;
};

/** Present schedules and advanced sequences as one bounded Routines collection and one creation path. */
export default function AutomationsScreen({
  embedded = false,
  deviceId,
}: AutomationsScreenProps = {}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const routines = useHomeStore(useShallow(selectVisibleRoutines));
  const canManage = useHomeStore(canManageRoutines);
  const [error, setError] = useState<string | null>(null);
  const toggleRoutine = useHomeStore((state) => state.toggleRoutine);
  const directory = useCollectionDirectory();
  const device = directory.devices.find((entry) => entry.id === deviceId);
  const filtered = deviceId
    ? routines.filter((routine) =>
        [...routine.triggers, ...routine.conditions, ...routine.actions].some(
          (step) => {
            if ("deviceId" in step) return step.deviceId === deviceId;
            return (
              "sceneId" in step &&
              directory.scenes.some(
                (scene) =>
                  scene.id === step.sceneId &&
                  scene.actions.some((action) => action.deviceId === deviceId),
              )
            );
          },
        ),
      )
    : routines;
  /** A role may change between render and activation; store authorization errors remain visible. */
  function handleToggle(routineId: string) {
    try {
      toggleRoutine(routineId);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The routine could not be updated.",
      );
    }
  }

  const content = (
    <View style={styles.content} testID="automations-screen-content">
      <EmbeddedAutomations
        routines={filtered}
        canManage={canManage}
        error={error}
        deviceName={deviceId ? (device?.name ?? "This device") : undefined}
        onClearFilter={
          deviceId
            ? () => openHomeFeature(navigation.dispatch, "Automations", {})
            : undefined
        }
        onCreate={() =>
          navigation.navigate(
            "AutomationBuilder",
            deviceId ? { deviceId, preset: "time" } : {},
          )
        }
        onOpen={(routineId) =>
          navigation.navigate("AutomationBuilder", { routineId })
        }
        onToggle={handleToggle}
      />
    </View>
  );
  if (embedded) return content;
  return (
    <SafeAreaView style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>
        Routines
      </Text>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: theme.colors.bg0 },
  title: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: "500",
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  content: {
    flex: 1,
    minHeight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 16,
  },
});
