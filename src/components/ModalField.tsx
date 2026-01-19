import React from "react";
import { View, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

type ModalFieldProps = {
  label?: string;
  labelStyle?: StyleProp<TextStyle>;
  hint?: string;
  hintStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export default function ModalField({
  label,
  labelStyle,
  hint,
  hintStyle,
  containerStyle,
  children,
}: ModalFieldProps) {
  return (
    <View style={containerStyle}>
      {label ? <Text style={labelStyle}>{label}</Text> : null}
      {children}
      {hint ? <Text style={hintStyle}>{hint}</Text> : null}
    </View>
  );
}
