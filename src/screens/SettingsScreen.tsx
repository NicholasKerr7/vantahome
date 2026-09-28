import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SettingsWorkspace from "../features/settings/SettingsWorkspace";
import { settingsStyles as styles } from "../features/settings/settingsWorkspaceStyles";

/** Use the same settings workspace within the 3D shell or as a standalone screen. */
export default function SettingsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  if (embedded) return <SettingsWorkspace />;
  return <SafeAreaView style={styles.root}>
    <View style={styles.standaloneHeader}><Text accessibilityRole="header" style={styles.standaloneTitle}>Settings</Text></View>
    <SettingsWorkspace />
  </SafeAreaView>;
}
