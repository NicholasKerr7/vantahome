import React, { useId } from 'react';
import { Animated, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Pattern, Stop } from 'react-native-svg';
import type { LaundryKind } from '../../../packages/home-scene/src/laundryController';
import { laundryControllerStyles as styles } from './LaundryControllerStyles';
import { useDeviceRotorMotion } from './useDeviceRotorMotion';

interface Props {
  kind: LaundryKind; running: boolean; installation: 'stacked' | 'single'; compact: boolean; motionAllowed: boolean;
}

/** The authored installation diagram locates the selection without exposing its partner's state. */
function LaundryStation({ kind }: { kind: LaundryKind }) {
  return <View testID="laundry-stack-position" accessible
    accessibilityLabel={`Stacked installation. ${kind === 'washer' ? 'Washer selected below dryer' : 'Dryer selected above washer'}`} style={styles.station}>
    <Text style={styles.stationCaption}>YOUR STACK</Text>
    {(['dryer', 'washer'] as const).map((machine) => <View key={machine}
      style={[styles.stationMachine, kind === machine && styles.stationSelected]}>
      <Svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
        <Circle cx={12} cy={12} r={10} fill="#17101F" stroke={kind === machine ? '#C8A0F5' : '#675674'} />
        <Circle cx={12} cy={12} r={7} fill="#2B2036" stroke="#78638A" />
      </Svg>
      <Text style={[styles.stationLabel, kind === machine && styles.stationLabelSelected]}>{machine === 'dryer' ? 'Dryer · upper' : 'Washer · lower'}</Text>
    </View>)}
  </View>;
}

/** A lightweight sculpted drum uses a slow decorative rotation, independent of the saved spin setting. */
export function LaundryControllerArtwork({ kind, running, installation, compact, motionAllowed }: Props) {
  const id = useId().replace(/:/g, '');
  const metal = `${id}-laundry-metal`;
  const interior = `${id}-laundry-interior`;
  const perforations = `${id}-laundry-perforations`;
  const drumStyle = useDeviceRotorMotion(running ? 1.1 : 0, motionAllowed);
  return <View style={[styles.instrument, compact && styles.instrumentCompact]}>
    <View testID="laundry-preview-model" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.artwork, compact && styles.artworkCompact]}>
      <Svg width="100%" height="100%" viewBox="0 0 200 200" aria-hidden>
        <Defs>
          <LinearGradient id={metal} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor="#D6CDDF" /><Stop offset="0.22" stopColor="#91829F" />
            <Stop offset="0.5" stopColor="#30273B" /><Stop offset="0.8" stopColor="#655570" /><Stop offset="1" stopColor="#BB9FD0" />
          </LinearGradient>
          <LinearGradient id={interior} x1="15%" y1="0%" x2="85%" y2="100%">
            <Stop offset="0" stopColor="#786E86" /><Stop offset="0.5" stopColor="#383040" /><Stop offset="1" stopColor="#15101D" />
          </LinearGradient>
          <Pattern id={perforations} patternUnits="userSpaceOnUse" width={7} height={7}>
            <Circle cx={2} cy={2} r={1.2} fill="#06040B" opacity={0.7} />
            <Circle cx={2} cy={3} r={0.7} fill="#B2A1C1" opacity={0.28} />
          </Pattern>
        </Defs>
        <Circle cx={100} cy={103} r={91} fill="#08050F" opacity={0.8} />
        <Circle cx={100} cy={100} r={88} fill={`url(#${metal})`} stroke="#BBA6CA" />
        <Circle cx={100} cy={100} r={79} fill="#15101D" stroke="#887395" strokeWidth={2} />
        <Circle cx={100} cy={100} r={72} fill={`url(#${interior})`} stroke="#B2A1C1" strokeWidth={0.8} />
        <Circle cx={100} cy={100} r={64} fill={`url(#${perforations})`} />
        <Circle cx={100} cy={100} r={57} fill="none" stroke="#80718C" opacity={0.5} />
        <Path d="M37 49 A82 82 0 0 1 148 31" fill="none" stroke="#E7DCEF" strokeWidth={1.2} opacity={0.75} />
        <Path d="M177 75 Q186 100 177 125" fill="none" stroke="#2D2237" strokeWidth={7} strokeLinecap="round" />
        <Path d="M179 76 Q186 100 179 124" fill="none" stroke="#A28AAC" strokeWidth={2} strokeLinecap="round" />
      </Svg>
      <Animated.View testID="laundry-preview-drum" pointerEvents="none" style={[styles.layer, drumStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 200 200" aria-hidden>
          {[0, 120, 240].map((angle) => <G key={angle} transform={`rotate(${angle} 100 100)`}>
            <Path d="M94 81 L89 43 Q100 37 111 43 L106 81 Z" fill="#92849F" stroke="#45384F" />
            <Path d="M98 77 L98 46" stroke="#D6C7E2" strokeWidth={1.3} opacity={0.7} />
          </G>)}
          <Circle cx={100} cy={100} r={16} fill="#413449" stroke="#9E8BAF" />
          <Circle cx={100} cy={100} r={9} fill="#241A2F" stroke="#695674" />
        </Svg>
      </Animated.View>
      <Svg width="100%" height="100%" viewBox="0 0 200 200" style={styles.layer} aria-hidden>
        <Ellipse cx={79} cy={66} rx={39} ry={16} fill="#DDCEE7" opacity={0.07} transform="rotate(-30 79 66)" />
        <Path testID="laundry-preview-indicator" d="M55 168 Q100 194 145 168" fill="none" stroke={running ? '#C8A0F5' : '#66516F'} strokeWidth={2.5} strokeLinecap="round" />
      </Svg>
    </View>
    {installation === 'stacked' && <LaundryStation kind={kind} />}
  </View>;
}
