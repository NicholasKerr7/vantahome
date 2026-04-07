import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import AutomationBuilderScreen from "../AutomationBuilderScreen";
import { useHomeStore } from "../../store/useHomeStore";

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

jest.mock("../../components/BackgroundLines", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockBackgroundLines() {
    return <View />;
  };
});

jest.mock("../../components/ModalCard", () => {
  const React = require("react");
  const { View } = require("react-native");
  return function MockModalCard({ visible, children }: any) {
    return visible ? <View>{children}</View> : null;
  };
});

const seed = useHomeStore.getState();

describe("AutomationBuilderScreen", () => {
  beforeEach(() => {
    useHomeStore.setState({
      profile: { ...seed.profile },
      rooms: [{ id: "r1", name: "Living Room" }],
      devices: [
        {
          id: "d1",
          name: "Window Sensor",
          kind: "window",
          roomId: "r1",
          isOn: false,
          openPercent: 0,
        },
      ],
      scenes: [{ id: "s1", roomId: "r1", name: "Night Scene", actions: [] }],
      household: [{ id: "m1", name: "Alex", role: "Owner", status: "home" }],
      roomMembers: [{ memberId: "m1", roomIds: ["r1"] }],
      activeMemberId: "m1",
      flows: [],
    });
  });

  it("saves a flow with trigger, sunset condition, and notify action", () => {
    const navigation = { goBack: jest.fn() } as any;
    const route = {
      key: "AutomationBuilder",
      name: "AutomationBuilder",
      params: {},
    } as any;

    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AutomationBuilderScreen navigation={navigation} route={route} />,
      );
    });

    act(() => {
      tree.root
        .findByProps({ testID: "automation-name-input" })
        .props.onChangeText("Secure after sunset");
    });

    act(() => {
      tree.root
        .findByProps({ testID: "automation-add-trigger-button" })
        .props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: "automation-trigger-hour-input" })
        .props.onChangeText("21");
      tree.root
        .findByProps({ testID: "automation-trigger-minute-input" })
        .props.onChangeText("15");
    });
    act(() => {
      tree.root
        .findByProps({ testID: "automation-editor-submit-button" })
        .props.onPress();
    });

    act(() => {
      tree.root
        .findByProps({ testID: "automation-add-condition-button" })
        .props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: "automation-editor-type-sun" })
        .props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: "automation-editor-submit-button" })
        .props.onPress();
    });

    act(() => {
      tree.root
        .findByProps({ testID: "automation-add-action-button" })
        .props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: "automation-editor-type-notify" })
        .props.onPress();
    });
    act(() => {
      tree.root
        .findByProps({ testID: "automation-notify-message-input" })
        .props.onChangeText("Secure the house");
    });
    act(() => {
      tree.root
        .findByProps({ testID: "automation-editor-submit-button" })
        .props.onPress();
    });

    act(() => {
      tree.root
        .findByProps({ testID: "automation-save-button" })
        .props.onPress();
    });

    expect(useHomeStore.getState().flows).toEqual([
      expect.objectContaining({
        name: "Secure after sunset",
        enabled: true,
        triggers: [{ type: "time", hour: 21, minute: 15 }],
        conditions: [{ type: "sun", relation: "after-sunset" }],
        actions: [{ type: "notify", message: "Secure the house" }],
      }),
    ]);
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
