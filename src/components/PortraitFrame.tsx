import React from "react";
import { theme } from "../theme/theme";
import {
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type DimensionValue,
} from "react-native";

type Props = {
  enabled?: boolean;
  width?: DimensionValue;
  pad?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export default function PortraitFrame({
  enabled,
  width,
  pad = 12,
  radius = 24,
  style,
  children,
}: Props) {
  if (!enabled) return <>{children}</>;

  const bottomPad = pad > 0 ? pad : 12;
  const frameStyle: StyleProp<ViewStyle> = [
    styles.frame,
    width ? { width, alignSelf: "center" } : null,
    { padding: pad, paddingBottom: bottomPad, borderRadius: radius },
    style,
  ];

  return <View style={frameStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: theme.colors.glass,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
});
