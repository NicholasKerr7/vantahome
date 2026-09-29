import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Pressable from "../components/Pressable";
import { supabase } from "../services/supabaseClient";
import { theme } from "../theme/theme";
import { cancelAuthFlow, waitForAuthExchange } from "../services/authFlow";

/** Require a matching recovery password before enabling the update action. */
export function isValidRecoveryPassword(password: string, confirm: string) {
  return password.length >= 8 && password === confirm;
}

/** Keep recovery fields reachable with the keyboard open and retain the isolated auth flow. */
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
    await cancelAuthFlow();
    await waitForAuthExchange();
    await supabase?.auth.signOut({ scope: "local" });
    onComplete();
  };

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          decelerationRate="normal"
        >
          <View style={styles.card}>
            <View style={styles.icon}>
              <Ionicons
                name="key-outline"
                size={28}
                color={theme.colors.text}
              />
            </View>
            <Text style={styles.title}>Set a new password</Text>
            <Text style={styles.subtitle}>
              Choose at least eight characters. This recovery session is used
              only to replace your password.
            </Text>
            <TextInput
              accessibilityLabel="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="New password"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
            />
            <TextInput
              accessibilityLabel="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm new password"
              placeholderTextColor={theme.colors.muted}
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
                <ActivityIndicator color={theme.colors.bg0} />
              ) : (
                <Text style={styles.primaryText}>Update password</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.secondaryAction}
              onPress={returnToSignIn}
            >
              <Text style={styles.secondaryText}>Return to sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  keyboard: { flex: 1, width: "100%" },
  scrollContent: {
    flexGrow: 1,
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
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.card,
  },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "500" },
  subtitle: { color: theme.colors.subtext, lineHeight: 20, fontWeight: "600" },
  input: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  primary: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  disabled: { opacity: 0.45 },
  primaryText: { color: theme.colors.bg0, fontWeight: "500" },
  secondaryAction: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    color: theme.colors.subtext,
    textAlign: "center",
    fontWeight: "600",
  },
});
