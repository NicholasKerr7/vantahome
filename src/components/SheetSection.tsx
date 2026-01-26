import React from "react";
import { View, Text, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

type Props = {
  title: string;
  children: React.ReactNode;
  sectionStyle: StyleProp<ViewStyle>;
  titleStyle: StyleProp<TextStyle>;
};

export default function SheetSection({
  title,
  children,
  sectionStyle,
  titleStyle,
}: Props) {
  return (
    <View style={sectionStyle}>
      <Text style={titleStyle}>{title}</Text>
      {children}
    </View>
  );
}
