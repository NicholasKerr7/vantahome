import React from "react";
import renderer, { act } from "react-test-renderer";
import RoomCarousel from "../RoomCarousel";
import type { Device, Room } from "../../store/useHomeStore";

const mockLayout = {
  width: 390,
  height: 844,
  isLandscape: false,
  isTablet: false,
  contentWidth: 390,
  gutter: 22,
  topPad: 56,
  blockGap: 14,
  scale: 1,
};

jest.mock("@expo/vector-icons/Ionicons", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockIonicons(props: any) {
    return <View {...props} />;
  };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockMaterialIcons(props: any) {
    return <View {...props} />;
  };
});

jest.mock("../../theme/layout", () => ({
  useResponsive: () => mockLayout,
  TABLET_MIN_SIZE: 768,
  DEFAULT_MAX_WIDTH: 860,
}));

const rooms: Room[] = [
  { id: "r1", name: "Drawing Room" },
  { id: "r2", name: "Bedroom" },
];

const devices: Device[] = [
  {
    id: "d1",
    name: "AC",
    kind: "ac",
    roomId: "r1",
    isOn: true,
    tempC: 22,
    mode: "cold",
  },
  {
    id: "d2",
    name: "Light",
    kind: "light",
    roomId: "r1",
    isOn: true,
    brightness: 70,
  },
  { id: "d3", name: "TV", kind: "tv", roomId: "r2", isOn: false, volume: 30 },
];

describe("RoomCarousel", () => {
  it("snaps between cards (swipe carousel)", () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <RoomCarousel
          rooms={rooms}
          devices={devices}
          onRoomPress={() => undefined}
        />,
      );
    });
    const list = tree.root.findByProps({ testID: "room-carousel-list" });
    const { width, isTablet, isLandscape, gutter } = mockLayout;
    const listWidth = Math.min(
      width,
      isTablet ? (isLandscape ? 980 : 880) : width,
    );
    const sidePad = isTablet ? (isLandscape ? 56 : 40) : gutter;
    const gap = 0;
    const minCard = isTablet ? 360 : 260;
    const cardW = Math.max(minCard, Math.round(listWidth - sidePad * 2 - gap));
    const snap = cardW + gap;
    expect(list.props.horizontal).toBe(true);
    expect(list.props.snapToInterval).toBe(snap);
    expect(list.props.decelerationRate).toBe("fast");
    act(() => {
      tree.unmount();
    });
  });

  it("renders stacked layers for the active card", () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RoomCarousel rooms={rooms} devices={devices} />);
    });
    const stacks = tree.root.findAllByProps({ testID: "room-card-stack-1" });
    const stacks2 = tree.root.findAllByProps({ testID: "room-card-stack-2" });
    expect(stacks.length).toBeGreaterThan(0);
    expect(stacks2.length).toBeGreaterThan(0);
    act(() => {
      tree.unmount();
    });
  });
});
