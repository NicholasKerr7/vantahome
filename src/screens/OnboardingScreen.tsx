import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import { RootStackParamList } from "../app/AppNavigator";
import VantaHomeMark from "../components/VantaHomeMark";
import BackgroundLines from "../components/BackgroundLines";
import { theme } from "../theme/theme";
import { useResponsive } from "../theme/layout";
import LottieView from "lottie-react-native";

const ONBOARDING_LOTTIE_SOURCE = require("../../assets/animations/onboarding-hero.json");

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export default function OnboardingScreen({ navigation }: Props) {
  const { contentWidth, gutter, isTablet, isLandscape, scale, height, width } =
    useResponsive(900);
  const isWide = isTablet && isLandscape;
  const isPortraitTablet = isTablet && !isLandscape;
  const isCompact = !isTablet && height < 720;
  const outerGutter = isWide ? Math.round(gutter * 0.6) : isTablet ? gutter : 0;
  const innerGutter = isWide ? Math.round(gutter * 0.75) : gutter;
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
  const ctaHeight = Math.round((isTablet ? 50 : 46) * scale);
  const ctaTextSize = Math.round((isTablet ? 14 : 13) * scale);
  const ctaIconSize = Math.round((isTablet ? 15 : 14) * scale);
  const ctaWidth = Math.round(
    (isTablet ? (isLandscape ? 360 : 340) : 300) * scale,
  );
  const heroGap = Math.round(
    (isTablet ? (isPortraitTablet ? 32 : 28) : isCompact ? 14 : 18) * scale,
  );
  const mainGap = Math.round((isTablet ? 26 : isCompact ? 18 : 20) * scale);
  const heroRowGap = Math.round((isTablet ? 22 : isCompact ? 14 : 16) * scale);
  const heroStackGap = Math.round((isTablet ? 8 : isCompact ? 6 : 7) * scale);
  const heroSubheadTop = Math.round((isTablet ? 8 : isCompact ? 4 : 6) * scale);
  const heroShellPad = Math.round((isTablet ? 20 : 14) * scale);
  const heroShellRadius = Math.round((isTablet ? 30 : 26) * scale);
  const heroMaxWidth = isWide
    ? width - outerGutter * 2 - innerGutter * 2
    : contentWidth - gutter * 2;
  const heroVisualMaxWidth = Math.max(0, heroMaxWidth - heroShellPad * 2);
  const heroLottieWidth = Math.round(
    Math.min(
      isWide ? heroVisualMaxWidth * 0.55 : heroVisualMaxWidth,
      (isTablet ? (isLandscape ? 620 : 640) : 380) * scale,
    ),
  );
  const heroLottieHeight = Math.round((heroLottieWidth * 10) / 16);
  const heroLottieRadius = Math.round((isTablet ? 28 : 24) * scale);
  const pageStyle: StyleProp<ViewStyle> = [
    styles.page,
    {
      paddingHorizontal: isWide ? outerGutter : isTablet ? gutter : 0,
      paddingTop: contentPadTop,
      paddingBottom: contentPadBottom,
    },
  ];
  const mainContentStyle: StyleProp<ViewStyle> = [
    styles.main,
    { gap: mainGap, paddingHorizontal: innerGutter },
  ];
  const heroRowLayout: ViewStyle = {
    gap: heroRowGap,
    padding: heroShellPad,
    borderRadius: heroShellRadius,
  };
  const heroRowWideLayout: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: heroGap,
  };
  const heroRowStyle: StyleProp<ViewStyle> = [
    styles.heroRow,
    styles.heroShell,
    heroRowLayout,
    isWide && heroRowWideLayout,
    isPortraitTablet && styles.heroRowPortrait,
  ];
  const heroStackLayout: ViewStyle = { gap: heroStackGap };
  const heroStackStyle: StyleProp<ViewStyle> = [
    styles.hero,
    heroStackLayout,
    isWide && { flex: 1 },
    isPortraitTablet && styles.heroPortrait,
  ];
  const heroBrandRowStyle: StyleProp<ViewStyle> = [
    styles.heroBrandRow,
    isPortraitTablet && styles.heroBrandRowPortrait,
  ];
  const logoWrapLayout: ViewStyle = {
    width: Math.round((isTablet ? 72 : 66) * scale),
    height: Math.round((isTablet ? 72 : 66) * scale),
    borderRadius: Math.round((isTablet ? 20 : 18) * scale),
  };
  const logoWrapStyle: StyleProp<ViewStyle> = [styles.logoWrap, logoWrapLayout];
  const brandTextStyle: StyleProp<TextStyle> = [
    styles.brand,
    { fontSize: brandSize },
  ];
  const statusTextStyle: StyleProp<TextStyle> = [
    styles.statusText,
    { fontSize: statusSize },
  ];
  const kickerTextStyle: StyleProp<TextStyle> = [
    styles.kicker,
    { fontSize: kickerSize },
    isPortraitTablet && styles.textCenter,
  ];
  const headlineTextStyle: StyleProp<TextStyle> = [
    styles.headline,
    { fontSize: headlineSize },
    isPortraitTablet && styles.textCenter,
  ];
  const headlineAccentStyle: StyleProp<TextStyle> = [
    styles.headlineAccent,
    { fontSize: headlineSize },
    isPortraitTablet && styles.textCenter,
  ];
  const subheadTextStyle: StyleProp<TextStyle> = [
    styles.subhead,
    { fontSize: subheadSize, marginTop: heroSubheadTop },
    isPortraitTablet && styles.subheadPortrait,
  ];
  const heroVisualStyle: StyleProp<ViewStyle> = [
    styles.heroVisual,
    isWide && { flex: 1, alignItems: "flex-end" },
    isPortraitTablet && styles.heroVisualPortrait,
  ];
  const heroLottieFrameStyle: StyleProp<ViewStyle> = [
    styles.heroLottieFrame,
    {
      width: heroLottieWidth,
      height: heroLottieHeight,
      borderRadius: heroLottieRadius,
    },
  ];
  const ctaFooterStyle: StyleProp<ViewStyle> = [
    styles.ctaFooter,
    { paddingHorizontal: innerGutter },
  ];
  const ctaWrapStyle: StyleProp<ViewStyle> = [
    styles.ctaWrap,
    { maxWidth: ctaWidth },
  ];
  const ctaStyle: StyleProp<ViewStyle> = [
    styles.cta,
    { height: ctaHeight },
  ];
  const ctaTextStyle: StyleProp<TextStyle> = [
    styles.ctaText,
    { fontSize: ctaTextSize },
  ];
  const ctaHintStyle: StyleProp<TextStyle> = [
    styles.ctaHint,
    { fontSize: sceneTextSize },
  ];
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

      <View style={pageStyle}>
        <ScrollView
          style={styles.sectionsScroll}
          contentContainerStyle={mainContentStyle}
          showsVerticalScrollIndicator={false}
        >
          <View style={heroRowStyle}>
            <View style={heroStackStyle}>
              <View
                style={heroBrandRowStyle}
              >
                <View
                  style={logoWrapStyle}
                >
                  <VantaHomeMark
                    size={Math.round((isTablet ? 64 : 58) * scale)}
                  />
                </View>
                <View>
                  <Text style={brandTextStyle}>VantaHome</Text>
                  <View style={styles.statusRow}>
                    <View style={styles.statusDot} />
                    <Text style={statusTextStyle}>Connected</Text>
                  </View>
                </View>
              </View>
              <Text style={kickerTextStyle}>
                Smart living, orchestrated
              </Text>
              <Text style={headlineTextStyle}>
                Your home
              </Text>
              <Text style={headlineAccentStyle}>in sync.</Text>
              <Text style={subheadTextStyle}>
                Scenes, automations, and live control blended into one elegant
                dashboard.
              </Text>
            </View>

            <View style={heroVisualStyle}>
              <View
                style={heroLottieFrameStyle}
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
        </ScrollView>

        <View style={ctaFooterStyle}>
          <View style={styles.ctaBlock}>
            <Pressable
              style={ctaWrapStyle}
              pressedStyle={styles.ctaWrapPressed}
              onPress={() => navigation.replace("Main", { screen: "Home" })}
            >
              <LinearGradient
                colors={["#B08CFF", "#6B3CFF"]}
                start={{ x: 0.1, y: 0.2 }}
                end={{ x: 0.9, y: 0.9 }}
                style={ctaStyle}
              >
                <Text style={ctaTextStyle}>Enter VantaHome</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={ctaIconSize}
                    color="#FFFFFF"
                    style={styles.ctaArrow}
                  />
              </LinearGradient>
            </Pressable>
            <Text style={ctaHintStyle}>
              Control devices and scenes in seconds.
            </Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: {
    flex: 1,
    alignItems: "center",
  },
  sectionsScroll: { flex: 1, width: "100%" },
  main: { gap: 26, width: "100%" },
  heroShell: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
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
  heroRow: { gap: 22, width: "100%" },
  heroRowPortrait: { alignItems: "center" },
  hero: { alignItems: "flex-start", gap: 6 },
  heroPortrait: { alignItems: "center" },
  heroBrandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroBrandRowPortrait: { justifyContent: "center" },
  heroVisual: { alignItems: "center", justifyContent: "center" },
  heroVisualPortrait: { alignItems: "center" },
  heroLottieFrame: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
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
  headlineAccent: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -0.8,
    color: "#D9CCFF",
  },
  subhead: {
    marginTop: 8,
    maxWidth: 320,
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "600",
  },
  subheadPortrait: { maxWidth: 420, textAlign: "center" },
  ctaFooter: { width: "100%", paddingTop: 12 },
  ctaBlock: { alignItems: "center", gap: 10, marginTop: 4 },
  ctaWrap: { width: "100%", alignSelf: "center" },
  ctaWrapPressed: { transform: [{ scale: 0.98 }] },
  cta: {
    height: 56,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6B3CFF",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  ctaText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  ctaHint: { color: "rgba(255,255,255,0.7)", fontWeight: "700", fontSize: 12 },
  ctaArrow: { marginLeft: 8, transform: [{ rotate: "-45deg" }] },
});
