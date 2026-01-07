import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  NativeScrollEvent,
  NativeSyntheticEvent,
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

const ACTIVE_GRADIENT = [
  "#FFFFFF",
  "rgba(248,240,255,0.98)",
  "rgba(242,233,255,0.94)",
];
const ACTIVE_GRADIENT_TABLET = [
  "#FFFFFF",
  "rgba(236,247,255,0.98)",
  "rgba(228,234,255,0.94)",
];
const STACKED_GRADIENT = [
  "rgba(255,255,255,0.86)",
  "rgba(248,240,255,0.78)",
  "rgba(242,233,255,0.7)",
];
const STACKED_GRADIENT_TABLET = [
  "rgba(255,255,255,0.74)",
  "rgba(244,238,255,0.65)",
  "rgba(236,230,255,0.58)",
];

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
    stackInset1: number;
    stackInset2: number;
    stackGap: number;
    stackRadius: number;
    cardRadius: number;
    iconGap: number;
    bubbleSize: number;
    bubbleRadius: number;
    stackTitleSize: number;
    inactiveScale: number;
    inactiveLift: number;
    inactiveOpacity: number;
  };
  isTablet: boolean;
  isActive: boolean;
  isWholeHome: boolean;
  wholeHomeDevices?: Device[];
  stackTitles?: Array<string | undefined>;
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
  stackTitles,
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

    // Subtle motion only (like reference)
    const scale = interpolate(
      Math.abs(dist),
      [0, 1],
      [1, layout.inactiveScale],
      Extrapolation.CLAMP,
    );
    const lift = interpolate(
      Math.abs(dist),
      [0, 1],
      [0, layout.inactiveLift],
      Extrapolation.CLAMP,
    );
    const opacity = interpolate(
      Math.abs(dist),
      [0, 1],
      [1, layout.inactiveOpacity],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateY: lift }, { scale }],
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
  const borderColor = isTablet
    ? "rgba(140,180,255,0.55)"
    : "rgba(255,255,255,0.72)";
  const shadowColor = isTablet ? "rgba(120,140,255,0.35)" : "rgba(0,0,0,0.25)";
  const titleSize = isActive ? layout.titleSize : layout.titleSizeInactive;

  return (
    <Animated.View
      style={[
        styles.item,
        {
          width: layout.cardWidth,
          height: layout.cardHeight + layout.stackGap,
        },
        animStyle,
      ]}
    >
      {/* ✅ Fix: only ACTIVE card has stacked layers (prevents “3 cards” look) */}
      {isActive && (
        <>
          <View
            style={[
              styles.stackBack2,
              {
                height: layout.cardHeight,
                left: layout.stackInset2,
                right: layout.stackInset2,
                borderRadius: layout.stackRadius,
              },
            ]}
            testID="room-card-stack-2"
          >
            {stackTitles?.[1] ? (
              <Text
                style={[styles.stackTitle, { fontSize: layout.stackTitleSize }]}
                numberOfLines={1}
              >
                {stackTitles[1]}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.stackBack1,
              {
                height: layout.cardHeight,
                left: layout.stackInset1,
                right: layout.stackInset1,
                borderRadius: layout.stackRadius,
              },
            ]}
            testID="room-card-stack-1"
          >
            {stackTitles?.[0] ? (
              <Text
                style={[styles.stackTitle, { fontSize: layout.stackTitleSize }]}
                numberOfLines={1}
              >
                {stackTitles[0]}
              </Text>
            ) : null}
          </View>
        </>
      )}

      <Pressable
        style={[
          styles.cardShell,
          {
            height: layout.cardHeight,
            borderRadius: layout.cardRadius,
            shadowColor,
          },
        ]}
        onPress={() => {
          if (isWholeHome) onWholeHomePress?.();
          else onRoomPress?.(item.id);
        }}
      >
        <LinearGradient
          colors={cardGradient}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.cardSurface,
            {
              borderRadius: layout.cardRadius,
              paddingTop: layout.cardPad,
              paddingHorizontal: layout.cardPad,
              borderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.title,
              { fontSize: titleSize },
              !isActive && styles.titleInactive,
            ]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {isActive ? (
            <Text style={[styles.sub, { fontSize: layout.subSize }]}>
              {running} {runningLabel}
            </Text>
          ) : null}

          {isActive ? (
            <View style={[styles.iconRow, { gap: layout.iconGap }]}>
              {iconTiles.map((d) => (
                <Pressable
                  key={d.id}
                  style={[styles.iconTile, { width: layout.iconTileWidth }]}
                  disabled={!onDevicePress}
                  onPress={(event) => {
                    // Prevent the card press from firing when tapping a device.
                    event.stopPropagation?.();
                    onDevicePress?.(d.id);
                  }}
                >
                  <View
                    style={[
                      styles.iconBubble,
                      {
                        width: layout.bubbleSize,
                        height: layout.bubbleSize,
                        borderRadius: layout.bubbleRadius,
                      },
                    ]}
                  >
                    <DeviceIcon
                      kind={d.kind}
                      size={layout.iconSize}
                      color={colorFor(d.kind)}
                    />
                  </View>
                  <Text
                    style={[
                      styles.iconLabel,
                      { fontSize: layout.iconLabelSize },
                    ]}
                  >
                    {labelFor(d.kind)}
                  </Text>
                </Pressable>
              ))}

              <View style={[styles.iconTile, { width: layout.iconTileWidth }]}>
                <View
                  style={[
                    styles.iconBubble,
                    styles.moreBubble,
                    {
                      width: layout.bubbleSize,
                      height: layout.bubbleSize,
                      borderRadius: layout.bubbleRadius,
                    },
                  ]}
                >
                  <Text style={styles.moreCount}>+{remaining}</Text>
                </View>
                <Text
                  style={[styles.iconLabel, { fontSize: layout.iconLabelSize }]}
                >
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
  const cardPad = Math.round((isTablet ? (isLandscape ? 28 : 26) : 18) * scale);
  const cardHeight = Math.round(
    (isTablet ? (isLandscape ? 240 : 248) : 180) * scale,
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
      stackInset1: Math.round((isTablet ? 18 : 14) * scale),
      stackInset2: Math.round((isTablet ? 32 : 24) * scale),
      stackGap: Math.round((isTablet ? 46 : 34) * scale),
      stackRadius: Math.round((isTablet ? 34 : 28) * scale),
      cardRadius: Math.round((isTablet ? 38 : 30) * scale),
      iconGap: Math.round((isTablet ? 14 : 10) * scale),
      bubbleSize: Math.round((isTablet ? 54 : 44) * scale),
      bubbleRadius: Math.round((isTablet ? 18 : 16) * scale),
      stackTitleSize: Math.round((isTablet ? 13 : 11) * scale),
      inactiveScale: isTablet ? 0.992 : 0.985,
      inactiveLift: Math.round((isTablet ? 4 : 6) * scale),
      inactiveOpacity: isTablet ? 0.94 : 0.92,
    }),
    [cardWidth, cardHeight, cardPad, isTablet, isLandscape, scale],
  );

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
        style={{ width: listWidth, alignSelf: "center" }}
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
        contentContainerStyle={[
          styles.listContent,
          {
            paddingHorizontal: sidePad,
            paddingTop: Math.round((isTablet ? 20 : 14) * scale),
            paddingBottom: Math.round((isTablet ? 10 : 6) * scale),
          },
        ]}
        ItemSeparatorComponent={() => <View style={{ width: gap }} />}
        renderItem={({ item, index }) => {
          const stackTitles =
            index === activeIndex
              ? [data[index + 1]?.name, data[index + 2]?.name]
              : undefined;
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
              stackTitles={stackTitles}
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
  wrap: { marginTop: 10, overflow: "visible" },

  listContent: {
    paddingHorizontal: 0,
    paddingTop: 20,
    paddingBottom: 10, // ✅ avoids bottom cut-off
  },

  item: {
    overflow: "visible",
  },

  // ✅ stacked caps behind active card (like reference)
  stackBack1: {
    position: "absolute",
    top: 6,
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    transform: [{ translateY: -28 }],
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  stackBack2: {
    position: "absolute",
    top: 0,
    backgroundColor: "rgba(255,255,255,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.48)",
    transform: [{ translateY: -42 }],
    alignItems: "center",
    paddingTop: 8,
    paddingHorizontal: 14,
  },

  stackTitle: {
    color: "rgba(20,20,30,0.55)",
    fontWeight: "800",
    textAlign: "center",
  },

  cardShell: {
    shadowColor: "rgba(0,0,0,0.25)",
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    overflow: "visible",
    elevation: 8,
  },
  cardSurface: {
    flex: 1,
    borderWidth: 1,
    overflow: "hidden",
  },

  title: {
    textAlign: "center",
    color: "rgba(0,0,0,0.85)",
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  titleInactive: {
    color: "rgba(0,0,0,0.6)",
    fontWeight: "800",
  },
  sub: {
    textAlign: "center",
    color: "rgba(0,0,0,0.55)",
    fontWeight: "700",
    marginTop: 6,
  },

  iconRow: {
    marginTop: 18,
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
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "rgba(80,80,120,0.08)",
    shadowColor: "rgba(70,40,140,0.22)",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  iconLabel: {
    marginTop: 8,
    fontWeight: "800",
    color: "rgba(0,0,0,0.55)",
    textAlign: "center",
  },

  moreBubble: {
    backgroundColor: "rgba(107,60,255,0.14)",
    borderColor: "rgba(107,60,255,0.22)",
  },
  moreCount: {
    color: theme.colors.accent2,
    fontWeight: "900",
    fontSize: 12,
  },
});
