import React from "react";
import { View, Text } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import type { Device } from "../../store/useHomeStore";
import DeviceIcon from "../../components/DeviceIcon";

type GenericHeroSectionProps = {
  deviceKind: Device["kind"];
  title: string;
  subtitle: string;
  iconColor: string;
  iconSize: number;
  containerStyle: StyleProp<ViewStyle>;
  iconWrapStyle: StyleProp<ViewStyle>;
  titleStyle: StyleProp<TextStyle>;
  subtitleStyle: StyleProp<TextStyle>;
  flex1Style: StyleProp<ViewStyle>;
};

export default function GenericHeroSection({
  deviceKind,
  title,
  subtitle,
  iconColor,
  iconSize,
  containerStyle,
  iconWrapStyle,
  titleStyle,
  subtitleStyle,
  flex1Style,
}: GenericHeroSectionProps) {
  return (
    <View style={containerStyle}>
      <View style={iconWrapStyle}>
        <DeviceIcon kind={deviceKind} size={iconSize} color={iconColor} />
      </View>
      <View style={flex1Style}>
        <Text style={titleStyle}>{title}</Text>
        <Text style={subtitleStyle}>{subtitle}</Text>
      </View>
    </View>
  );
}
