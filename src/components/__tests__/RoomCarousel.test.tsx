import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
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
  it("renders a stacked deck with up to three cards", () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <RoomCarousel
          rooms={rooms}
          devices={devices}
          onRoomPress={() => undefined}
        />,
      );
    });
    const deck = tree.root.findByProps({ testID: "room-carousel-deck" });
    expect(deck).toBeTruthy();
    const cards = tree.root.findAllByProps({ testID: "room-carousel-card" });
    expect(cards.length).toBeLessThanOrEqual(3);
    act(() => {
      tree.unmount();
    });
  });

  it("renders peek cards behind the active card", () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<RoomCarousel rooms={rooms} devices={devices} />);
    });
    const peeks = tree.root.findAllByProps({
      testID: "room-carousel-card-peek",
    });
    expect(peeks.length).toBeGreaterThan(0);
    act(() => {
      tree.unmount();
    });
  });
});
