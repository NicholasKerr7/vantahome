import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Pressable from "../components/Pressable";
import { supabase } from "../services/supabaseClient";
import { theme } from "../theme/theme";

export function isValidRecoveryPassword(password: string, confirm: string) {
  return password.length >= 8 && password === confirm;
}

export default function PasswordRecoveryScreen({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const canSave = isValidRecoveryPassword(password, confirm) && !saving;

  const savePassword = async () => {
    if (!supabase || !canSave) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        Alert.alert("Update failed", error.message);
        return;
      }
      Alert.alert("Password updated", "Your new password is ready to use.");
      onComplete();
    } catch (error: any) {
      Alert.alert(
        "Update failed",
        error?.message ?? "Unable to update your password.",
      );
    } finally {
      setSaving(false);
    }
  };

  const returnToSignIn = async () => {
    await supabase?.auth.signOut();
    onComplete();
  };

  return (
    <LinearGradient colors={[theme.colors.bg1, theme.colors.bg0]} style={styles.root}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="key-outline" size={28} color={theme.colors.text} />
        </View>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>
          Choose at least eight characters. This recovery session is used only
          to replace your password.
        </Text>
        <TextInput
          accessibilityLabel="New password"
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          placeholderTextColor="rgba(255,255,255,0.45)"
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm new password"
          placeholderTextColor="rgba(255,255,255,0.45)"
          secureTextEntry
          autoCapitalize="none"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          style={[styles.primary, !canSave && styles.disabled]}
          disabled={!canSave}
          onPress={savePassword}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>Update password</Text>
          )}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={returnToSignIn}>
          <Text style={styles.secondaryText}>Return to sign in</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    padding: 24,
    borderRadius: 28,
    gap: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(180,107,255,0.3)",
  },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900" },
  subtitle: { color: theme.colors.subtext, lineHeight: 20, fontWeight: "600" },
  input: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    color: theme.colors.text,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  primary: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent2,
  },
  disabled: { opacity: 0.45 },
  primaryText: { color: "#FFFFFF", fontWeight: "900" },
  secondaryText: {
    color: theme.colors.subtext,
    textAlign: "center",
    fontWeight: "800",
  },
});
