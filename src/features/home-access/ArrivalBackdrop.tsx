import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { theme } from '../../theme/theme';

/** A static, inexpensive violet atmosphere behind the live verification state. */
export default function ArrivalBackdrop() {
  const id = useId().replace(/:/g, '');
  return <View style={styles.backdrop} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 600 1000" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={`${id}-shade`} x1="0" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor={theme.colors.bg0} /><Stop offset="1" stopColor={theme.colors.overlayStrong} />
        </LinearGradient>
        <RadialGradient id={`${id}-light`}>
          <Stop offset="0" stopColor={theme.colors.accent2} stopOpacity="0.38" /><Stop offset="1" stopColor={theme.colors.accent2} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="600" height="1000" fill={`url(#${id}-shade)`} />
      <Ellipse cx="490" cy="240" rx="370" ry="420" fill={`url(#${id}-light)`} />
      <Ellipse cx="40" cy="870" rx="360" ry="250" fill={`url(#${id}-light)`} opacity="0.45" />
      <Path d="M-120 800 L600 80 M-120 818 L620 78 M0 1140 L720 420" stroke={theme.colors.accentText} strokeOpacity="0.035" fill="none" />
    </Svg>
  </View>;
}

const styles = StyleSheet.create({ backdrop: { ...StyleSheet.absoluteFillObject } });
