import React from "react";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
  Rect,
  Circle,
} from "react-native-svg";

export default function VantaHomeMark({ size = 220 }: { size?: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 220 220">
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B9A6FF" />
          <Stop offset="0.5" stopColor="#7A5CFF" />
          <Stop offset="1" stopColor="#2B0A73" />
        </LinearGradient>
        <LinearGradient id="inner" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.06" />
        </LinearGradient>
        <LinearGradient id="roof" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#D8CBFF" />
        </LinearGradient>
        <LinearGradient id="base" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#C7B3FF" />
        </LinearGradient>
      </Defs>

      <Rect x="26" y="26" width="168" height="168" rx="48" fill="url(#bg)" />
      <Rect
        x="40"
        y="40"
        width="140"
        height="140"
        rx="40"
        fill="url(#inner)"
        stroke="rgba(255,255,255,0.35)"
      />

      <Path
        d="M 66 118 L 110 74 L 154 118 L 138 118 L 110 90 L 82 118 Z"
        fill="url(#roof)"
      />
      <Rect x="80" y="118" width="60" height="58" rx="16" fill="url(#base)" />

      <Circle cx="110" cy="146" r="8" fill="#6B3CFF" />
      <Rect
        x="104"
        y="134"
        width="12"
        height="24"
        rx="5"
        fill="#FFFFFF"
        opacity="0.92"
      />

      <Path
        d="M 88 64 C 101 50 119 50 132 64"
        stroke="rgba(255,255,255,0.8)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M 96 56 C 104 48 116 48 124 56"
        stroke="rgba(255,255,255,0.95)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
