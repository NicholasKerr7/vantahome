import React, { type PropsWithChildren } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import LandscapeFrame from "./LandscapeFrame";
import PortraitFrame from "./PortraitFrame";
import type { DimensionValue } from "react-native";

type ScreenFrameProps = PropsWithChildren<{
  isPortrait: boolean;
  enabled: boolean;
  isWide: boolean;
  pad: number;
  radius: number;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
}>;

export default function ScreenFrame({
  isPortrait,
  enabled,
  isWide,
  pad,
  radius,
  width,
  style,
  children,
}: ScreenFrameProps) {
  const frameWidth = width ?? "100%";
  const FrameComponent = isPortrait ? PortraitFrame : LandscapeFrame;
  const frameStyle: StyleProp<ViewStyle> = [
    styles.frameFill,
    isWide && styles.fullFrame,
    style,
  ];

  return (
    <View style={styles.frameWrap}>
      <FrameComponent
        enabled={enabled}
        width={frameWidth}
        pad={isWide ? 0 : pad}
        radius={radius}
        style={frameStyle}
      >
        <View style={styles.frameInner}>{children}</View>
      </FrameComponent>
    </View>
  );
}

const styles = StyleSheet.create({
  frameWrap: { width: "100%", flex: 1 },
  frameFill: { flex: 1, alignSelf: "stretch" },
  frameInner: { width: "100%", flex: 1 },
  fullFrame: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.24)",
    shadowOpacity: 0.04,
  },
});
