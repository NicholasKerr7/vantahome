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
import type { Device } from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import DeviceIcon from "./DeviceIcon";

/** Show named device shortcuts without losing the room context. */
export default function DeviceQuickRow({
  devices,
  onPressDevice,
}: {
  devices: Device[];
  onPressDevice: (id: string) => void;
}) {
  const { isTablet, scale } = useResponsive();
  const rowGap = Math.round((isTablet ? 18 : 14) * scale);
  const iconWrapSize = Math.round((isTablet ? 54 : 44) * scale);
  const iconWrapRadius = Math.round(iconWrapSize * 0.36);
  const iconSize = Math.round((isTablet ? 20 : 18) * scale);
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const rowStyle: StyleProp<ViewStyle> = [
    styles.row,
    { gap: rowGap },
  ];
  const iconWrapStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.iconWrap,
    {
      width: iconWrapSize,
      height: iconWrapSize,
      borderRadius: iconWrapRadius,
    },
    active && styles.iconWrapOn,
  ];
  const labelStyle: StyleProp<TextStyle> = [
    styles.label,
    { fontSize: labelSize },
  ];
  return (
    <View style={rowStyle}>
      {devices.map((d) => (
        <Pressable
          key={d.id}
          accessibilityLabel={`Open ${d.name}`}
          style={styles.item}
          onPress={() => onPressDevice(d.id)}
        >
          <View style={iconWrapStyle(d.isOn)}>
            <DeviceIcon
              kind={d.kind}
              size={iconSize}
              color={theme.colors.text}
            />
          </View>
          <Text style={labelStyle} numberOfLines={1}>{d.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 14,
    marginTop: 14,
    justifyContent: "space-between",
  },
  item: { alignItems: "center", flex: 1, minWidth: 0, minHeight: 64 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapOn: { backgroundColor: theme.colors.bg1, borderColor: theme.colors.accent },
  label: {
    marginTop: 8,
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "500",
  },
});
