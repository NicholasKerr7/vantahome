import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { useResponsive } from "../theme/layout";

export default function GradientOrb({
  outdoor,
  indoor,
}: {
  outdoor: { tempC: number; label: string };
  indoor: { tempC: number; label: string };
}) {
  const { width, isTablet, isLandscape, scale } = useResponsive();
  const baseSize = isTablet ? (isLandscape ? 320 : 380) : 280;
  const maxSize = isTablet ? width * (isLandscape ? 0.42 : 0.62) : width - 60;
  const orbSize = Math.max(240, Math.min(baseSize, maxSize));
  const radius = orbSize / 2;
  const innerInset = Math.max(10, Math.round(orbSize * 0.035));
  const innerRadius = radius - innerInset;
  const orbPadding = Math.round(
    (isTablet ? (isLandscape ? 30 : 34) : 28) * scale,
  );
  const tempSize = Math.round(
    (isTablet ? (isLandscape ? 34 : 38) : 34) * scale,
  );
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const rowGap = Math.round((isTablet ? 10 : 8) * scale);
  const dividerSpacing = Math.round((isTablet ? 18 : 14) * scale);
  const iconSize = Math.round((isTablet ? 20 : 18) * scale);
  const gradientColors = isTablet
    ? [
        "rgba(255,255,255,0.26)",
        "rgba(185,215,255,0.46)",
        "rgba(100,135,255,0.92)",
      ]
    : [
        "rgba(255,255,255,0.26)",
        "rgba(210,170,255,0.42)",
        "rgba(122,92,255,0.88)",
      ];
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.03 }],
    opacity: 0.85 + pulse.value * 0.15,
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.orb,
          {
            width: orbSize,
            height: orbSize,
            borderRadius: radius,
            borderWidth: isTablet ? 2 : 2,
            shadowOpacity: isTablet ? 0.5 : 0.45,
            shadowRadius: isTablet ? 30 : 24,
          },
          glowStyle,
        ]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0.15, y: 0.05 }}
          end={{ x: 0.95, y: 0.95 }}
          style={[
            styles.orbInner,
            { borderRadius: radius, paddingVertical: orbPadding },
          ]}
        >
          <View style={styles.section}>
            <View style={[styles.row, { gap: rowGap }]}>
              <Ionicons
                name="partly-sunny"
                size={iconSize}
                color="rgba(255,255,255,0.92)"
              />
              <Text style={[styles.temp, { fontSize: tempSize }]}>
                {outdoor.tempC}°C
              </Text>
            </View>
            <Text style={[styles.label, { fontSize: labelSize }]}>
              {outdoor.label}
            </Text>
          </View>

          <View style={[styles.divider, { marginVertical: dividerSpacing }]} />

          <View style={styles.section}>
            <View style={[styles.row, { gap: rowGap }]}>
              <Ionicons
                name="home"
                size={iconSize}
                color="rgba(255,255,255,0.92)"
              />
              <Text style={[styles.temp, { fontSize: tempSize }]}>
                {indoor.tempC}°C
              </Text>
            </View>
            <Text style={[styles.label, { fontSize: labelSize }]}>
              {indoor.label}
            </Text>
          </View>
        </LinearGradient>

        {/* inner ring highlight */}
        <View
          pointerEvents="none"
          style={[
            styles.innerRing,
            {
              left: innerInset,
              top: innerInset,
              right: innerInset,
              bottom: innerInset,
              borderRadius: innerRadius,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginTop: 10 },
  orb: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.90)",
    shadowColor: theme.colors.glow,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  orbInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  innerRing: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
  },

  section: { alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  temp: {
    color: "rgba(255,255,255,0.96)",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  label: { color: "rgba(255,255,255,0.72)", marginTop: 6, fontWeight: "800" },
  divider: {
    height: 1,
    width: "68%",
    backgroundColor: "rgba(255,255,255,0.26)",
    marginVertical: 18,
  },
});
