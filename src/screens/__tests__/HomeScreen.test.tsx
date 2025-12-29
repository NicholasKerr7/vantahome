import React from "react";
import renderer, { act } from "react-test-renderer";
import HomeScreen from "../HomeScreen";
import { useHomeStore } from "../../store/useHomeStore";

let parentNavigate: jest.Mock;
let navigate: jest.Mock;

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate,
    getParent: () => ({ navigate: parentNavigate }),
  }),
}));

jest.mock("../../components/RoomCarousel", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockRoomCarousel() {
    return <View testID="room-carousel-mock" />;
  };
});

jest.mock("../../components/GradientOrb", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockGradientOrb() {
    return <View />;
  };
});

jest.mock("../../components/BackgroundLines", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockBackgroundLines() {
    return <View />;
  };
});

describe("HomeScreen", () => {
  beforeEach(() => {
    parentNavigate = jest.fn();
    navigate = jest.fn();
    useHomeStore.setState({
      userName: "Alex",
      profile: {
        name: "Alex",
        email: "alex@example.com",
        phone: "",
        homeName: "Vanta Home",
        avatarColor: "#B46BFF",
      },
      rooms: [{ id: "r1", name: "Drawing Room" }],
      devices: [
        {
          id: "d1",
          name: "AC",
          kind: "ac",
          roomId: "r1",
          isOn: true,
          tempC: 22,
          mode: "cold",
        },
      ],
      outdoor: { tempC: 24, label: "Sunny" },
      indoor: { tempC: 22, label: "Indoor" },
    });
  });

  it("navigates to Profile when avatar is pressed", () => {
    const tree = renderer.create(<HomeScreen />);
    const avatar = tree.root.findByProps({ testID: "home-avatar-button" });
    act(() => avatar.props.onPress());
    expect(parentNavigate).toHaveBeenCalledWith("Profile");
  });

  it("navigates to Notifications when bell is pressed", () => {
    const tree = renderer.create(<HomeScreen />);
    const bell = tree.root.findByProps({ testID: "home-notifications-button" });
    act(() => bell.props.onPress());
    expect(parentNavigate).toHaveBeenCalledWith("Notifications");
  });
});
