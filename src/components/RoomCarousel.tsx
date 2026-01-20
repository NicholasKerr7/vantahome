import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "./Pressable";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme/theme";
import type { Device, Room } from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import DeviceIcon from "./DeviceIcon";

// Optional: whole-home card (kept from your version)
const WHOLE_HOME_ID = "whole-home";
const WHOLE_HOME_ROOM: Room = { id: WHOLE_HOME_ID, name: "Whole Home" };

const ACTIVE_GRADIENT: [string, string, string] = [
  "#FFFFFF",
  "rgba(249,244,255,0.98)",
  "rgba(236,226,255,0.95)",
];
const ACTIVE_GRADIENT_TABLET: [string, string, string] = [
  "#FFFFFF",
  "rgba(242,247,255,0.98)",
  "rgba(230,236,255,0.95)",
];
const STACKED_GRADIENT: [string, string, string] = [
  "rgba(255,255,255,0.92)",
  "rgba(250,244,255,0.84)",
  "rgba(240,232,255,0.78)",
];
const STACKED_GRADIENT_TABLET: [string, string, string] = [
  "rgba(255,255,255,0.86)",
  "rgba(246,242,255,0.82)",
  "rgba(236,232,255,0.76)",
];
const CARD_BORDER = "rgba(214,204,255,0.6)";
const CARD_BORDER_TABLET = "rgba(190,210,255,0.55)";
const CARD_SHADOW = "rgba(120,80,200,0.28)";
const CARD_SHADOW_TABLET = "rgba(120,140,255,0.28)";
const STACK_BORDER = "rgba(210,200,255,0.45)";
const STACK_BORDER_TABLET = "rgba(196,212,255,0.4)";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mapDeck(value: number, keys: number[], vals: number[]) {
  const idx = keys.indexOf(value);
  if (idx >= 0) return vals[idx];
  if (value <= keys[0]) return vals[0];
  if (value >= keys[keys.length - 1]) return vals[vals.length - 1];

  let lo = 0;
  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i] <= value) lo = i;
  }
  const hi = Math.min(lo + 1, keys.length - 1);
  if (lo === hi) return vals[lo];

  const t = (value - keys[lo]) / (keys[hi] - keys[lo]);
  return lerp(vals[lo], vals[hi], t);
}

function getNextIndexFromSwipe(
  dx: number,
  threshold: number,
  activeIndex: number,
  length: number,
) {
  let next = activeIndex;
  if (dx < -threshold) next = activeIndex + 1;
  if (dx > threshold) next = activeIndex - 1;
  return clamp(next, 0, Math.max(0, length - 1));
}

function getNextIndexFromSwipeWithVelocity(
  dx: number,
  vxPxPerMs: number,
  threshold: number,
  velocityThreshold: number,
  activeIndex: number,
  length: number,
) {
  const isFlick =
    Math.abs(vxPxPerMs) >= velocityThreshold && Math.abs(dx) >= 10;
  if (isFlick) {
    const dir = vxPxPerMs < 0 ? 1 : -1;
    return clamp(activeIndex + dir, 0, Math.max(0, length - 1));
  }
  return getNextIndexFromSwipe(dx, threshold, activeIndex, length);
}

function getVisibleIndices(
  activeIndex: number,
  length: number,
  visibleCount: number,
  dx: number,
) {
  const count = Math.max(1, visibleCount || 3);
  const start = dx > 0 ? activeIndex - 1 : activeIndex;
  const out: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const idx = start + i;
    if (idx >= 0 && idx < length) out.push(idx);
  }

  if (out.indexOf(activeIndex) === -1) out.unshift(activeIndex);
  return out.slice(0, count);
}

function scaleRgbaAlpha(color: string, scale: number) {
  const match = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/,
  );
  if (!match) return color;
  const baseAlpha = match[4] ? Number(match[4]) : 1;
  const nextAlpha = clamp(baseAlpha * scale, 0, 1);
  return `rgba(${match[1]},${match[2]},${match[3]},${nextAlpha})`;
}

function labelFor(kind: Device["kind"]) {
  switch (kind) {
    case "ac":
      return "AC";
    case "light":
      return "Light";
    case "tv":
      return "TV";
    case "coffee":
      return "Coffee";
    case "fan":
      return "Fan";
    case "fridge":
      return "Fridge";
    case "gate":
      return "Gate";
    case "garage":
      return "Garage";
    case "door":
      return "Door";
    case "vacuum":
      return "Vacuum";
    case "camera":
      return "Camera";
    case "window":
      return "Window";
    case "stove":
      return "Stove";
    case "washer":
      return "Washer";
    case "dryer":
      return "Dryer";
    case "microwave":
      return "Micro";
    case "energy":
      return "Energy";
    case "water":
      return "Water";
    case "air":
      return "Air";
    case "sprinkler":
      return "Sprinkler";
    case "speaker":
      return "Speaker";
    case "smoke":
      return "Smoke";
    default:
      return "Device";
  }
}

function colorFor(kind: Device["kind"]) {
  switch (kind) {
    case "ac":
      return "rgba(114,146,255,0.95)";
    case "light":
      return "rgba(255,186,0,0.95)";
    case "tv":
      return "rgba(90,168,255,0.95)";
    case "coffee":
      return "rgba(124,112,140,0.95)";
    case "fan":
      return "rgba(120,180,255,0.95)";
    case "fridge":
      return "rgba(90,200,255,0.95)";
    case "door":
    case "garage":
    case "gate":
      return "rgba(200,170,120,0.95)";
    case "vacuum":
      return "rgba(150,120,255,0.95)";
    case "camera":
      return "rgba(170,120,255,0.95)";
    case "stove":
      return "rgba(240,140,80,0.95)";
    case "water":
      return "rgba(80,170,255,0.95)";
    case "air":
      return "rgba(120,220,180,0.95)";
    case "speaker":
      return "rgba(180,107,255,0.95)";
    default:
      return "rgba(0,0,0,0.7)";
  }
}

type RoomCardProps = {
  item: Room;
  devices: Device[];
  layout: {
    cardWidth: number;
    cardHeight: number;
    cardPad: number;
    iconTileWidth: number;
    titleSize: number;
    titleSizeInactive: number;
    subSize: number;
    iconSize: number;
    iconLabelSize: number;
    iconRowTop: number;
    cardRadius: number;
    iconGap: number;
    bubbleSize: number;
    bubbleRadius: number;
  };
  isTablet: boolean;
  isWholeHome: boolean;
  wholeHomeDevices?: Device[];
  onRoomPress?: (roomId: string) => void;
  onWholeHomePress?: () => void;
  onDevicePress?: (deviceId: string) => void;
};

function RoomCard({
  item,
  devices,
  layout,
  isTablet,
  isWholeHome,
  wholeHomeDevices,
  onRoomPress,
  onWholeHomePress,
  onDevicePress,
}: RoomCardProps) {
  const roomDevices = useMemo(
    () => devices.filter((d) => d.roomId === item.id),
    [devices, item.id],
  );

  const allDevices = isWholeHome ? devices : roomDevices;
  const running = allDevices.filter((d) => d.isOn).length;

  const displayDevices = isWholeHome
    ? (wholeHomeDevices ?? allDevices)
    : roomDevices;

  // ✅ 3 icons + “More” tile aligned
  const iconTiles = displayDevices.slice(0, 3);
  const remaining = Math.max(0, allDevices.length - iconTiles.length);
  const runningLabel = running === 1 ? "Running Device" : "Running Devices";

  const cardGradient = isTablet ? ACTIVE_GRADIENT_TABLET : ACTIVE_GRADIENT;
  const borderColor = isTablet ? CARD_BORDER_TABLET : CARD_BORDER;
  const shadowColor = isTablet ? CARD_SHADOW_TABLET : CARD_SHADOW;
  const titleSize = layout.titleSize;
  const cardShellStyle: StyleProp<ViewStyle> = [
    styles.cardShell,
    {
      height: layout.cardHeight,
      borderRadius: layout.cardRadius,
      shadowColor,
    },
  ];
  const cardSurfaceStyle: StyleProp<ViewStyle> = [
    styles.cardSurface,
    {
      borderRadius: layout.cardRadius,
      paddingTop: layout.cardPad,
      paddingHorizontal: layout.cardPad,
      borderColor,
    },
  ];
  const titleTextStyle: StyleProp<TextStyle> = [
    styles.title,
    { fontSize: titleSize },
  ];
  const subTextStyle: StyleProp<TextStyle> = [
    styles.sub,
    { fontSize: layout.subSize },
  ];
  const iconRowStyle: StyleProp<ViewStyle> = [
    styles.iconRow,
    { gap: layout.iconGap, marginTop: layout.iconRowTop },
  ];
  const iconTileStyle: StyleProp<ViewStyle> = [
    styles.iconTile,
    { width: layout.iconTileWidth },
  ];
  const iconBubbleStyle: StyleProp<ViewStyle> = [
    styles.iconBubble,
    {
      width: layout.bubbleSize,
      height: layout.bubbleSize,
      borderRadius: layout.bubbleRadius,
    },
  ];
  const iconLabelStyle: StyleProp<TextStyle> = [
    styles.iconLabel,
    { fontSize: layout.iconLabelSize },
  ];
  const moreBubbleStyle: StyleProp<ViewStyle> = [
    styles.iconBubble,
    styles.moreBubble,
    {
      width: layout.bubbleSize,
      height: layout.bubbleSize,
      borderRadius: layout.bubbleRadius,
    },
  ];

  return (
    <Pressable
      style={cardShellStyle}
      onPress={() => {
        if (isWholeHome) onWholeHomePress?.();
        else onRoomPress?.(item.id);
      }}
    >
      <LinearGradient
        colors={cardGradient}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 1, y: 1 }}
        style={cardSurfaceStyle}
      >
        <Text style={titleTextStyle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={subTextStyle}>
          {running} {runningLabel}
        </Text>

        <View style={iconRowStyle}>
          {iconTiles.map((d) => (
            <Pressable
              key={d.id}
              style={iconTileStyle}
              disabled={!onDevicePress}
              onPress={(event) => {
                event.stopPropagation?.();
                onDevicePress?.(d.id);
              }}
            >
              <View style={iconBubbleStyle}>
                <DeviceIcon
                  kind={d.kind}
                  size={layout.iconSize}
                  color={colorFor(d.kind)}
                />
              </View>
              <Text style={iconLabelStyle}>{labelFor(d.kind)}</Text>
            </Pressable>
          ))}

          <View style={iconTileStyle}>
            <View style={moreBubbleStyle}>
              <Text style={styles.moreCount}>+{remaining}</Text>
            </View>
            <Text style={iconLabelStyle}>More</Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

type RoomPeekCardProps = {
  item: Room;
  layout: RoomCardProps["layout"];
  isTablet: boolean;
  backBgAlpha: number;
};

function RoomPeekCard({
  item,
  layout,
  isTablet,
  backBgAlpha,
}: RoomPeekCardProps) {
  const baseGradient = isTablet ? STACKED_GRADIENT_TABLET : STACKED_GRADIENT;
  const peekGradient = baseGradient.map((color) =>
    scaleRgbaAlpha(color, backBgAlpha),
  ) as [string, string, string];
  const borderColor = isTablet ? STACK_BORDER_TABLET : STACK_BORDER;
  const peekPad = Math.max(6, Math.round(layout.cardPad * 0.35));
  const cardShellStyle: StyleProp<ViewStyle> = [
    styles.cardShell,
    styles.cardShellBack,
    {
      height: layout.cardHeight,
      borderRadius: layout.cardRadius,
    },
  ];
  const cardSurfaceStyle: StyleProp<ViewStyle> = [
    styles.cardSurface,
    styles.cardSurfaceBack,
    {
      borderRadius: layout.cardRadius,
      paddingTop: peekPad,
      paddingHorizontal: layout.cardPad,
      borderColor,
    },
  ];
  const titleStyle: StyleProp<TextStyle> = [
    styles.peekTitle,
    { fontSize: layout.titleSizeInactive },
  ];

  return (
    <View style={cardShellStyle}>
      <LinearGradient
        colors={peekGradient}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 1, y: 1 }}
        style={cardSurfaceStyle}
      >
        <Text style={titleStyle} numberOfLines={1}>
          {item.name}
        </Text>
      </LinearGradient>
    </View>
  );
}

export default function RoomCarousel({
  rooms,
  devices,
  onRoomPress,
  onIndexChange,
  wholeHomeDevices,
  onWholeHomePress,
  onDevicePress,
}: {
  rooms: Room[];
  devices: Device[];
  onRoomPress?: (roomId: string) => void;
  onIndexChange?: (index: number) => void;
  wholeHomeDevices?: Device[];
  onWholeHomePress?: () => void;
  onDevicePress?: (deviceId: string) => void;
}) {
  const showWholeHome = Boolean(wholeHomeDevices?.length);
  const data = useMemo(
    () => (showWholeHome ? [WHOLE_HOME_ROOM, ...rooms] : rooms),
    [rooms, showWholeHome],
  );

  const { width, isTablet, isLandscape, scale, gutter } = useResponsive();
  const listWidth = Math.min(
    width,
    isTablet ? (isLandscape ? 980 : 880) : width,
  );
  const sidePad = isTablet ? (isLandscape ? 56 : 40) : gutter;
  const cardPad = Math.round((isTablet ? (isLandscape ? 26 : 24) : 16) * scale);
  const cardHeight = Math.round(
    (isTablet ? (isLandscape ? 234 : 242) : 170) * scale,
  );
  const minCard = isTablet ? 360 : 260;
  const cardWidth = Math.max(
    minCard,
    Math.round(listWidth - sidePad * 2),
  );
  const layout = useMemo(
    () => ({
      cardWidth,
      cardHeight,
      cardPad,
      iconTileWidth: (cardWidth - cardPad * 2) / 4,
      titleSize: Math.round((isTablet ? (isLandscape ? 23 : 22) : 18) * scale),
      titleSizeInactive: Math.round((isTablet ? 17 : 14) * scale),
      subSize: Math.round((isTablet ? 14 : 12) * scale),
      iconSize: Math.round((isTablet ? 26 : 22) * scale),
      iconLabelSize: Math.round((isTablet ? 12 : 11) * scale),
      iconRowTop: Math.round((isTablet ? 16 : 12) * scale),
      cardRadius: Math.round((isTablet ? 36 : 28) * scale),
      iconGap: Math.round((isTablet ? 12 : 8) * scale),
      bubbleSize: Math.round((isTablet ? 52 : 42) * scale),
      bubbleRadius: Math.round((isTablet ? 18 : 14) * scale),
    }),
    [cardWidth, cardHeight, cardPad, isTablet, isLandscape, scale],
  );
  const stackDepth = Math.round(cardHeight * (isTablet ? 0.28 : 0.24));
  const containerHeight = cardHeight + stackDepth;
  const centerY = Math.round((containerHeight - cardHeight) / 2);
  const baseLift = Math.round(stackDepth * 0.18);
  const peekLift = Math.round(stackDepth * 0.5);
  const deepLift = Math.round(stackDepth * 1);
  const insetBase = Math.round(cardWidth * 0.05);
  const insetDeep = Math.round(cardWidth * 0.1);

  const [activeIndex, setActiveIndex] = useState(0);
  const [deckWidth, setDeckWidth] = useState(cardWidth);
  const drag = useRef({
    down: false,
    startX: 0,
    dx: 0,
    anim: 0,
    intent: 0 as -1 | 0 | 1,
    vx: 0,
  });
  const [, force] = useState(0);

  useEffect(() => {
    return () => cancelAnimationFrame(drag.current.anim);
  }, []);

  useEffect(() => {
    setActiveIndex((prev) => clamp(prev, 0, data.length - 1));
  }, [data.length]);

  const onDeckLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.max(260, Math.round(event.nativeEvent.layout.width));
    setDeckWidth(next);
  }, []);

  const swipeThreshold = useCallback(
    () => Math.max(60, deckWidth * 0.22),
    [deckWidth],
  );

  const commitIndex = useCallback(
    (index: number) => {
      const next = clamp(index, 0, data.length - 1);
      setActiveIndex(next);
      onIndexChange?.(next);
    },
    [data.length, onIndexChange],
  );

  const animateTo = useCallback((toDx: number, onDone?: () => void) => {
    const start = drag.current.dx;
    const startTime = Date.now();
    const distance = Math.abs(toDx - start);
    const duration = clamp(140 + distance * 0.25, 140, 260);

    const step = () => {
      const now = Date.now();
      const p = clamp((now - startTime) / duration, 0, 1);
      const e = 1 - Math.pow(1 - p, 4);
      drag.current.dx = start + (toDx - start) * e;
      force((n) => n + 1);

      if (p < 1) {
        drag.current.anim = requestAnimationFrame(step);
      } else {
        drag.current.dx = toDx;
        force((n) => n + 1);
        onDone?.();
      }
    };

    cancelAnimationFrame(drag.current.anim);
    drag.current.anim = requestAnimationFrame(step);
  }, []);

  const finishSwipe = useCallback(
    (vx: number) => {
      const dxNow = drag.current.dx;
      const th = swipeThreshold();
      const velocityThreshold = 0.75;
      const nextIndex = getNextIndexFromSwipeWithVelocity(
        dxNow,
        vx,
        th,
        velocityThreshold,
        activeIndex,
        data.length,
      );

      if (nextIndex !== activeIndex) {
        const w = deckWidth || cardWidth;
        const dir = nextIndex > activeIndex ? -1 : 1;
        animateTo(dir * w * 0.55, () => {
          commitIndex(nextIndex);
          drag.current.dx = 0;
          drag.current.intent = 0;
          drag.current.vx = 0;
          force((n) => n + 1);
        });
      } else {
        animateTo(0, () => {
          drag.current.intent = 0;
          drag.current.vx = 0;
        });
      }
    },
    [
      activeIndex,
      animateTo,
      cardWidth,
      commitIndex,
      data.length,
      deckWidth,
      swipeThreshold,
    ],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
          Math.abs(gesture.dx) > 4,
        onPanResponderGrant: () => {
          cancelAnimationFrame(drag.current.anim);
          drag.current.down = true;
          drag.current.intent = 0;
          drag.current.vx = 0;
        },
        onPanResponderMove: (_event, gesture) => {
          const hasPrev = activeIndex > 0;
          const hasNext = activeIndex < data.length - 1;
          const deltaX = gesture.dx;
          if (drag.current.intent === 0 && Math.abs(deltaX) >= 8) {
            drag.current.intent = deltaX > 0 ? 1 : -1;
          }
          const maxDx = deckWidth || cardWidth;
          let nextDx = clamp(deltaX, -maxDx, maxDx);
          if (!hasPrev && nextDx > 0) nextDx *= 0.35;
          if (!hasNext && nextDx < 0) nextDx *= 0.35;
          drag.current.dx = nextDx;
          drag.current.vx = gesture.vx;
          force((n) => n + 1);
        },
        onPanResponderRelease: (_event, gesture) => {
          drag.current.down = false;
          drag.current.vx = gesture.vx;
          finishSwipe(gesture.vx);
        },
        onPanResponderTerminate: (_event, gesture) => {
          drag.current.down = false;
          drag.current.vx = gesture.vx;
          finishSwipe(gesture.vx);
        },
      }),
    [activeIndex, cardWidth, data.length, deckWidth, finishSwipe],
  );

  const dxNow = drag.current.dx;
  const w = deckWidth || cardWidth;
  const dragProgress = w ? clamp(dxNow / w, -1, 1) : 0;
  const dragPower = Math.abs(dragProgress);
  const dragEase = 1 - Math.pow(1 - dragPower, 3);
  const activeTilt = dragProgress * -4;
  const activeScale = 1;
  const activeLift = dragEase * Math.round(stackDepth * 0.3);
  const intentSign = drag.current.intent === 0 ? dxNow : drag.current.intent;
  const towardNext = w ? clamp(-dxNow / w, 0, 1) : 0;
  const towardPrev = w ? clamp(dxNow / w, 0, 1) : 0;
  const visible = getVisibleIndices(activeIndex, data.length, 3, intentSign);

  return (
    <View style={styles.wrap}>
      <View
        testID="room-carousel-deck"
        onLayout={onDeckLayout}
        style={[styles.deck, { width: cardWidth, height: containerHeight }]}
        {...panResponder.panHandlers}
      >
        {visible.map((index) => {
          const item = data[index];
          const rel = index - activeIndex;
          const clampedRel = clamp(rel, -1, 2);
          const isActive = rel === 0;
          const baseY = mapDeck(
            clampedRel,
            [-1, 0, 1, 2],
            [-baseLift, 0, -peekLift, -deepLift],
          );
          const baseScale = mapDeck(
            clampedRel,
            [-1, 0, 1, 2],
            [1, 1, 1, 1],
          );
          const backBgAlpha = mapDeck(
            clampedRel,
            [-1, 0, 1, 2],
            [0, 1, 0.92, 0.86],
          );
          const focusProgress = rel === 1 ? towardNext : rel === -1 ? towardPrev : 0;
          const focusEase = 1 - Math.pow(1 - focusProgress, 2);
          const focusLift = focusEase * Math.round(stackDepth * 0.38);
          const focusScale = 0;
          const translateY =
            centerY +
            baseY -
            (isActive ? activeLift : focusLift);
          const insetX = mapDeck(
            clampedRel,
            [-1, 0, 1, 2],
            [insetBase, 0, insetBase, insetDeep],
          );
          const scale = isActive
            ? baseScale * activeScale
            : baseScale + focusScale;
          const zIndex = rel === 0 ? 1000 : 990 - Math.abs(rel);
          const focusShift = focusEase * Math.round(cardWidth * 0.02);
          const translateX = isActive
            ? dxNow
            : rel === 1
              ? -focusShift
              : rel === -1
                ? focusShift
                : 0;
          const rotateZ = isActive
            ? `${activeTilt}deg`
            : `${(rel === 1 ? -1 : 1) * focusEase * 1.4}deg`;

          return (
            <View
              key={item.id}
              testID="room-carousel-card"
              pointerEvents={isActive ? "auto" : "none"}
              style={[
                styles.cardWrap,
                {
                  height: cardHeight,
                  paddingLeft: insetX,
                  paddingRight: insetX,
                  overflow: "visible",
                  borderRadius: layout.cardRadius,
                  transform: [
                    { perspective: 1200 },
                    { translateX },
                    { translateY },
                    { scale },
                    { rotateZ },
                  ],
                  zIndex,
                },
              ]}
            >
              {isActive ? (
                <RoomCard
                  item={item}
                  devices={devices}
                  layout={layout}
                  isTablet={isTablet}
                  isWholeHome={item.id === WHOLE_HOME_ID}
                  wholeHomeDevices={wholeHomeDevices}
                  onRoomPress={onRoomPress}
                  onWholeHomePress={onWholeHomePress}
                  onDevicePress={onDevicePress}
                />
              ) : (
                <View testID="room-carousel-card-peek">
                  <RoomPeekCard
                    item={item}
                    layout={layout}
                    isTablet={isTablet}
                    backBgAlpha={backBgAlpha}
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, alignItems: "center", width: "100%" },
  deck: {
    position: "relative",
    overflow: "visible",
    alignItems: "stretch",
  },
  cardWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    alignItems: "stretch",
    justifyContent: "center",
  },

  cardShell: {
    width: "100%",
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    overflow: "visible",
    elevation: 10,
  },
  cardShellBack: {
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 7,
  },
  cardSurface: {
    flex: 1,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.98)",
    backfaceVisibility: "hidden",
  },
  cardSurfaceBack: {
    justifyContent: "flex-start",
  },

  title: {
    textAlign: "center",
    color: "rgba(20,20,28,0.92)",
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  titleInactive: {
    color: "rgba(30,30,42,0.6)",
    fontWeight: "800",
  },
  peekTitle: {
    textAlign: "center",
    color: "rgba(20,20,28,0.92)",
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  sub: {
    textAlign: "center",
    color: "rgba(24,24,36,0.56)",
    fontWeight: "700",
    marginTop: 6,
  },

  iconRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    gap: 10,
  },

  // ✅ 4 columns: 3 icons + More tile aligned
  iconTile: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconBubble: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(190,180,240,0.25)",
    shadowColor: "rgba(110,80,200,0.18)",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  iconLabel: {
    marginTop: 8,
    fontWeight: "800",
    color: "rgba(26,26,34,0.6)",
    textAlign: "center",
  },

  moreBubble: {
    backgroundColor: "rgba(123,85,255,0.16)",
    borderColor: "rgba(123,85,255,0.3)",
  },
  moreCount: {
    color: theme.colors.accent2,
    fontWeight: "900",
    fontSize: 12,
  },
});
