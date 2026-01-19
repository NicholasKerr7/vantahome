import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  NativeScrollEvent,
  NativeSyntheticEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "./Pressable";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from "react-native-reanimated";
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
  index: number;
  x: SharedValue<number>;
  devices: Device[];
  itemWidth: number;
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
    stackInset1: number;
    stackGap: number;
    stackRadius: number;
    cardRadius: number;
    iconGap: number;
    bubbleSize: number;
    bubbleRadius: number;
    stackTitleSize: number;
    inactiveScale: number;
    inactiveOpacity: number;
  };
  isTablet: boolean;
  isActive: boolean;
  isWholeHome: boolean;
  wholeHomeDevices?: Device[];
  stackTitle?: string;
  onRoomPress?: (roomId: string) => void;
  onWholeHomePress?: () => void;
  onDevicePress?: (deviceId: string) => void;
};

function RoomCard({
  item,
  index,
  x,
  devices,
  itemWidth,
  layout,
  isTablet,
  isActive,
  isWholeHome,
  wholeHomeDevices,
  stackTitle,
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

  const animStyle = useAnimatedStyle(() => {
    const pos = index * itemWidth;
    const dist = (x.value - pos) / itemWidth;
    const absDist = Math.min(1, Math.abs(dist));

    // Subtle motion only (like reference)
    const scale = interpolate(
      absDist,
      [0, 1],
      [1, layout.inactiveScale],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      absDist,
      [0, 1],
      [1, layout.inactiveOpacity],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ scale }],
      opacity: isActive ? 1 : opacity,
    };
  }, [index, isActive, itemWidth, layout]);

  const cardGradient = isActive
    ? isTablet
      ? ACTIVE_GRADIENT_TABLET
      : ACTIVE_GRADIENT
    : isTablet
      ? STACKED_GRADIENT_TABLET
      : STACKED_GRADIENT;
  const borderColor = isTablet ? CARD_BORDER_TABLET : CARD_BORDER;
  const shadowColor = isTablet ? CARD_SHADOW_TABLET : CARD_SHADOW;
  const titleSize = isActive ? layout.titleSize : layout.titleSizeInactive;
  const itemStyle: StyleProp<ViewStyle> = [
    styles.item,
    {
      width: layout.cardWidth,
      height: layout.cardHeight + layout.stackGap,
    },
    animStyle,
  ];
  const stackBackStyle: StyleProp<ViewStyle> = [
    styles.stackBack1,
    {
      height: layout.cardHeight,
      left: layout.stackInset1,
      right: layout.stackInset1,
      borderRadius: layout.stackRadius,
      borderColor: isTablet ? STACK_BORDER_TABLET : STACK_BORDER,
      backgroundColor: isTablet
        ? "rgba(255,255,255,0.7)"
        : "rgba(255,255,255,0.68)",
    },
  ];
  const stackTitleStyle: StyleProp<TextStyle> = [
    styles.stackTitle,
    { fontSize: layout.stackTitleSize },
  ];
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
    !isActive && styles.titleInactive,
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
    <Animated.View style={itemStyle}>
      {/* ✅ Fix: only ACTIVE card has stacked layers (prevents “3 cards” look) */}
      {isActive && (
        <>
          <View style={stackBackStyle} testID="room-card-stack-1">
            {stackTitle ? (
              <Text style={stackTitleStyle} numberOfLines={1}>
                {stackTitle}
              </Text>
            ) : null}
          </View>
        </>
      )}

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
          {isActive ? (
            <Text style={subTextStyle}>{running} {runningLabel}</Text>
          ) : null}

          {isActive ? (
            <View style={iconRowStyle}>
              {iconTiles.map((d) => (
                <Pressable
                  key={d.id}
                  style={iconTileStyle}
                  disabled={!onDevicePress}
                  onPress={(event) => {
                    // Prevent the card press from firing when tapping a device.
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
                  <Text style={iconLabelStyle}>
                    {labelFor(d.kind)}
                  </Text>
                </Pressable>
              ))}

              <View style={iconTileStyle}>
                <View style={moreBubbleStyle}>
                  <Text style={styles.moreCount}>+{remaining}</Text>
                </View>
                <Text style={iconLabelStyle}>
                  More
                </Text>
              </View>
            </View>
          ) : null}
        </LinearGradient>
      </Pressable>
    </Animated.View>
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
  const gap = 0;
  const cardPad = Math.round((isTablet ? (isLandscape ? 26 : 24) : 16) * scale);
  const cardHeight = Math.round(
    (isTablet ? (isLandscape ? 234 : 242) : 170) * scale,
  );
  const minCard = isTablet ? 360 : 260;
  const cardWidth = Math.max(
    minCard,
    Math.round(listWidth - sidePad * 2 - gap),
  );
  const itemWidth = cardWidth + gap;
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
      stackInset1: Math.round((isTablet ? 16 : 12) * scale),
      stackGap: Math.round((isTablet ? 34 : 20) * scale),
      stackRadius: Math.round((isTablet ? 32 : 26) * scale),
      cardRadius: Math.round((isTablet ? 36 : 28) * scale),
      iconGap: Math.round((isTablet ? 12 : 8) * scale),
      bubbleSize: Math.round((isTablet ? 52 : 42) * scale),
      bubbleRadius: Math.round((isTablet ? 18 : 14) * scale),
      stackTitleSize: Math.round((isTablet ? 12 : 10) * scale),
      inactiveScale: isTablet ? 0.992 : 0.982,
      inactiveOpacity: isTablet ? 0.93 : 0.88,
    }),
    [cardWidth, cardHeight, cardPad, isTablet, isLandscape, scale],
  );
  const listStyle: StyleProp<ViewStyle> = {
    width: listWidth,
    alignSelf: "center",
  };
  const listContentStyle: StyleProp<ViewStyle> = [
    styles.listContent,
    {
      paddingHorizontal: sidePad,
      paddingTop: Math.round((isTablet ? 16 : 10) * scale),
      paddingBottom: Math.round((isTablet ? 6 : 2) * scale),
    },
  ];
  const separatorStyle: StyleProp<ViewStyle> = { width: gap };

  const [activeIndex, setActiveIndex] = useState(0);
  const x = useSharedValue(0);

  const updateIndex = (next: number) => {
    const clamped = Math.max(0, Math.min(next, data.length - 1));
    setActiveIndex(clamped);
    onIndexChange?.(clamped);
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      x.value = e.contentOffset.x;
    },
  });

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateIndex(
      Math.max(0, Math.round(e.nativeEvent.contentOffset.x / itemWidth)),
    );
  };

  const onEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateIndex(
      Math.max(0, Math.round(e.nativeEvent.contentOffset.x / itemWidth)),
    );
  };

  return (
    <View style={styles.wrap}>
      <Animated.FlatList
        testID="room-carousel-list"
        horizontal
        data={data}
        keyExtractor={(r) => r.id}
        showsHorizontalScrollIndicator={false}
        style={listStyle}
        // ✅ Fix: one card per swipe (no extra cards peeking)
        pagingEnabled
        snapToInterval={itemWidth}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        bounces={false}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
        onMomentumScrollEnd={onMomentumEnd}
        onScrollEndDrag={onEndDrag}
        removeClippedSubviews={false} // ✅ fixes top/bottom clipping
        contentContainerStyle={listContentStyle}
        ItemSeparatorComponent={() => <View style={separatorStyle} />}
        renderItem={({ item, index }) => {
          const stackTitle =
            index === activeIndex ? data[index + 1]?.name : undefined;
          return (
            <RoomCard
              item={item}
              index={index}
              x={x}
              devices={devices}
              itemWidth={itemWidth}
              layout={layout}
              isTablet={isTablet}
              isActive={index === activeIndex}
              isWholeHome={item.id === WHOLE_HOME_ID}
              wholeHomeDevices={wholeHomeDevices}
              stackTitle={stackTitle}
              onRoomPress={onRoomPress}
              onWholeHomePress={onWholeHomePress}
              onDevicePress={onDevicePress}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, overflow: "visible" },

  listContent: {
    paddingHorizontal: 0,
    paddingTop: 16,
    paddingBottom: 6, // ✅ avoids bottom cut-off
  },

  item: {
    overflow: "visible",
  },

  // ✅ stacked caps behind active card (like reference)
  stackBack1: {
    position: "absolute",
    top: 8,
    backgroundColor: "rgba(255,255,255,0.68)",
    borderWidth: 1,
    borderColor: STACK_BORDER,
    transform: [{ translateY: -26 }],
    alignItems: "center",
    paddingTop: 8,
    paddingHorizontal: 14,
    shadowColor: "rgba(120,80,200,0.16)",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  stackTitle: {
    color: "rgba(90,80,130,0.4)",
    fontWeight: "800",
    textAlign: "center",
  },

  cardShell: {
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    overflow: "visible",
    elevation: 10,
  },
  cardSurface: {
    flex: 1,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.98)",
    backfaceVisibility: "hidden",
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
