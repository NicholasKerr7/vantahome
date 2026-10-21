import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { cameraControllerStyles as styles } from './CameraControllerStyles';

/** A static architectural illustration suggests a monitor without implying a real camera location or feed. */
export function CameraControllerArtwork({ nightVision, compact }: { nightVision: boolean; compact: boolean }) {
  const identity = useId().replace(/:/g, '');
  const sky = `vision-sky-${identity}`;
  const ground = `vision-ground-${identity}`;
  const glass = `vision-glass-${identity}`;
  const accent = nightVision ? '#C2C8E0' : '#D0A1F3';
  return <View testID="camera-sample-artwork" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 320 174" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={nightVision ? '#111724' : '#211338'} />
          <Stop offset="1" stopColor={nightVision ? '#535A6D' : '#785781'} />
        </LinearGradient>
        <LinearGradient id={ground} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={nightVision ? '#394354' : '#3C3749'} />
          <Stop offset="1" stopColor="#0C111E" />
        </LinearGradient>
        <LinearGradient id={glass} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={nightVision ? '#DDE0EA' : '#F8DDAD'} stopOpacity="0.88" />
          <Stop offset="1" stopColor={nightVision ? '#717F9E' : '#B6815F'} stopOpacity="0.35" />
        </LinearGradient>
      </Defs>
      <Rect width="320" height="174" fill={`url(#${sky})`} />
      <Circle cx="267" cy="29" r="12" fill={accent} opacity="0.2" />
      <Circle cx="267" cy="29" r="5" fill="#E8DDF4" opacity="0.7" />
      <Path d="M0 85 Q35 62 73 80 T150 78 T240 72 T320 83 V174 H0Z" fill="#17202B" />
      <Path d="M0 105 L121 91 L320 115 V174 H0Z" fill={`url(#${ground})`} />
      <Path d="M181 111 L210 111 L270 174 L113 174Z" fill={nightVision ? '#6F7788' : '#77717F'} opacity="0.6" />
      <Path d="M194 122 L183 144 M201 128 L217 147 M159 158 L240 158" stroke="#C6BED4" strokeWidth="0.7" opacity="0.25" />
      <Ellipse cx="166" cy="119" rx="83" ry="12" fill="#050810" opacity="0.45" />
      <Path d="M87 69 L187 59 L240 79 L141 92Z" fill="#5F5A70" />
      <Path d="M87 69 L141 92 V127 L87 106Z" fill={nightVision ? '#8D96A5' : '#B0A8B6'} />
      <Path d="M141 92 L240 79 V114 L141 127Z" fill={nightVision ? '#747F91' : '#827A92'} />
      <Path d="M119 39 L185 33 L225 48 L160 57Z" fill="#40394E" />
      <Path d="M119 39 L160 57 V91 L119 75Z" fill={nightVision ? '#B7BECA' : '#D4C4D1'} />
      <Path d="M160 57 L225 48 V81 L160 91Z" fill={nightVision ? '#858FA0' : '#968CA4'} />
      <Path d="M128 50 L151 59 V78 L128 69Z M170 62 L194 59 V78 L170 81Z M201 58 L217 56 V75 L201 77Z M151 99 L176 95 V117 L151 121Z M209 91 L232 88 V106 L209 109Z" fill={`url(#${glass})`} />
      <Path d="M183 94 L201 92 V115 L183 118Z" fill="#151623" />
      <Path d="M89 69 L141 89 L241 77 M118 38 L160 54 L226 46" fill="none" stroke="#DDD0E6" strokeWidth="2" opacity="0.7" />
      <G stroke={nightVision ? '#8D96AA' : '#A79CBA'} strokeWidth="1">
        <Path d="M31 125 L115 143 M229 144 L296 128 M31 122 V143 M48 126 V145 M64 130 V149 M81 134 V152 M98 138 V156 M115 142 V160 M229 143 V160 M246 139 V156 M262 135 V152 M279 131 V148 M296 127 V144" />
      </G>
      <Path d="M29 124 L115 143 M229 144 L298 127" stroke={accent} strokeWidth="2" opacity="0.6" />
      <G fill="#151C28" stroke="#222D38" strokeWidth="2">
        <Path d="M52 113 Q57 78 55 55 M57 62 Q39 42 22 56 Q42 48 56 64 M56 62 Q67 37 87 45 Q69 45 56 64 M56 61 Q32 58 31 74 Q43 61 56 64 M57 62 Q80 55 87 70 Q71 61 57 64" />
        <Path d="M272 115 Q266 88 268 72 M268 77 Q255 60 241 70 Q255 66 268 79 M268 77 Q280 59 295 65 Q282 65 268 79 M268 77 Q289 75 295 86 Q281 79 268 79" />
      </G>
      <G fill={accent} opacity="0.7"><Circle cx="32" cy="131" r="1.5" /><Circle cx="112" cy="150" r="1.5" /><Circle cx="233" cy="150" r="1.5" /><Circle cx="295" cy="135" r="1.5" /></G>
      <G fill="none" stroke={accent} strokeWidth="1" opacity="0.65">
        <Path d="M12 30 V12 H30 M290 12 H308 V30 M12 144 V162 H30 M290 162 H308 V144" />
      </G>
    </Svg>
  </View>;
}
