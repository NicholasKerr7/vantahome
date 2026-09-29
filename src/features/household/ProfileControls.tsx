import React from "react";
import {
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import Pressable from "../../components/Pressable";
import ThemedSwitch from "../../components/ThemedSwitch";
import { theme } from "../../theme/theme";
import { householdStyles as styles } from "./householdStyles";

/** Keep longer edit forms inside the card, with native momentum and restrained overscroll. */
export function ProfileForm({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={styles.formContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
    >
      {children}
    </ScrollView>
  );
}

/** Give every editable field a visible caption and an accessible name. */
export function ProfileField({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor={theme.colors.muted}
        style={styles.input}
      />
    </View>
  );
}

/** Use the same touch-sized choice treatment for roles, units, and room access. */
export function ProfileChoice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        selected && styles.choiceSelected,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Display a saved or session-level preference without changing its existing persistence. */
export function ProfileToggle({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.row, styles.rowDivider]}>
      <View style={styles.heading}>
        <Text style={styles.rowText}>{label}</Text>
        {detail && <Text style={styles.detail}>{detail}</Text>}
      </View>
      <ThemedSwitch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        activeThumbColor={theme.colors.accent}
        thumbColor={theme.colors.text}
      />
    </View>
  );
}
