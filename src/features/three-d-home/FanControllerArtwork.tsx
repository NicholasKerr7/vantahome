import React, { useId } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { fanControllerStyles as styles } from './FanControllerStyles';
import { useFanRotorMotion } from './useFanRotorMotion';

/** Layer a native-driver rotor over a static precision rim, avoiding repainting metalwork each frame. */
export function FanControllerArtwork({ velocity, compact, motionAllowed }: {
  velocity: number; compact: boolean; motionAllowed: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const rim = `${id}-fan-rim`;
  const blade = `${id}-fan-blade`;
  const rotorStyle = useFanRotorMotion(velocity, motionAllowed);
  return <View testID="fan-preview-model" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 200 200" aria-hidden>
      <Defs><LinearGradient id={rim} x1="10%" y1="0%" x2="95%" y2="100%">
        <Stop offset="0" stopColor="#E0D2EA" /><Stop offset="0.25" stopColor="#645173" />
        <Stop offset="0.52" stopColor="#2A2037" /><Stop offset="0.78" stopColor="#AC93C0" /><Stop offset="1" stopColor="#3B2B49" />
      </LinearGradient></Defs>
      <Circle cx={100} cy={102} r={92} fill="#09060F" />
      <Circle cx={100} cy={100} r={89} fill={`url(#${rim})`} stroke="#A18BAF" />
      <Circle cx={100} cy={100} r={81} fill="#120D1B" stroke="#35283E" strokeWidth={3} />
      <Circle cx={100} cy={100} r={75} fill="#201629" stroke="#877095" strokeWidth={0.7} />
      <Circle cx={100} cy={100} r={68} fill="none" stroke="#47334F" strokeWidth={0.7} />
      <Path d="M49 29 A86 86 0 0 1 152 29" fill="none" stroke="#E6D7F0" strokeWidth={1.5} opacity={0.7} strokeLinecap="round" />
      <Path testID="fan-preview-indicator" d="M63 175 A84 84 0 0 0 137 175" fill="none"
        stroke={velocity === 0 ? '#655174' : '#C898FA'} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
    <Animated.View testID="fan-preview-rotor" style={[styles.layer, rotorStyle]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 200 200" aria-hidden>
        <Defs><LinearGradient id={blade} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#DFD3E8" /><Stop offset="0.42" stopColor="#9A83AD" />
          <Stop offset="0.7" stopColor="#51405D" /><Stop offset="1" stopColor="#B59DCC" />
        </LinearGradient></Defs>
        {[0, 120, 240].map((angle) => <G key={angle} transform={`rotate(${angle} 100 100)`}>
          <Path d="M96 96 C75 87 64 63 76 41 C83 29 112 28 119 42 C124 53 103 59 108 75 L112 96 Z"
            fill={`url(#${blade})`} stroke="#C8B2D9" strokeWidth={0.8} />
          <Path d="M97 85 C82 66 83 46 102 37" fill="none" stroke="#EADBF3" strokeWidth={0.9} opacity={0.5} />
        </G>)}
        <Circle cx={100} cy={100} r={20} fill="#25192F" stroke="#AD93C1" strokeWidth={1.5} />
        <Circle cx={100} cy={100} r={15} fill={`url(#${blade})`} stroke="#63516F" />
        <Circle cx={100} cy={100} r={7} fill="#4B395C" stroke="#DDC5EF" strokeWidth={0.8} />
      </Svg>
    </Animated.View>
  </View>;
}
