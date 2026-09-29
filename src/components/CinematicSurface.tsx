import React, { useEffect, type PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { theme } from '../theme/theme';
import { useDecorativeMotion } from './useDecorativeMotion';

type Props = PropsWithChildren<{ variant?: 'quiet' | 'orbit'; active?: boolean; style?: StyleProp<ViewStyle> }>;

/** Animate only a visible orbital layer; static screens allocate no motion subscriptions. */
function MovingLight({ children }: PropsWithChildren) {
  const motionAllowed = useDecorativeMotion(true);
  const drift = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(drift);
    drift.value = 0;
    if (motionAllowed) drift.value = withRepeat(withTiming(1, {
      duration: 16000, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never,
    }), -1, true, undefined, ReduceMotion.Never);
    return () => cancelAnimation(drift);
  }, [drift, motionAllowed]);
  const atmosphereStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${drift.value * 9 - 4}deg` }, { scale: 1 + drift.value * 0.045 }],
    opacity: 0.68 + drift.value * 0.18,
  }));
  return <Animated.View style={[styles.light, atmosphereStyle]}>{children}</Animated.View>;
}

/** Keep retained screens visually atmospheric without background animation work. */
function StillLight({ children }: PropsWithChildren) {
  return <View style={[styles.light, styles.quiet]}>{children}</View>;
}

/** Paint the shared ambient stage beneath content without receiving pointer input. */
export default function CinematicSurface({ children, variant = 'quiet', active = false, style }: Props) {
  const Light = active && variant === 'orbit' ? MovingLight : StillLight;
  return <View style={[styles.surface, style]}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.atmosphere}>
      <Light>
        <Svg width="100%" height="100%" viewBox="0 0 600 700" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <RadialGradient id="ambient-violet"><Stop offset="0" stopColor={theme.colors.accent} stopOpacity="0.48" /><Stop offset="1" stopColor={theme.colors.accent} stopOpacity="0" /></RadialGradient>
            <RadialGradient id="ambient-purple"><Stop offset="0" stopColor={theme.colors.bg1} stopOpacity="0.38" /><Stop offset="1" stopColor={theme.colors.bg1} stopOpacity="0" /></RadialGradient>
          </Defs>
          <Ellipse cx="530" cy="160" rx="350" ry="360" fill="url(#ambient-violet)" />
          <Ellipse cx="50" cy="660" rx="350" ry="320" fill="url(#ambient-purple)" />
          <G fill="none" stroke={theme.colors.accent} strokeOpacity="0.09">
            <Circle cx="510" cy="135" r="140" /><Circle cx="510" cy="135" r="194" /><Circle cx="510" cy="135" r="260" />
            <Path d="M0 560 Q250 430 600 540 M0 576 Q250 446 600 556" />
          </G>
          <Circle cx="340" cy="228" r="3" fill={theme.colors.accent} opacity="0.35" />
          <Circle cx="125" cy="502" r="2" fill={theme.colors.electric} opacity="0.4" />
        </Svg>
      </Light>
    </View>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  surface: { position: 'relative', overflow: 'hidden', backgroundColor: theme.colors.bg0 },
  quiet: { opacity: 0.42 },
  atmosphere: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  light: { position: 'absolute', top: -40, bottom: -40, left: -40, right: -40 },
});
