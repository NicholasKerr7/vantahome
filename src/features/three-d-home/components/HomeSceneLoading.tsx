import React, { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import VantaHomeMark from '../../../components/VantaHomeMark';
import { useDecorativeMotion } from '../../../components/useDecorativeMotion';
import { theme } from '../../../theme/theme';

/** Show an orbital home signature only while the real scene is still preparing. */
export default function HomeSceneLoading({ active = true }: { active?: boolean }) {
  const { height, fontScale } = useWindowDimensions();
  const compact = height <= 700;
  // Prioritize the real loading status when accessibility text needs the artwork's space.
  const showArtwork = fontScale < 1.3;
  const motionAllowed = useDecorativeMotion(active && showArtwork);
  const orbit = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(orbit);
    orbit.value = 0;
    if (motionAllowed) orbit.value = withRepeat(withTiming(1, {
      duration: 18_000, easing: Easing.linear, reduceMotion: ReduceMotion.Never,
    }), -1, false, undefined, ReduceMotion.Never);
    return () => cancelAnimation(orbit);
  }, [motionAllowed, orbit]);
  const outerOrbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbit.value * 360}deg` }] }));
  const innerOrbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbit.value * -360}deg` }] }));

  return <View style={[styles.root, compact && styles.rootCompact]} testID="home-scene-loading" accessibilityLiveRegion="polite">
    <View style={styles.atmosphere} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" viewBox="0 0 500 600">
        <Defs>
          <Pattern id="loading-home-grid" x="0" y="0" width="36" height="36" patternUnits="userSpaceOnUse">
            <Path d="M36 0 H0 V36" fill="none" stroke={theme.colors.accent} strokeOpacity="0.10" strokeWidth="0.7" />
          </Pattern>
          <RadialGradient id="loading-home-glow"><Stop offset="0" stopColor={theme.colors.accent2} stopOpacity="0.30" /><Stop offset="1" stopColor={theme.colors.bg0} stopOpacity="0" /></RadialGradient>
        </Defs>
        <Rect width="500" height="600" fill="url(#loading-home-grid)" />
        <Circle cx="250" cy="274" r="230" fill="url(#loading-home-glow)" />
        <Path d="M24 100 V24 H100 M400 24 H476 V100 M24 500 V576 H100 M400 576 H476 V500" fill="none" stroke={theme.colors.accent} strokeOpacity="0.16" />
      </Svg>
    </View>
    <View style={styles.content}>
      {showArtwork && <View style={[styles.orbitalLayout, compact && styles.orbitalLayoutCompact]} testID="home-loading-artwork" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.orbitalStage, compact && styles.orbitalStageCompact]}>
          <Svg style={styles.stationaryRings} width="216" height="216" viewBox="0 0 216 216">
            <Circle cx="108" cy="108" r="105" fill="none" stroke={theme.colors.accent} strokeOpacity="0.12" />
            <Circle cx="108" cy="108" r="88" fill="none" stroke={theme.colors.accent} strokeOpacity="0.12" />
            <Line x1="108" y1="0" x2="108" y2="12" stroke={theme.colors.electric} strokeOpacity="0.40" />
            <Line x1="204" y1="108" x2="216" y2="108" stroke={theme.colors.electric} strokeOpacity="0.40" />
            <Line x1="108" y1="204" x2="108" y2="216" stroke={theme.colors.electric} strokeOpacity="0.40" />
            <Line x1="0" y1="108" x2="12" y2="108" stroke={theme.colors.electric} strokeOpacity="0.40" />
          </Svg>
          <Animated.View testID="home-loading-outer-orbit" style={[styles.orbit, outerOrbitStyle]}>
            <Svg width="216" height="216" viewBox="0 0 216 216">
              <Circle cx="108" cy="108" r="98" fill="none" stroke={theme.colors.accent} strokeWidth="1.5" strokeDasharray="88 528" strokeLinecap="round" />
              <Circle cx="108" cy="10" r="3" fill={theme.colors.electric} />
            </Svg>
          </Animated.View>
          <Animated.View testID="home-loading-inner-orbit" style={[styles.orbit, innerOrbitStyle]}>
            <Svg width="216" height="216" viewBox="0 0 216 216">
              <Circle cx="108" cy="108" r="75" fill="none" stroke={theme.colors.accentText} strokeOpacity="0.65" strokeWidth="1" strokeDasharray="58 90 24 299" strokeLinecap="round" />
            </Svg>
          </Animated.View>
          <View style={styles.signature}><VantaHomeMark size={80} decorative /></View>
        </View>
      </View>}
      {showArtwork && <Text style={styles.brand}>VANTAHOME</Text>}
      <Text style={styles.title}>Preparing your home…</Text>
      <Text style={[styles.description, !showArtwork && styles.descriptionAccessible]}>Loading the furnished house and landscape.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: theme.spacing(3), backgroundColor: theme.colors.bg0 },
  rootCompact: { padding: theme.spacing(2) },
  atmosphere: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.overlayStrong },
  content: { width: '100%', maxWidth: 340, alignItems: 'center' },
  orbitalLayout: { width: 216, height: 216, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing(3) },
  orbitalLayoutCompact: { width: 144, height: 144 },
  orbitalStage: { width: 216, height: 216, alignItems: 'center', justifyContent: 'center' },
  orbitalStageCompact: { transform: [{ scale: 2 / 3 }] },
  stationaryRings: { ...StyleSheet.absoluteFillObject },
  orbit: { ...StyleSheet.absoluteFillObject },
  signature: { width: 116, height: 116, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.stroke },
  brand: { color: theme.colors.accentText, fontSize: 10, fontWeight: '600', letterSpacing: 3.4, marginBottom: theme.spacing(1.5) },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: '500', textAlign: 'center', letterSpacing: -0.3 },
  description: { color: theme.colors.subtext, fontSize: 12, lineHeight: 19, maxWidth: 240, textAlign: 'center', marginTop: theme.spacing(1.5) },
  descriptionAccessible: { maxWidth: 340 },
});
