import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import DeviceDetailScreen from "../DeviceDetailScreen";
import { ScrollView, Text } from "react-native";
import DeviceEditModal from "../device-detail/DeviceEditModal";
import ModalActionRow from "../../components/ModalActionRow";
import Pressable from "../../components/Pressable";
import { deviceClient } from "../../services/deviceClient";
import { useHomeStore } from "../../store/useHomeStore";

/** The rendered node fields needed to select a room through its visible label. */
type RenderedDeviceNode = {
  props: { children?: React.ReactNode; onPress: () => void };
  findAllByType: (component: unknown) => RenderedDeviceNode[];
};

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

jest.mock("lottie-react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockLottieView(props: any) {
    return <View {...props} />;
  };
});

jest.mock("../../components/RadialDial", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockRadialDial(props: any) {
    return <View {...props} />;
  };
});

jest.mock("../../theme/layout", () => ({
  useResponsive: () => mockLayout,
  TABLET_MIN_SIZE: 768,
  DEFAULT_MAX_WIDTH: 860,
}));

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
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

describe("DeviceDetailScreen", () => {
  beforeEach(() => {
    act(() => {
      useHomeStore.setState({
        rooms: [{ id: "r1", name: "Kitchen" }],
        devices: [
          {
            id: "d1",
            name: "Coffee",
            kind: "coffee",
            roomId: "r1",
            isOn: false,
          },
        ],
        indoor: { tempC: 22, label: "Indoor" },
      });
    });
  });

  it("opens the edit panel when the options button is pressed", () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;
    const route = {
      key: "DeviceDetail",
      name: "DeviceDetail",
      params: { deviceId: "d1" },
    } as any;

    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DeviceDetailScreen navigation={navigation} route={route} />,
      );
    });
    const button = tree.root.findByProps({ testID: "device-options-button" });
    act(() => button.props.onPress());

    const editCard = tree.root.findByProps({ testID: "device-edit-card" });
    expect(editCard).toBeTruthy();
    act(() => {
      tree.unmount();
    });
  });

  it("keeps edit actions outside long room fields and saves the selected room", async () => {
    useHomeStore.setState({ rooms: Array.from({ length: 30 }, (_, index) => ({ id: `r${index + 1}`, name: `Room ${index + 1}` })) });
    const navigation = { goBack: jest.fn(), navigate: jest.fn() } as never;
    const route = { key: "DeviceDetail", name: "DeviceDetail", params: { deviceId: "d1" } } as never;
    const send = jest.spyOn(deviceClient, "sendCommand");
    let tree!: ReactTestRenderer;
    act(() => { tree = renderer.create(<DeviceDetailScreen navigation={navigation} route={route} />); });
    try {
      act(() => tree.root.findByProps({ testID: "device-options-button" }).props.onPress());
      const editor = tree.root.findByType(DeviceEditModal);
      const fields = editor.findByType(ScrollView);
      expect(fields.props.keyboardShouldPersistTaps).toBe("handled");
      expect(fields.findAllByType(ModalActionRow)).toHaveLength(0);
      act(() => fields.findByProps({ accessibilityLabel: "Device name" }).props.onChangeText("Morning coffee"));
      const lastRoom = fields.findAllByType(Pressable).find((node: RenderedDeviceNode) =>
        node.findAllByType(Text).some((text: RenderedDeviceNode) => text.props.children === "Room 30"));
      expect(lastRoom).toBeTruthy();
      act(() => lastRoom!.props.onPress());
      const save = editor.findByType(ModalActionRow).props.actions.find((action: { label: string }) => action.label === "Save");
      await act(async () => { save.onPress(); });
      expect(send).toHaveBeenCalledWith({ op: "set-properties", deviceId: "d1", changes: { name: "Morning coffee", roomId: "r30" } });
      expect(tree.root.findByType(DeviceEditModal).props.visible).toBe(false);
    } finally {
      act(() => tree.unmount());
      send.mockRestore();
    }
  });

});
