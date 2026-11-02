import React, { useId } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

/** A still circuit sculpture suggests observation without inventing a health score or running an idle animation. */
export function HealthPulseArtwork({ examples }: { examples: boolean }) {
  const id = `health-${useId().replace(/:/g, '')}`;
  return <Svg width="100%" height="100%" viewBox="0 0 180 180" aria-hidden>
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#E3C8FF" /><Stop offset="0.5" stopColor="#A161F5" /><Stop offset="1" stopColor="#493078" /></LinearGradient></Defs>
    <Circle cx={90} cy={90} r={83} stroke="#544269" strokeWidth={0.6} fill="none" />
    <Circle cx={90} cy={90} r={72} stroke="#6C478F" strokeWidth={1} strokeDasharray="3 8" fill="none" />
    <Circle cx={90} cy={90} r={60} stroke={`url(#${id})`} strokeWidth={2} fill="#241733" />
    <Circle cx={90} cy={90} r={53} stroke="#4F385F" strokeWidth={1} fill="#160D25" />
    <Path d="M58 83 L90 57 L122 83 V116 H101 V96 H80 V116 H58 Z" fill="#30203F" stroke={`url(#${id})`} strokeWidth={2.5} strokeLinejoin="round" />
    <Path d="M42 90 H57 M123 90 H138 M90 27 V44 M90 132 V153" stroke="#AD77DD" strokeWidth={1.5} />
    <G fill={examples ? '#EFD391' : '#C59CF0'} stroke="#30203F" strokeWidth={3}>
      <Circle cx={90} cy={17} r={6} /><Circle cx={163} cy={90} r={6} /><Circle cx={90} cy={163} r={6} /><Circle cx={17} cy={90} r={6} />
    </G>
    <Path d="M72 81 H83 L88 73 L96 88 L101 81 H111" stroke="#DFC4FF" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
