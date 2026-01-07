import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { RootStackParamList } from "../app/AppNavigator";
import GradientText from "../components/GradientText";
import VantaHomeMark from "../components/VantaHomeMark";
import BackgroundLines from "../components/BackgroundLines";
import { theme } from "../theme/theme";
import { useResponsive } from "../theme/layout";
import LottieView from "lottie-react-native";

const ONBOARDING_LOTTIE_SOURCE = require("../../assets/animations/Automao casa externa.json");

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export default function OnboardingScreen({ navigation }: Props) {
  const { contentWidth, gutter, isTablet, isLandscape, scale, height } =
    useResponsive(900);
  const isWide = isTablet && isLandscape;
  const isPortraitTablet = isTablet && !isLandscape;
  const isCompact = !isTablet && height < 720;
  const contentPadTop = Math.round(
    (isTablet
      ? isLandscape
        ? 64
        : isPortraitTablet
          ? 70
          : 86
      : isCompact
        ? 58
        : 64) * scale,
  );
  const contentPadBottom = Math.round(
    (isTablet ? 64 : isCompact ? 36 : 42) * scale,
  );
  const brandSize = Math.round((isTablet ? 24 : 22) * scale);
  const statusSize = Math.round((isTablet ? 13 : 12) * scale);
  const kickerSize = Math.round((isTablet ? 13 : 12) * scale);
  const headlineSize = Math.round((isTablet ? 44 : 40) * scale);
  const subheadSize = Math.round((isTablet ? 15 : 14) * scale);
  const sceneTextSize = Math.round((isTablet ? 13 : 12) * scale);
  const ctaHeight = Math.round((isTablet ? 60 : 56) * scale);
  const ctaTextSize = Math.round((isTablet ? 16 : 15) * scale);
  const heroGap = Math.round(
    (isTablet ? (isPortraitTablet ? 32 : 28) : isCompact ? 14 : 18) * scale,
  );
  const mainGap = Math.round((isTablet ? 26 : isCompact ? 18 : 20) * scale);
  const heroRowGap = Math.round((isTablet ? 22 : isCompact ? 14 : 16) * scale);
  const heroStackGap = Math.round((isTablet ? 8 : isCompact ? 6 : 7) * scale);
  const heroSubheadTop = Math.round((isTablet ? 8 : isCompact ? 4 : 6) * scale);
  const heroLottieWidth = Math.round(
    Math.min(
      isWide ? contentWidth * 0.45 : contentWidth - gutter * 2,
      (isTablet ? (isLandscape ? 520 : 620) : 360) * scale,
    ),
  );
  const heroLottieHeight = Math.round((heroLottieWidth * 9) / 16);
  return (
    <LinearGradient
      colors={["#190A3A", theme.colors.bg0, theme.colors.bg1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      <BackgroundLines />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isTablet ? gutter : 0,
            paddingTop: contentPadTop,
            paddingBottom: contentPadBottom,
            justifyContent: "space-between",
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.main,
            {
              width: contentWidth,
              gap: mainGap,
              paddingHorizontal: isTablet ? 0 : gutter,
            },
          ]}
        >
          <View
            style={[
              styles.brandRow,
              isPortraitTablet && styles.brandRowPortrait,
            ]}
          >
            <View
              style={[
                styles.logoWrap,
                {
                  width: Math.round((isTablet ? 76 : 70) * scale),
                  height: Math.round((isTablet ? 76 : 70) * scale),
                  borderRadius: Math.round((isTablet ? 22 : 20) * scale),
                },
              ]}
            >
              <VantaHomeMark size={Math.round((isTablet ? 70 : 64) * scale)} />
            </View>
            <View>
              <Text style={[styles.brand, { fontSize: brandSize }]}>
                VantaHome
              </Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={[styles.statusText, { fontSize: statusSize }]}>
                  Connected
                </Text>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.heroRow,
              { gap: heroRowGap },
              isWide && {
                flexDirection: "row",
                alignItems: "center",
                gap: heroGap,
              },
              isPortraitTablet && styles.heroRowPortrait,
            ]}
          >
            <View
              style={[
                styles.hero,
                { gap: heroStackGap },
                isWide && { flex: 1 },
                isPortraitTablet && styles.heroPortrait,
              ]}
            >
              <Text
                style={[
                  styles.kicker,
                  { fontSize: kickerSize },
                  isPortraitTablet && styles.textCenter,
                ]}
              >
                Smart living, orchestrated
              </Text>
              <Text
                style={[
                  styles.headline,
                  { fontSize: headlineSize },
                  isPortraitTablet && styles.textCenter,
                ]}
              >
                Your home
              </Text>
              <GradientText
                text="in sync."
                colors={["#C9B7FF", "#7A5CFF"] as [string, string]}
                textProps={{
                  style: [
                    styles.headlineAccent,
                    { fontSize: headlineSize },
                    isPortraitTablet && styles.textCenter,
                  ],
                }}
              />
              <Text
                style={[
                  styles.subhead,
                  { fontSize: subheadSize, marginTop: heroSubheadTop },
                  isPortraitTablet && styles.subheadPortrait,
                ]}
              >
                Scenes, automations, and live control blended into one elegant
                dashboard.
              </Text>
            </View>

            <View
              style={[
                styles.heroVisual,
                isWide && { flex: 1, alignItems: "flex-end" },
                isPortraitTablet && styles.heroVisualPortrait,
              ]}
            >
              <View
                style={[
                  styles.heroLottieFrame,
                  { width: heroLottieWidth, height: heroLottieHeight },
                ]}
              >
                <LottieView
                  source={ONBOARDING_LOTTIE_SOURCE}
                  autoPlay
                  loop
                  resizeMode="contain"
                  style={styles.onboardingLottie}
                />
              </View>
            </View>
          </View>
        </View>

        <View
          style={{
            width: contentWidth,
            paddingHorizontal: isTablet ? 0 : gutter,
          }}
        >
          <View style={styles.ctaBlock}>
            <Pressable
              style={styles.ctaWrap}
              pressedStyle={styles.ctaWrapPressed}
              onPress={() => navigation.replace("Main")}
            >
              <LinearGradient
                colors={["#B08CFF", "#6B3CFF"]}
                start={{ x: 0.1, y: 0.2 }}
                end={{ x: 0.9, y: 0.9 }}
                style={[styles.cta, { height: ctaHeight }]}
              >
                <Text style={[styles.ctaText, { fontSize: ctaTextSize }]}>
                  Enter VantaHome
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={Math.round(16 * scale)}
                  color="#FFFFFF"
                  style={{ marginLeft: 8 }}
                />
              </LinearGradient>
            </Pressable>
            <Text style={[styles.ctaHint, { fontSize: sceneTextSize }]}>
              Control devices and scenes in seconds.
            </Text>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    alignItems: "center",
  },
  main: { gap: 26 },
  glowTop: {
    position: "absolute",
    top: -120,
    right: -140,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(122,92,255,0.35)",
  },
  glowBottom: {
    position: "absolute",
    bottom: -160,
    left: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(180,107,255,0.25)",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  brandRowPortrait: { justifyContent: "center" },
  logoWrap: {
    width: 70,
    height: 70,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 22,
    letterSpacing: -0.4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#7CFFB2",
  },
  statusText: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: "700",
    fontSize: 12,
  },
  heroRow: { gap: 22 },
  heroRowPortrait: { alignItems: "center" },
  hero: { alignItems: "flex-start", gap: 6 },
  heroPortrait: { alignItems: "center" },
  heroVisual: { alignItems: "center", justifyContent: "center" },
  heroVisualPortrait: { alignItems: "center" },
  heroLottieFrame: { alignItems: "center", justifyContent: "center" },
  onboardingLottie: { width: "100%", height: "100%" },
  textCenter: { textAlign: "center" },
  kicker: {
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "800",
  },
  headline: {
    fontSize: 40,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.8,
  },
  headlineAccent: { fontSize: 40, fontWeight: "900", letterSpacing: -0.8 },
  subhead: {
    marginTop: 8,
    maxWidth: 320,
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "600",
  },
  subheadPortrait: { maxWidth: 420, textAlign: "center" },
  ctaBlock: { alignItems: "center", gap: 10, marginTop: 4 },
  ctaWrap: { width: "100%" },
  ctaWrapPressed: { transform: [{ scale: 0.98 }] },
  cta: {
    height: 56,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6B3CFF",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  ctaText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  ctaHint: { color: "rgba(255,255,255,0.7)", fontWeight: "700", fontSize: 12 },
});
