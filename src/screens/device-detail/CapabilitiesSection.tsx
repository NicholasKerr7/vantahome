import React from "react";
import { View } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import type { Device } from "../../store/useHomeStore";
import DeviceCapabilityControls from "../../components/DeviceCapabilityControls";
import GenericHeroSection from "./GenericHeroSection";

type CapabilitiesSectionProps = {
  device: Device;
  statusText: string;
  iconColor: string;
  iconSize: number;
  containerStyle: StyleProp<ViewStyle>;
  heroStyle: StyleProp<ViewStyle>;
  iconWrapStyle: StyleProp<ViewStyle>;
  titleStyle: StyleProp<TextStyle>;
  subtitleStyle: StyleProp<TextStyle>;
  flex1Style: StyleProp<ViewStyle>;
  capabilitiesWrapStyle: StyleProp<ViewStyle>;
};

export default function CapabilitiesSection({
  device,
  statusText,
  iconColor,
  iconSize,
  containerStyle,
  heroStyle,
  iconWrapStyle,
  titleStyle,
  subtitleStyle,
  flex1Style,
  capabilitiesWrapStyle,
}: CapabilitiesSectionProps) {
  return (
    <View style={containerStyle}>
      <GenericHeroSection
        deviceKind={device.kind}
        title={device.name}
        subtitle={statusText}
        iconColor={iconColor}
        iconSize={iconSize}
        containerStyle={heroStyle}
        iconWrapStyle={iconWrapStyle}
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
        flex1Style={flex1Style}
      />
      <View style={capabilitiesWrapStyle}>
        <DeviceCapabilityControls
          device={device}
          context="detail"
          variant="light"
          layout="cards"
        />
      </View>
    </View>
  );
}
