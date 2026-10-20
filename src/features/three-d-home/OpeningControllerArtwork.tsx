import React, { useId, useMemo } from 'react';
import { Animated, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { OpeningControllerState } from '../../../packages/home-scene/src/openingController';
import { createOpeningPositionStyles, openingControllerStyles as styles } from './OpeningControllerStyles';
import { useDevicePositionMotion } from './useDevicePositionMotion';

type OpeningKind = OpeningControllerState['kind'];
interface Props { kind: OpeningKind; position: number | null; compact: boolean; motionAllowed: boolean }

/** Architectural surrounds remain still while only the authored opening mechanism moves. */
function OpeningFrame({ kind }: { kind: OpeningKind }) {
  const id = useId().replace(/:/g, '');
  const metal = `${id}-opening-frame`;
  return <Svg width="100%" height="100%" viewBox="0 0 260 210" aria-hidden>
    <Defs><LinearGradient id={metal} x1="0%" y1="0%" x2="100%" y2="90%">
      <Stop offset="0" stopColor="#CEBEDB" /><Stop offset="0.3" stopColor="#796487" />
      <Stop offset="0.7" stopColor="#31223F" /><Stop offset="1" stopColor="#B59AC9" />
    </LinearGradient></Defs>
    <Ellipse cx={130} cy={192} rx={kind === 'door' ? 79 : 114} ry={8} fill="#08050F" opacity={0.72} />
    {kind === 'door' ? <G>
      <Path d="M55 196 V8 H204 V196 L196 201 H63 Z" fill="#23172E" stroke="#594565" />
      <Rect x={65} y={11} width={130} height={183} rx={5} fill={`url(#${metal})`} />
      <Rect x={73} y={17} width={114} height={172} fill="#110A1A" stroke="#B6A0C8" />
      <Path d="M80 21 H180 V188 H80" fill="none" stroke="#352141" />
      <Path d="M65 194 H196 L209 202 H53 Z" fill="#6E5A7E" stroke="#A78CBA" />
      <Path d="M68 16 V185 M193 16 V185" stroke="#D0BADF" opacity={0.55} />
    </G> : kind === 'window' ? <G>
      <Rect x={28} y={34} width={204} height={142} rx={9} fill="#21152C" stroke="#5E4770" />
      <Rect x={36} y={40} width={188} height={129} rx={4} fill={`url(#${metal})`} />
      <Rect x={42} y={46} width={176} height={116} fill="#151021" stroke="#A18AB2" />
      <Path d="M44 120 Q88 100 133 123 T216 111 V160 H44 Z" fill="#3E2B52" />
      <Path d="M44 137 Q93 114 144 140 T216 131 V160 H44 Z" fill="#261B36" />
      <Path d="M32 172 H230 L239 181 H22 Z" fill="#7B648E" stroke="#BDA2D1" />
    </G> : <G>
      <Path d="M14 179 V24 Q14 18 20 18 H241 Q247 18 247 24 V179" fill="#2B1E37" stroke="#6A5179" />
      <Rect x={22} y={25} width={216} height={156} rx={3} fill={`url(#${metal})`} />
      <Rect x={29} y={32} width={202} height={143} fill="#100A18" stroke="#B29BC2" />
      <Path d="M35 43 H225 V174 H35 Z" fill="#1C1227" />
      <Path d="M62 174 L95 75 H165 L198 174" fill="none" stroke="#392546" opacity={0.8} />
      <Path d="M20 183 H240 L251 193 H9 Z" fill="#73607F" stroke="#A88DBB" />
      <Path d="M28 29 V176 M233 29 V176" stroke="#DAC5E7" opacity={0.5} />
    </G>}
  </Svg>;
}

/** A side-hinged teak leaf has a handle but no invented locking control or lock-state indicator. */
function DoorLeaf() {
  const id = `${useId().replace(/:/g, '')}-opening-teak`;
  return <Svg width="100%" height="100%" viewBox="0 0 114 172" preserveAspectRatio="none" aria-hidden>
    <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="20%">
      <Stop offset="0" stopColor="#7F5E66" /><Stop offset="0.5" stopColor="#4D3445" /><Stop offset="1" stopColor="#A37A80" />
    </LinearGradient></Defs>
    <Rect x={1} y={1} width={112} height={170} rx={2} fill={`url(#${id})`} stroke="#C3A1AD" />
    {[14, 29, 44, 59, 74, 89].map((x) => <G key={x}>
      <Path d={`M${x} 7 V166`} stroke="#2B1A30" opacity={0.8} />
      <Path d={`M${x + 1} 7 V166`} stroke="#D2A6AC" opacity={0.25} />
    </G>)}
    <Path d="M99 65 V107" stroke="#211828" strokeWidth={7} strokeLinecap="round" />
    <Path d="M98 65 V104" stroke="#DCC9D4" strokeWidth={3.5} strokeLinecap="round" />
    <Path d="M5 3 H108" stroke="#D3A7B1" opacity={0.6} />
  </Svg>;
}

/** The kitchen window uses a single top-hinged glazed frame, matching the existing awning geometry. */
function WindowLeaf() {
  const id = `${useId().replace(/:/g, '')}-opening-glass`;
  return <Svg width="100%" height="100%" viewBox="0 0 176 116" preserveAspectRatio="none" aria-hidden>
    <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
      <Stop offset="0" stopColor="#A997C1" stopOpacity={0.65} /><Stop offset="0.45" stopColor="#42305D" stopOpacity={0.9} />
      <Stop offset="1" stopColor="#7A568F" stopOpacity={0.75} />
    </LinearGradient></Defs>
    <Rect x={1} y={1} width={174} height={114} fill="#695478" stroke="#D0B9DE" />
    <Rect x={7} y={7} width={162} height={102} fill={`url(#${id})`} stroke="#2E213E" />
    <Path d="M10 10 H69 L20 105 H10 Z" fill="#E0D4ED" opacity={0.13} />
    <Path d="M86 6 V110" stroke="#9A81AF" strokeWidth={4} />
    <Path d="M74 106 H101" stroke="#D0BADD" strokeWidth={2.5} strokeLinecap="round" />
    <Circle cx={163} cy={10} r={1.4} fill="#DCCAE8" />
  </Svg>;
}

/** Horizontal roller slats compress upward rather than pretending to be a sectional tilt mechanism. */
function ShutterLeaf() {
  const id = `${useId().replace(/:/g, '')}-opening-shutter`;
  return <Svg width="100%" height="100%" viewBox="0 0 202 143" preserveAspectRatio="none" aria-hidden>
    <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="70%">
      <Stop offset="0" stopColor="#B5A6C5" /><Stop offset="0.45" stopColor="#796386" /><Stop offset="1" stopColor="#3E2A50" />
    </LinearGradient></Defs>
    <Rect width={202} height={143} fill={`url(#${id})`} stroke="#D0BBDD" />
    {Array.from({ length: 10 }, (_, index) => index * 14).map((y) => <G key={y}>
      <Path d={`M1 ${y + 2} H201`} stroke="#D9CBE4" opacity={0.45} />
      <Path d={`M1 ${y + 12} H201`} stroke="#34213F" strokeWidth={2} />
    </G>)}
    <Path d="M1 140 H201" stroke="#21152B" strokeWidth={4} />
  </Svg>;
}

/** Only accepted positions animate; unknown state shows an empty neutral surround instead of a closed claim. */
export function OpeningControllerArtwork({ kind, position, compact, motionAllowed }: Props) {
  const animatedPosition = useDevicePositionMotion(position, motionAllowed);
  const positionStyles = useMemo(() => createOpeningPositionStyles(animatedPosition), [animatedPosition]);
  return <View testID="opening-preview-model" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <OpeningFrame kind={kind} />
    {position === null ? <View testID="opening-preview-unknown" style={styles.unknown}><Text style={styles.unknownLabel}>—</Text></View>
      : kind === 'door' ? <Animated.View testID="opening-preview-door" style={[styles.doorLeaf, positionStyles.door]}><DoorLeaf /></Animated.View>
        : kind === 'window' ? <Animated.View testID="opening-preview-window" style={[styles.windowLeaf, positionStyles.window]}><WindowLeaf /></Animated.View>
          : <Animated.View testID="opening-preview-shutter" style={[styles.shutterLeaf, positionStyles.garage]}><ShutterLeaf /></Animated.View>}
  </View>;
}
