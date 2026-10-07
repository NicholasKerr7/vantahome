import React, { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useDecorativeMotion } from '../../components/useDecorativeMotion';
import { theme } from '../../theme/theme';

/** A generic architectural signature, never a preview of a household's unverified private rooms. */
export default function VerificationArchitecture({ active }: { active: boolean }) {
  const id = useId().replace(/:/g, '');
  const glowId = `${id}-glow`;
  const facadeId = `${id}-facade`;
  const roofId = `${id}-roof`;
  const glassId = `${id}-glass`;
  const motionAllowed = useDecorativeMotion(active);
  const breath = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(breath);
    breath.value = 0;
    if (motionAllowed) breath.value = withRepeat(withTiming(1, {
      duration: 4200, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never,
    }), -1, true, undefined, ReduceMotion.Never);
    return () => cancelAnimation(breath);
  }, [breath, motionAllowed]);
  const homeMotion = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * breath.value }] }));
  const haloMotion = useAnimatedStyle(() => ({ opacity: 0.65 + 0.25 * breath.value, transform: [{ scale: 1 + 0.025 * breath.value }] }));

  return <View style={styles.stage} testID="verification-architecture" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Animated.View testID="verification-halo" style={[styles.layer, haloMotion]}>
      <Svg width="100%" height="100%" viewBox="0 0 440 360">
        <Defs>
          <RadialGradient id={glowId}>
            <Stop offset="0" stopColor={theme.colors.accent} stopOpacity="0.32" />
            <Stop offset="0.55" stopColor={theme.colors.accent2} stopOpacity="0.14" />
            <Stop offset="1" stopColor={theme.colors.accent2} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="220" cy="235" rx="213" ry="118" fill={`url(#${glowId})`} />
        <G fill="none" stroke={theme.colors.accentText}>
          <Ellipse cx="220" cy="266" rx="193" ry="64" strokeOpacity="0.08" />
          <Ellipse cx="220" cy="266" rx="162" ry="51" strokeOpacity="0.20" />
          <Ellipse cx="220" cy="266" rx="127" ry="38" strokeOpacity="0.17" strokeDasharray="3 9" />
          <Path d="M37 244 C15 268 45 301 112 316 M328 216 C386 228 414 251 409 275" strokeWidth="1.3" strokeOpacity="0.65" />
          <Path d="M24 266 H38 M402 266 H416 M220 194 V202 M220 330 V338" strokeOpacity="0.40" />
          <Path d="M62 139 V101 H98 M342 101 H378 V139" strokeOpacity="0.18" />
        </G>
        <Circle cx="39" cy="246" r="3" fill={theme.colors.electric} />
        <Circle cx="407" cy="275" r="2" fill={theme.colors.electric} />
        <Path d="M110 104 L220 42 L330 104 M220 42 V18" fill="none" stroke={theme.colors.accentText} strokeOpacity="0.11" strokeDasharray="3 8" />
        <Circle cx="220" cy="18" r="2" fill={theme.colors.accentText} opacity="0.55" />
      </Svg>
    </Animated.View>
    <Animated.View testID="verification-villa" style={[styles.layer, homeMotion]}>
      <Svg width="100%" height="100%" viewBox="0 0 440 360">
        <Defs>
          <LinearGradient id={facadeId} x1="0" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={theme.colors.bg1} /><Stop offset="1" stopColor={theme.colors.bg0} />
          </LinearGradient>
          <LinearGradient id={roofId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={theme.colors.accentText} stopOpacity="0.5" /><Stop offset="1" stopColor={theme.colors.accent2} stopOpacity="0.28" />
          </LinearGradient>
          <LinearGradient id={glassId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.colors.accentText} stopOpacity="0.55" /><Stop offset="1" stopColor={theme.colors.accent} stopOpacity="0.08" />
          </LinearGradient>
        </Defs>
        {/* A floating site plinth, two cantilevered volumes, and softly lit glazing. */}
        <Path d="M64 232 L211 150 L373 240 L227 322 Z" fill={theme.colors.overlayStrong} stroke={theme.colors.accent} strokeOpacity="0.25" />
        <Path d="M64 232 V238 L227 328 L373 247 V240 M227 322 V328" fill="none" stroke={theme.colors.accentText} strokeOpacity="0.18" />
        <Path d="M91 224 L211 157 L348 233 L227 302 Z" fill={`url(#${facadeId})`} stroke={theme.colors.accentText} strokeOpacity="0.2" />
        <Path d="M104 164 L213 103 L336 171 L227 233 Z" fill={`url(#${roofId})`} stroke={theme.colors.electric} strokeOpacity="0.65" />
        <Path d="M104 164 V229 L227 297 V233 Z" fill={`url(#${facadeId})`} stroke={theme.colors.accentText} strokeOpacity="0.5" />
        <Path d="M227 233 L336 171 V236 L227 297 Z" fill={theme.colors.bg0} stroke={theme.colors.accentText} strokeOpacity="0.40" />
        <Path d="M116 180 L175 213 V266 L116 233 Z M182 217 L214 235 V287 L182 269 Z" fill={`url(#${glassId})`} stroke={theme.colors.accentText} strokeOpacity="0.6" />
        <Path d="M131 188 V241 M146 197 V250 M161 205 V259 M198 226 V278" stroke={theme.colors.accentText} strokeOpacity="0.4" />
        <Path d="M239 237 L322 190 V232 L239 279 Z" fill={`url(#${glassId})`} stroke={theme.colors.accentText} strokeOpacity="0.55" />
        <Path d="M260 225 V268 M281 213 V255 M302 202 V243" stroke={theme.colors.accentText} strokeOpacity="0.35" />
        <Path d="M145 112 L214 73 L307 125 L239 164 Z" fill={`url(#${roofId})`} stroke={theme.colors.electric} strokeWidth="1.2" strokeOpacity="0.80" />
        <Path d="M145 112 V165 L239 217 V164 Z" fill={`url(#${facadeId})`} stroke={theme.colors.accentText} strokeOpacity="0.65" />
        <Path d="M239 164 L307 125 V179 L239 217 Z" fill={theme.colors.bg0} stroke={theme.colors.accentText} strokeOpacity="0.55" />
        <Path d="M155 132 L228 173 V204 L155 163 Z" fill={`url(#${glassId})`} stroke={theme.colors.accentText} strokeOpacity="0.7" />
        <Path d="M179 145 V176 M203 159 V190 M250 173 L294 148 V172 L250 198 Z" fill={`url(#${glassId})`} stroke={theme.colors.accentText} strokeOpacity="0.55" />
        <Path d="M145 112 L239 164 L307 125 M104 164 L136 182 M239 217 L336 162" fill="none" stroke={theme.colors.electric} strokeWidth="2" strokeOpacity="0.65" />
        <Path d="M118 234 L174 265 M241 280 L320 235" stroke={theme.colors.ember} strokeWidth="2" strokeOpacity="0.70" />
        <Path d="M93 244 L136 268 M85 249 L128 273 M77 254 L120 278" stroke={theme.colors.accentText} strokeOpacity="0.20" />
        <G fill={theme.colors.accentText}>
          <Circle cx="145" cy="112" r="2.5" /><Circle cx="307" cy="125" r="2" /><Circle cx="227" cy="297" r="2" />
        </G>
      </Svg>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  stage: { width: '100%', height: '100%' },
  layer: { ...StyleSheet.absoluteFillObject },
});
