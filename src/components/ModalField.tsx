import React from "react";
import { View, Text, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { theme } from "../theme/theme";

type ModalFieldProps = {
  label?: string;
  labelStyle?: StyleProp<TextStyle>;
  hint?: string;
  hintStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/** Group a field label, editor, and optional guidance with a consistent reading rhythm. */
export default function ModalField({
  label,
  labelStyle,
  hint,
  hintStyle,
  containerStyle,
  children,
}: ModalFieldProps) {
  return (
    <View style={[styles.field, containerStyle]}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      {children}
      {hint ? <Text style={[styles.hint, hintStyle]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: theme.colors.subtext, fontSize: 12, fontWeight: '500' },
  hint: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
});
