import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";

/** Explain unavailable authentication in the same calm surface used by account entry. */
export default function AuthRequiredScreen() {
  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <View style={styles.card}>
        <Ionicons
          name="lock-closed-outline"
          size={28}
          color={theme.colors.accentText}
        />
        <Text style={styles.title}>Auth required</Text>
        <Text style={styles.subtitle}>
          Supabase credentials are missing. Add EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY to your environment before running an
          authenticated development, alpha, or production build. Set
          EXPO_PUBLIC_VANTA_MODE=demo only for the clearly labeled local demo.
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    width: "88%",
    padding: 28,
    maxWidth: 480,
    borderRadius: 28,
    alignItems: "center",
    gap: 16,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  title: { color: theme.colors.text, fontWeight: "500", fontSize: 20 },
  subtitle: {
    color: theme.colors.subtext,
    textAlign: "center",
    fontWeight: "400",
    lineHeight: 21,
  },
});
