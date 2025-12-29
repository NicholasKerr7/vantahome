import React, { useEffect, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { theme } from "../theme/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Minimal AC temperature dial:
 * - Draws an arc path (SVG)
 * - Uses a pan gesture to convert touch angle → temperature value
 * - Animates the knob position using Reanimated shared values
 *
 * Note: This uses the new RNGH Gesture API (GestureDetector) so it stays
 * compatible with newer Reanimated/RNGH versions.
 */
function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  "worklet";
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startRad: number,
  endRad: number,
) {
  "worklet";
  const start = polarToCartesian(cx, cy, r, startRad);
  const end = polarToCartesian(cx, cy, r, endRad);
  const largeArc = Math.abs(endRad - startRad) <= Math.PI ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const clamp01 = (t: number) => clamp(t, 0, 1);

export default function RadialDial({
  value,
  min = 15,
  max = 28,
  onChange,
  centerValue,
  centerLabel = "Room Temperature",
  dimmed = false,
  tickValues,
  formatValue,
  formatCenterValue,
  formatTick,
  size = 280,
  centerIcon,
  centerContent,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  centerValue?: number;
  centerLabel?: string;
  dimmed?: boolean;
  tickValues?: number[];
  formatValue?: (value: number) => string;
  formatCenterValue?: (value: number) => string;
  formatTick?: (value: number) => string;
  size?: number;
  centerIcon?: React.ReactNode;
  centerContent?: React.ReactNode;
}) {
  const dialSize = size;
  const bubbleSize = Math.max(22, dialSize * 0.095);
  const bubbleHaloOuter = bubbleSize * 0.52;
  const bubbleHaloInner = bubbleSize * 0.38;
  const centerSize = Math.max(140, dialSize * 0.66);
  const trackWidth = Math.max(20, dialSize * 0.1);
  const innerTrackWidth = Math.max(16, dialSize * 0.0714);
  const centerFont = Math.max(32, dialSize * 0.157);
  const subFont = Math.max(11, dialSize * 0.043);
  const tickFont = Math.max(11, dialSize * 0.043);
  const centerContentScale = centerContent
    ? Math.min(1, centerSize / (dialSize * 0.79))
    : 1;

  const cx = dialSize / 2;
  const cy = dialSize / 2;
  const r = dialSize * 0.39;

  // Dial sweep similar to the reference UI:
  // from ~150° (lower-left) to ~30° (lower-right), leaving a bottom gap.
  const start = (Math.PI * 5) / 6; // 150°
  const sweep = (Math.PI * 4) / 3; // 240°
  const end = start + sweep;

  const tFromValue = (v: number) => (v - min) / (max - min);
  const valueFromT = (t: number) => Math.round(min + t * (max - min));

  // Parameter along the arc in [0..1]. Keeping it as a shared value means the
  // knob can move without causing React re-renders.
  const knobT = useSharedValue(tFromValue(value));
  const lastSent = useSharedValue(value);
  const knobScale = useSharedValue(1);

  useEffect(() => {
    knobT.value = clamp01(tFromValue(value));
    lastSent.value = value;
  }, [value, min, max]);

  const baseArc = useMemo(
    () => arcPath(cx, cy, r, start, end),
    [cx, cy, r, start, end],
  );

  const haptic = () => Haptics.selectionAsync().catch(() => {});

  const updateFromPoint = (x: number, y: number) => {
    "worklet";
    const dx = x - cx;
    const dy = y - cy;
    const ang = Math.atan2(dy, dx); // -pi..pi

    // Normalize angle onto the dial’s sweep in the positive direction.
    const TWO_PI = Math.PI * 2;
    const a = (ang + TWO_PI) % TWO_PI;
    const s = (start + TWO_PI) % TWO_PI;

    const dist = (a - s + TWO_PI) % TWO_PI;
    const norm = clamp01(dist / sweep);

    knobT.value = norm;

    const next = valueFromT(norm);
    if (next !== lastSent.value) {
      lastSent.value = next;
      runOnJS(onChange)(next);
      runOnJS(haptic)();
    }
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      knobScale.value = withTiming(1.12, { duration: 120 });
      updateFromPoint(e.x, e.y);
    })
    .onUpdate((e) => updateFromPoint(e.x, e.y))
    .onFinalize(() => {
      knobScale.value = withTiming(1, { duration: 160 });
    });

  const tap = Gesture.Tap()
    .onStart((e) => {
      knobScale.value = withTiming(1.12, { duration: 120 });
      updateFromPoint(e.x, e.y);
    })
    .onFinalize(() => {
      knobScale.value = withTiming(1, { duration: 160 });
    });

  const gesture = Gesture.Simultaneous(pan, tap);

  const knobPos = useAnimatedProps(() => {
    const angle = start + sweep * knobT.value;
    const p = polarToCartesian(cx, cy, r, angle);
    return { cx: p.x, cy: p.y };
  });

  const progressArcProps = useAnimatedProps(() => {
    const endAngle = start + sweep * knobT.value;
    return { d: arcPath(cx, cy, r, start, endAngle) };
  });

  const bubbleCenterR = r + innerTrackWidth * 0.25;
  const bubbleStyle = useAnimatedStyle(() => {
    const angle = start + sweep * knobT.value;
    const p = polarToCartesian(cx, cy, bubbleCenterR, angle);
    const scale = knobScale.value;
    return {
      transform: [
        { scale },
        { translateX: p.x - (bubbleSize * scale) / 2 },
        { translateY: p.y - (bubbleSize * scale) / 2 },
      ],
    };
  });

  const bubbleHaloPos = useAnimatedProps(() => {
    const angle = start + sweep * knobT.value;
    const p = polarToCartesian(cx, cy, bubbleCenterR, angle);
    return { cx: p.x, cy: p.y };
  });

  const ticks = useMemo(() => {
    const candidates =
      tickValues?.length && tickValues.length > 0
        ? tickValues
        : // Matches the reference UI for the default 15..28 range.
          [min, min + 3, min + 5, max - 3, max];
    const uniq = Array.from(
      new Set(candidates.map((n) => Math.round(n))),
    ).filter((n) => n >= min && n <= max);
    return uniq.map((v) => {
      const t = clamp01(tFromValue(v));
      const angle = start + sweep * t;
      const p = polarToCartesian(cx, cy, r + 6, angle);
      return { v, x: p.x, y: p.y };
    });
  }, [min, max, tickValues]);

  const centerTemp = centerValue ?? value;

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={gesture}>
        <View style={{ width: dialSize, height: dialSize }}>
          <Svg width={dialSize} height={dialSize}>
            <Defs>
              <SvgLinearGradient
                id="arc"
                x1="0"
                y1="0"
                x2={String(dialSize)}
                y2={String(dialSize)}
              >
                <Stop offset="0" stopColor="rgba(180,107,255,0.20)" />
                <Stop offset="1" stopColor="rgba(122,92,255,0.65)" />
              </SvgLinearGradient>
            </Defs>

            {/* labels */}
            {ticks.map((t) => (
              <SvgText
                key={t.v}
                x={t.x}
                y={t.y}
                fontSize={tickFont}
                fontWeight="700"
                fill="rgba(12,12,18,0.30)"
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {formatTick ? formatTick(t.v) : `${t.v}°`}
              </SvgText>
            ))}

            {/* base track */}
            <Path
              d={baseArc}
              stroke="rgba(255,255,255,0.36)"
              strokeWidth={trackWidth}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d={baseArc}
              stroke="rgba(255,255,255,0.72)"
              strokeWidth={innerTrackWidth}
              strokeLinecap="round"
              fill="none"
            />
            {/* progress */}
            <AnimatedPath
              animatedProps={progressArcProps as any}
              stroke="url(#arc)"
              strokeWidth={innerTrackWidth}
              strokeLinecap="round"
              fill="none"
              opacity={dimmed ? 0.35 : 1}
            />

            {/* halo behind the knob bubble */}
            <AnimatedCircle
              animatedProps={bubbleHaloPos as any}
              r={bubbleHaloOuter}
              fill="rgba(122,92,255,0.10)"
              opacity={dimmed ? 0.35 : 1}
            />
            <AnimatedCircle
              animatedProps={bubbleHaloPos as any}
              r={bubbleHaloInner}
              fill="rgba(255,255,255,0.58)"
              stroke="rgba(0,0,0,0.05)"
              strokeWidth={1}
              opacity={dimmed ? 0.35 : 1}
            />
          </Svg>

          {/* knob bubble */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.bubble,
              {
                width: bubbleSize,
                height: bubbleSize,
                borderRadius: bubbleSize / 2,
              },
              bubbleStyle,
              dimmed && { opacity: 0.5 },
            ]}
          >
            <LinearGradient
              colors={[theme.colors.accent2, theme.colors.accent]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubbleInner, { borderRadius: bubbleSize / 2 }]}
            />
          </Animated.View>

          {/* center */}
          <View pointerEvents="none" style={styles.center}>
            {centerContent ? (
              <View
                style={{
                  width: centerSize,
                  height: centerSize,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={
                    centerContentScale < 1
                      ? { transform: [{ scale: centerContentScale }] }
                      : undefined
                  }
                >
                  {centerContent}
                </View>
              </View>
            ) : (
              <LinearGradient
                colors={[
                  "rgba(255,255,255,0.94)",
                  "rgba(246,238,255,0.86)",
                  "rgba(240,232,255,0.80)",
                ]}
                start={{ x: 0.2, y: 0.2 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.centerDisc,
                  {
                    width: centerSize,
                    height: centerSize,
                    borderRadius: centerSize / 2,
                  },
                ]}
              >
                {centerIcon === undefined ? (
                  <View style={styles.acIcon}>
                    <View style={styles.acUnit}>
                      <View style={styles.acUnitTopSlot} />
                      <View style={styles.acUnitBar} />
                    </View>
                    <View style={styles.acFlow}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <View key={i} style={styles.acFlowLine} />
                      ))}
                    </View>
                  </View>
                ) : (
                  centerIcon
                )}

                <Text
                  style={[
                    styles.big,
                    { fontSize: centerFont },
                    dimmed && { opacity: 0.55 },
                  ]}
                >
                  {formatCenterValue
                    ? formatCenterValue(centerTemp)
                    : `${centerTemp}°C`}
                </Text>
                <Text
                  style={[
                    styles.sub,
                    { fontSize: subFont },
                    dimmed && { opacity: 0.55 },
                  ]}
                >
                  {centerLabel}
                </Text>
              </LinearGradient>
            )}
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", marginTop: 8 },
  center: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  centerDisc: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    shadowColor: "rgba(0,0,0,0.10)",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  big: {
    color: "rgba(12,12,18,0.92)",
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 6,
  },
  sub: { color: "rgba(12,12,18,0.48)", fontWeight: "800", marginTop: 6 },

  bubble: {
    position: "absolute",
    shadowColor: "rgba(122,92,255,0.65)",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  bubbleInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  acIcon: { width: 54, alignItems: "center", marginBottom: 4 },
  acUnit: {
    width: 46,
    height: 20,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  acUnitTopSlot: {
    position: "absolute",
    top: 5,
    width: 14,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(12,12,18,0.28)",
  },
  acUnitBar: {
    position: "absolute",
    bottom: 5,
    width: 16,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(122,92,255,0.70)",
  },
  acFlow: { flexDirection: "row", gap: 5, marginTop: 6 },
  acFlowLine: {
    width: 2,
    height: 6,
    borderRadius: 2,
    backgroundColor: "rgba(122,92,255,0.70)",
  },
});
