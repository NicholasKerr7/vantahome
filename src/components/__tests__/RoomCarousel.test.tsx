import React from "react";
import renderer from "react-test-renderer";
import { Dimensions } from "react-native";
import RoomCarousel from "../RoomCarousel";
import type { Device, Room } from "../../store/useHomeStore";

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
    const tree = renderer.create(
      <RoomCarousel
        rooms={rooms}
        devices={devices}
        onRoomPress={() => undefined}
      />,
    );
    const list = tree.root.findByProps({ testID: "room-carousel-list" });
    const w = Dimensions.get("window").width;
    const h = Dimensions.get("window").height;
    const isTablet = Math.min(w, h) >= 768;
    const isLandscape = w > h;
    const sidePad = isTablet ? (isLandscape ? 56 : 40) : 18;
    const gap = 0;
    const listWidth = Math.min(w, isTablet ? (isLandscape ? 980 : 880) : w);
    const minCard = isTablet ? 360 : 260;
    const cardW = Math.max(minCard, Math.round(listWidth - sidePad * 2 - gap));
    const snap = cardW + gap;
    expect(list.props.horizontal).toBe(true);
    expect(list.props.snapToInterval).toBe(snap);
    expect(list.props.decelerationRate).toBe("fast");
  });

  it("renders stacked layers for the active card", () => {
    const tree = renderer.create(
      <RoomCarousel rooms={rooms} devices={devices} />,
    );
    const stacks = tree.root.findAllByProps({ testID: "room-card-stack-1" });
    const stacks2 = tree.root.findAllByProps({ testID: "room-card-stack-2" });
    expect(stacks.length).toBe(1);
    expect(stacks2.length).toBe(1);
  });
});
