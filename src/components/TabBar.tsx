import React, { useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "./Pressable";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useResponsive } from "../theme/layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

/**
 * Custom bottom tab bar with an animated “pill” highlight (premium cue).
 *
 * The pill width is calculated from the layout width / tab count, and its X
 * offset is animated when the active tab changes.
 */
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: "home",
  Automations: "flash",
  Scenes: "grid",
  Settings: "settings",
};
const LABELS: Record<string, string> = {
  Home: "Home",
  Automations: "Auto",
  Scenes: "Scenes",
  Settings: "Settings",
};
const AnimatedLinearGradient =
  Animated.createAnimatedComponent(LinearGradient);

export default function TabBar({
  state,
  navigation,
}: BottomTabBarProps) {
  const { width, isTablet, isLandscape, scale, gutter } = useResponsive();
  const insets = useSafeAreaInsets();
  const inset = isTablet ? (isLandscape ? 28 : 24) : gutter;
  const bottomInset =
    insets.bottom > 0
      ? insets.bottom + 8
      : !isTablet && isLandscape
        ? 10
        : inset;
  const maxWidth = isTablet ? (isLandscape ? 720 : 560) : width - inset * 2;
  const barWidth = Math.min(width - inset * 2, maxWidth);
  const barLeft = (width - barWidth) / 2;
  const count = state.routes.length;
  const barHeight = Math.round(
    (isTablet ? (isLandscape ? 76 : 72) : isLandscape ? 52 : 60) * scale,
  );
  const pillInset = Math.round((isTablet ? 10 : 8) * scale);
  const pillInsetX = Math.round((isTablet ? 10 : 6) * scale);
  const iconSize = Math.round(
    (isTablet ? (isLandscape ? 22 : 21) : 20) * scale,
  );
  const labelSize = Math.round((isTablet ? 12 : 11) * scale);
  const itemGap = Math.round((isTablet ? 8 : 6) * scale);
  const barBackground = "rgba(249,245,255,0.97)";
  const barBorder = "rgba(255,255,255,0.7)";
  const pillBorder = "rgba(255,255,255,0.35)";
  const pillColors: [string, string] = ["#B08CFF", "#6B3CFF"];
  const inactiveIcon = "rgba(80,70,120,0.72)";
  // Measured container width (used to derive `itemW`). Stored as a shared value
  // so the animated pill can react to layout changes without re-render.
  const layoutW = useSharedValue(0);
  const itemW = useSharedValue(0);
  const pillX = useSharedValue(0);

  // Called once the tab bar has its real width.
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    layoutW.value = w;
    itemW.value = w / count;
    pillX.value = itemW.value * state.index;
  };

  // Animate the pill whenever the active tab changes.
  useEffect(() => {
    if (itemW.value > 0) {
      pillX.value = withTiming(itemW.value * state.index, {
        duration: 380,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [state.index]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value + pillInsetX }],
    width: Math.max(0, itemW.value - pillInsetX * 2),
  }));
  const barStyle: StyleProp<ViewStyle> = [
    styles.wrap,
    {
      left: barLeft,
      right: undefined,
      width: barWidth,
      height: barHeight,
      borderRadius: Math.round(barHeight / 2),
      bottom: bottomInset,
      backgroundColor: barBackground,
      borderColor: barBorder,
    },
  ];
  const pillFrameStyle: StyleProp<ViewStyle> = [
    styles.pill,
    pillStyle,
    {
      top: pillInset,
      bottom: pillInset,
      borderRadius: Math.round((barHeight - pillInset * 2) / 2),
      borderColor: pillBorder,
    },
  ];
  const itemInnerStyle: StyleProp<ViewStyle> = [
    styles.itemInner,
    { gap: itemGap },
  ];
  const itemLabelStyle: StyleProp<TextStyle> = [
    styles.itemLabel,
    { fontSize: labelSize },
  ];

  const routes = useMemo(() => state.routes, [state.routes]);

  return (
    <View style={barStyle} onLayout={onLayout}>
      <AnimatedLinearGradient
        style={pillFrameStyle}
        colors={pillColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {routes.map((route, idx) => {
        const isFocused = state.index === idx;
        const icon = ICONS[route.name] ?? "cube";
        const label = LABELS[route.name] ?? route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented)
            navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityLabel={route.name}
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            style={styles.item}
          >
            <View style={itemInnerStyle}>
              <Ionicons
                name={icon}
                size={iconSize}
                color={isFocused ? "#FFFFFF" : inactiveIcon}
              />
              {isFocused ? (
                <Text style={itemLabelStyle}>{label}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    height: 68,
    borderRadius: 26,
    backgroundColor: "rgba(245,235,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    flexDirection: "row",
    overflow: "hidden",
  },
  pill: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: 0,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center" },
  itemInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
