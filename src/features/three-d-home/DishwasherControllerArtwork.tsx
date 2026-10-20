import React, { useId } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { dishwasherControllerStyles as styles } from './DishwasherControllerStyles';
import { useDeviceRotorMotion } from './useDeviceRotorMotion';

interface Props { running: boolean; compact: boolean; motionAllowed: boolean }

/** A rectangular cutaway suggests racks and dishes without claiming a real open door or wash phase. */
export function DishwasherControllerArtwork({ running, compact, motionAllowed }: Props) {
  const id = useId().replace(/:/g, '');
  const metal = `${id}-dishwasher-metal`;
  const chamber = `${id}-dishwasher-chamber`;
  const glass = `${id}-dishwasher-glass`;
  const sprayStyle = useDeviceRotorMotion(running ? 0.8 : 0, motionAllowed);
  return <View testID="dishwasher-preview-model" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 260 200" aria-hidden>
      <Defs>
        <LinearGradient id={metal} x1="0%" y1="0%" x2="100%" y2="95%">
          <Stop offset="0" stopColor="#D2C6DC" /><Stop offset="0.18" stopColor="#887494" />
          <Stop offset="0.46" stopColor="#34283F" /><Stop offset="0.83" stopColor="#51405D" /><Stop offset="1" stopColor="#B69AC9" />
        </LinearGradient>
        <LinearGradient id={chamber} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor="#0C0814" /><Stop offset="0.55" stopColor="#31233E" /><Stop offset="1" stopColor="#574163" />
        </LinearGradient>

      </Defs>
      <Ellipse cx={130} cy={190} rx={109} ry={7} fill="#08050F" opacity={0.7} />
      <Rect x={18} y={7} width={224} height={183} rx={15} fill={`url(#${metal})`} stroke="#AA91BB" />
      <Path d="M32 12 H226 Q237 12 237 24" fill="none" stroke="#E2D3EC" opacity={0.7} />
      <Rect x={28} y={16} width={204} height={19} rx={6} fill="#271C32" stroke="#594367" />
      <Path d="M91 24 H166" stroke="#9D82B0" strokeWidth={3} strokeLinecap="round" />
      <Circle testID="dishwasher-preview-indicator" cx={217} cy={25} r={2.2} fill={running ? '#D5B0FF' : '#64516F'} />
      <Rect x={29} y={42} width={202} height={134} rx={9} fill={`url(#${chamber})`} stroke="#9D85AE" />
      <Path d="M36 49 L48 61 H211 L224 49 M36 168 L48 151 H211 L224 168" fill="none" stroke="#81698E" strokeWidth={1.3} opacity={0.6} />
      <G fill="#B8A5C6" stroke="#DFCEE9" strokeWidth={0.8}>
        {[62, 87, 112, 147, 172, 197].map((x) => <Path key={x} d={`M${x - 7} 60 L${x - 5} 79 Q${x} 83 ${x + 5} 79 L${x + 7} 60 Z`} opacity={0.65} />)}
      </G>
      <Path d="M45 83 H215 M45 88 H215 M48 79 V91 M76 79 V91 M103 79 V91 M130 79 V91 M157 79 V91 M184 79 V91 M212 79 V91" stroke="#A28AAE" fill="none" strokeWidth={1.3} />
      {[60, 86, 112, 138, 164, 190].map((x) => <G key={x}>
        <Ellipse cx={x} cy={119} rx={12} ry={24} fill="#90819F" stroke="#D6C6E2" />
        <Ellipse cx={x} cy={119} rx={8} ry={18} fill="#4C3C5B" stroke="#B4A0C4" opacity={0.85} />
        <Path d={`M${x - 3} 102 Q${x - 8} 118 ${x - 3} 135`} fill="none" stroke="#E7D9EF" opacity={0.4} />
      </G>)}
      <Path d="M44 142 H215 M44 147 H215 M47 137 V150 M74 137 V150 M101 137 V150 M128 137 V150 M155 137 V150 M182 137 V150 M212 137 V150" stroke="#B6A0C4" strokeWidth={1.4} fill="none" />
      <G testID="dishwasher-preview-spray" opacity={running ? 0.45 : 0} stroke="#CCA8ED" strokeWidth={0.8} fill="none" strokeLinecap="round">
        <Path d="M92 153 Q80 127 75 99 M116 153 Q107 120 111 96 M145 153 Q154 119 151 95 M169 153 Q184 124 187 102" strokeDasharray="2 6" />
      </G>
      <Path d="M45 181 H215" stroke="#23172D" strokeWidth={3} strokeLinecap="round" />
    </Svg>
    <View pointerEvents="none" style={[styles.sprayPlane, compact && styles.sprayPlaneCompact]}>
      <Animated.View testID="dishwasher-preview-spray-arm" style={[styles.layer, sprayStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden>
          <Path d="M7 46 Q50 35 93 46 L93 54 Q50 65 7 54 Z" fill="#BCA7CA" stroke="#E2D2ED" strokeWidth={1.5} />
          {[18, 31, 69, 82].map((x) => <Circle key={x} cx={x} cy={50} r={2} fill="#3A2848" />)}
          <Circle cx={50} cy={50} r={10} fill="#746080" stroke="#D6BDE7" />
          <Circle cx={50} cy={50} r={4} fill="#2B1B36" />
        </Svg>
      </Animated.View>
    </View>
    <Svg width="100%" height="100%" viewBox="0 0 260 200" style={styles.layer} aria-hidden>
      <Defs>
        <LinearGradient id={glass} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#E1CCF1" stopOpacity={0.16} /><Stop offset="0.45" stopColor="#D9B4F3" stopOpacity={0.015} />
          <Stop offset="1" stopColor="#A481C5" stopOpacity={0.12} />
        </LinearGradient>
      </Defs>
      <Rect x={29} y={42} width={202} height={134} rx={9} fill={`url(#${glass})`} />
      <Path d="M35 49 H91 L45 170 H35 Z" fill="#F1E6F7" opacity={0.035} />
      <Path d="M31 51 V164" stroke="#E5D0F1" opacity={0.35} />
    </Svg>
  </View>;
}
