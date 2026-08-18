import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import Pressable from "./Pressable";
import { theme } from "../theme/theme";
import { useResponsive } from "../theme/layout";

export default function GradientOrb({
  outdoor,
  indoor,
  unit = "C",
  voiceActive,
  onVoicePress,
  onVoicePressIn,
  onVoicePressOut,
  compact = false,
}: {
  outdoor: { tempC: number; label: string };
  indoor: { tempC: number; label: string };
  unit?: "C" | "F";
  voiceActive?: boolean;
  onVoicePress?: () => void;
  onVoicePressIn?: () => void;
  onVoicePressOut?: () => void;
  compact?: boolean;
}) {
  const { width, isTablet, isLandscape, scale } = useResponsive();
  const baseSize = compact
    ? isTablet
      ? 250
      : 210
    : isTablet
      ? isLandscape
        ? 320
        : 380
      : 280;
  const maxSize = isTablet ? width * (isLandscape ? 0.42 : 0.62) : width - 60;
  const orbSize = Math.max(compact ? 200 : 240, Math.min(baseSize, maxSize));
  const radius = orbSize / 2;
  const innerInset = Math.max(10, Math.round(orbSize * 0.035));
  const innerRadius = radius - innerInset;
  const orbPadding = Math.round(
    (compact ? (isTablet ? 20 : 16) : isTablet ? (isLandscape ? 30 : 34) : 28) *
      scale,
  );
  const hasVoice =
    !!onVoicePress || !!onVoicePressIn || !!onVoicePressOut || !!voiceActive;
  const voiceAuraSize = Math.round(orbSize * (isTablet ? 1.2 : 1.14));
  const tempSize = Math.round(
    (compact ? (isTablet ? 28 : 25) : isTablet ? (isLandscape ? 34 : 38) : 34) *
      scale,
  );
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const promptTitleSize = Math.round((isTablet ? 18 : 16) * scale);
  const promptSubSize = Math.round((isTablet ? 12 : 11) * scale);
  const rowGap = Math.round((isTablet ? 10 : 8) * scale);
  const dividerSpacing = Math.round(
    (compact ? (isTablet ? 11 : 8) : isTablet ? 18 : 14) * scale,
  );
  const iconSize = Math.round((isTablet ? 20 : 18) * scale);
  const gradientColors: [string, string, string] = isTablet
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
  const [showPrompt, setShowPrompt] = useState(false);

  const formatTemp = (value: number) => {
    if (unit === "F") return Math.round(value * 1.8 + 32);
    return Math.round(value);
  };

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
  const orbPressHandler = hasVoice ? onVoicePress : undefined;
  const showVoicePrompt = hasVoice && showPrompt;
  const voicePromptTitle = "Say a command";
  const voicePromptSub = voiceActive ? "Listening..." : "Tap to speak";
  const voiceAuraStyle: StyleProp<ViewStyle> = [
    styles.voiceAura,
    {
      width: voiceAuraSize,
      height: voiceAuraSize,
      borderRadius: Math.round(voiceAuraSize / 2),
    },
    !voiceActive && styles.voiceAuraIdle,
  ];
  const orbStyle: StyleProp<ViewStyle> = [
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
  ];
  const orbInnerStyle: StyleProp<ViewStyle> = [
    styles.orbInner,
    {
      borderRadius: radius,
      paddingTop: orbPadding,
      paddingBottom: orbPadding,
    },
  ];
  const voicePromptTitleStyle: StyleProp<TextStyle> = [
    styles.voicePromptTitle,
    { fontSize: promptTitleSize },
  ];
  const voicePromptSubStyle: StyleProp<TextStyle> = [
    styles.voicePromptSub,
    { fontSize: promptSubSize },
  ];
  const rowStyle: StyleProp<ViewStyle> = [
    styles.row,
    { gap: rowGap },
  ];
  const tempTextStyle: StyleProp<TextStyle> = [
    styles.temp,
    { fontSize: tempSize },
  ];
  const labelTextStyle: StyleProp<TextStyle> = [
    styles.label,
    { fontSize: labelSize },
  ];
  const dividerStyle: StyleProp<ViewStyle> = [
    styles.divider,
    { marginVertical: dividerSpacing },
  ];
  const innerRingStyle: StyleProp<ViewStyle> = [
    styles.innerRing,
    {
      left: innerInset,
      top: innerInset,
      right: innerInset,
      bottom: innerInset,
      borderRadius: innerRadius,
    },
  ];

  useEffect(() => {
    if (!hasVoice) {
      setShowPrompt(false);
      return;
    }
    if (voiceActive) {
      setShowPrompt(true);
      return;
    }
    setShowPrompt(false);
    const interval = setInterval(() => {
      setShowPrompt((prev) => !prev);
    }, 5200);
    return () => clearInterval(interval);
  }, [hasVoice, voiceActive]);

  return (
    <View style={styles.wrap}>
      <View style={styles.orbStack}>
        {hasVoice && (
          <View
            pointerEvents="none"
            style={voiceAuraStyle}
          />
        )}
        <Pressable
          onPress={orbPressHandler}
          disablePressedStyle
          onPressIn={onVoicePressIn}
          onPressOut={onVoicePressOut}
        >
          <Animated.View style={orbStyle}>
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0.15, y: 0.05 }}
              end={{ x: 0.95, y: 0.95 }}
              style={orbInnerStyle}
            >
              {showVoicePrompt ? (
                <View style={styles.voicePrompt}>
                  <Text style={voicePromptTitleStyle}>
                    {voicePromptTitle}
                  </Text>
                  <Text style={voicePromptSubStyle}>
                    {voicePromptSub}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.section}>
                    <View style={rowStyle}>
                      <Ionicons
                        name="partly-sunny"
                        size={iconSize}
                        color="rgba(255,255,255,0.92)"
                      />
                      <Text style={tempTextStyle}>
                        {formatTemp(outdoor.tempC)}°{unit}
                      </Text>
                    </View>
                    <Text style={labelTextStyle}>{outdoor.label}</Text>
                  </View>

                  <View style={dividerStyle} />

                  <View style={styles.section}>
                    <View style={rowStyle}>
                      <Ionicons
                        name="home"
                        size={iconSize}
                        color="rgba(255,255,255,0.92)"
                      />
                      <Text style={tempTextStyle}>
                        {formatTemp(indoor.tempC)}°{unit}
                      </Text>
                    </View>
                    <Text style={labelTextStyle}>{indoor.label}</Text>
                  </View>
                </>
              )}
            </LinearGradient>

            {/* inner ring highlight */}
            <View
              pointerEvents="none"
              style={innerRingStyle}
            />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginTop: 10 },
  orbStack: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
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
  voiceAura: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  voiceAuraIdle: { opacity: 0.45 },
  voicePrompt: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 6,
  },
  voicePromptTitle: {
    color: "rgba(255,255,255,0.96)",
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  voicePromptSub: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: "700",
    textAlign: "center",
  },
});
