import React, { useEffect, useMemo } from "react";
import { View, StyleSheet, LayoutChangeEvent } from "react-native";
import Pressable from "./Pressable";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { useResponsive } from "../theme/layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

export default function TabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { width, isTablet, isLandscape, scale, gutter } = useResponsive();
  const insets = useSafeAreaInsets();
  const inset = isTablet ? (isLandscape ? 28 : 24) : gutter;
  const bottomInset = insets.bottom > 0 ? insets.bottom + 8 : inset;
  const maxWidth = isTablet ? (isLandscape ? 720 : 560) : width - inset * 2;
  const barWidth = Math.min(width - inset * 2, maxWidth);
  const barLeft = (width - barWidth) / 2;
  const count = state.routes.length;
  const barHeight = Math.round(
    (isTablet ? (isLandscape ? 74 : 72) : 68) * scale,
  );
  const pillInset = isTablet ? 10 : 8;
  const iconSize = Math.round(
    (isTablet ? (isLandscape ? 24 : 23) : 22) * scale,
  );
  const iconWrapSize = Math.round(
    (isTablet ? (isLandscape ? 52 : 48) : 44) * scale,
  );
  const iconRadius = Math.round(iconWrapSize * 0.36);
  const activeRoute = state.routes[state.index]?.name ?? "Home";
  const isHome = activeRoute === "Home";
  const useAltTone = !isTablet && !isHome;
  const barBackground = useAltTone
    ? "rgba(20,10,40,0.82)"
    : "rgba(255,255,255,0.12)";
  const barBorder = useAltTone
    ? "rgba(255,255,255,0.12)"
    : "rgba(255,255,255,0.16)";
  const pillBackground = useAltTone
    ? "rgba(180,107,255,0.38)"
    : "rgba(180,107,255,0.28)";
  const pillBorder = useAltTone
    ? "rgba(255,255,255,0.22)"
    : "rgba(255,255,255,0.18)";
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
    transform: [{ translateX: pillX.value }],
    width: itemW.value,
  }));

  const routes = useMemo(() => state.routes, [state.routes]);

  return (
    <View
      style={[
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
      ]}
      onLayout={onLayout}
    >
      <Animated.View
        style={[
          styles.pill,
          pillStyle,
          {
            top: pillInset,
            bottom: pillInset,
            borderRadius: Math.round((barHeight - pillInset * 2) / 2),
            backgroundColor: pillBackground,
            borderColor: pillBorder,
          },
        ]}
      />

      {routes.map((route, idx) => {
        const isFocused = state.index === idx;
        const icon = ICONS[route.name] ?? "cube";

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
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={onPress}
            style={styles.item}
          >
            <View
              style={[
                styles.iconWrap,
                {
                  width: iconWrapSize,
                  height: iconWrapSize,
                  borderRadius: iconRadius,
                },
                isFocused && styles.iconWrapFocused,
              ]}
            >
              <Ionicons
                name={icon}
                size={iconSize}
                color={isFocused ? theme.colors.text : theme.colors.subtext}
              />
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
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    overflow: "hidden",
  },
  pill: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: 0,
    borderRadius: 18,
    backgroundColor: "rgba(180,107,255,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapFocused: {
    shadowColor: theme.colors.glow,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
});
