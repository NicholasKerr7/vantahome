import React from "react";
import renderer, { act } from "react-test-renderer";
import DeviceDetailScreen from "../DeviceDetailScreen";
import { useHomeStore } from "../../store/useHomeStore";

jest.mock("../../components/BackgroundLines", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockBackgroundLines() {
    return <View />;
  };
});

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

describe("DeviceDetailScreen", () => {
  beforeEach(() => {
    useHomeStore.setState({
      rooms: [{ id: "r1", name: "Kitchen" }],
      devices: [
        { id: "d1", name: "Coffee", kind: "coffee", roomId: "r1", isOn: false },
      ],
      indoor: { tempC: 22, label: "Indoor" },
    });
  });

  it("opens the edit panel when the options button is pressed", () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
    const route = {
      key: "DeviceDetail",
      name: "DeviceDetail",
      params: { deviceId: "d1" },
    } as any;

    const tree = renderer.create(
      <DeviceDetailScreen navigation={navigation} route={route} />,
    );
    const button = tree.root.findByProps({ testID: "device-options-button" });
    act(() => button.props.onPress());

    const editCard = tree.root.findByProps({ testID: "device-edit-card" });
    expect(editCard).toBeTruthy();
  });
});
