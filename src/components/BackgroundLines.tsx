import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Subtle SVG curves used as a low-contrast background texture.
 * `pointerEvents="none"` keeps it from blocking taps/gestures.
 */
export default function BackgroundLines() {
  const { width, height } = useWindowDimensions();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={`M ${-40} ${height * 0.15}
              C ${width * 0.25} ${height * 0.05}, ${width * 0.45} ${height * 0.35}, ${width * 0.85} ${height * 0.18}
              S ${width * 1.15} ${height * 0.08}, ${width * 1.25} ${height * 0.32}`}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={2}
          fill="none"
        />
        <Path
          d={`M ${-60} ${height * 0.45}
              C ${width * 0.22} ${height * 0.28}, ${width * 0.55} ${height * 0.70}, ${width * 1.08} ${height * 0.48}`}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={2}
          fill="none"
        />
        <Path
          d={`M ${-30} ${height * 0.72}
              C ${width * 0.25} ${height * 0.62}, ${width * 0.55} ${height * 0.92}, ${width * 1.12} ${height * 0.74}`}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={2}
          fill="none"
        />
        <Path
          d={`M ${width * 0.12} ${-20}
              C ${width * 0.02} ${height * 0.22}, ${width * 0.22} ${height * 0.30}, ${width * 0.10} ${height * 0.55}
              S ${width * 0.05} ${height * 0.85}, ${width * 0.22} ${height + 40}`}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1.5}
          fill="none"
        />
      </Svg>
    </View>
  );
}
