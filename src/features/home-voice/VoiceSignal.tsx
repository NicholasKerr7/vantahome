import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useDecorativeMotion } from '../../components/useDecorativeMotion';
import { theme } from '../../theme/theme';

/** Visualize the actual listening state without implying measured microphone amplitude. */
export default function VoiceSignal({ listening }: { listening: boolean }) {
  const motionAllowed = useDecorativeMotion(listening);
  const pulse = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = 0;
    if (motionAllowed) pulse.value = withRepeat(withTiming(1, {
      duration: 1600, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never,
    }), -1, true, undefined, ReduceMotion.Never);
    return () => cancelAnimation(pulse);
  }, [motionAllowed, pulse]);
  const signalStyle = useAnimatedStyle(() => ({ opacity: 0.65 + pulse.value * 0.35, transform: [{ scale: 1 + pulse.value * 0.1 }] }));
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.wrap}>
    <Animated.View style={[styles.orb, signalStyle]}>
      <Svg width="88" height="88" viewBox="0 0 88 88">
        <Circle cx="44" cy="44" r="41" fill="none" stroke={theme.colors.accent} strokeOpacity="0.16" />
        <Circle cx="44" cy="44" r="33" fill={theme.colors.accent2} fillOpacity="0.45" stroke={theme.colors.accent} strokeOpacity="0.35" />
        <Path d="M22 44 L29 44 L33 34 L38 55 L43 25 L48 63 L53 36 L58 48 L62 44 L66 44" fill="none" stroke={theme.colors.accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({ wrap: { alignItems: 'center', justifyContent: 'center', height: 98 }, orb: { width: 88, height: 88 } });
