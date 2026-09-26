import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../app/AppNavigator";
import { isThreeDHomeEnabled } from "../config/threeDHome";
import { theme } from "../theme/theme";
import Pressable from "./Pressable";

/** Opens the isolated simulation without reading household or device state. */
export default function ThreeDHomeEntry() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  if (!isThreeDHomeEnabled()) return null;

  return (
    <Pressable
      accessibilityLabel="Open 3D Home simulation"
      accessibilityHint="Explore the house model with simulated device controls."
      onPress={() => navigation.navigate("ThreeDHome")}
      style={styles.entry}
      testID="home-three-d-button"
    >
      <Ionicons name="cube-outline" size={18} color={theme.colors.text} />
      <View style={styles.labels}>
        <Text style={styles.title} numberOfLines={1}>
          3D Home
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Simulation
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: {
    minHeight: 44,
    maxWidth: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing(1),
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card,
  },
  labels: { flexShrink: 1 },
  title: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  subtitle: {
    color: theme.colors.subtext,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
  },
});
