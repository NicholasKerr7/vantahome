import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";

export default function AuthRequiredScreen() {
  return (
    <LinearGradient colors={[theme.colors.bg1, theme.colors.bg0]} style={styles.root}>
      <View style={styles.card}>
        <Ionicons name="lock-closed-outline" size={28} color={theme.colors.text} />
        <Text style={styles.title}>Auth required</Text>
        <Text style={styles.subtitle}>
          Supabase credentials are missing. Add EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env to enable sign‑in.
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    width: "88%",
    padding: 24,
    borderRadius: 22,
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  title: { color: theme.colors.text, fontWeight: "900", fontSize: 20 },
  subtitle: { color: theme.colors.subtext, textAlign: "center", fontWeight: "700" },
});
