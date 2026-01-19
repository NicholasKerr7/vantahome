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
          style={action.style}
          disabled={action.disabled}
          testID={action.testID}
        >
          <Text style={action.textStyle}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
});
