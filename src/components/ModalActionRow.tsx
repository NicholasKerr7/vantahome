import React from "react";
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "./Pressable";
import { theme } from "../theme/theme";

type ModalAction = {
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  testID?: string;
};

type ModalActionRowProps = {
  actions: ModalAction[];
  style?: StyleProp<ViewStyle>;
};

/** Keep dialog actions consistently sized and clearly separated from editable content. */
export default function ModalActionRow({
  actions,
  style,
}: ModalActionRowProps) {
  return (
    <View style={[styles.row, style]}>
      {actions.map((action, index) => (
        <Pressable
          key={`${action.label}-${index}`}
          onPress={action.onPress}
          style={[styles.action, action.style]}
          disabled={action.disabled}
          accessibilityState={{ disabled: Boolean(action.disabled) }}
          testID={action.testID}
        >
          <Text style={[styles.label, action.textStyle]}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { color: theme.colors.text, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
