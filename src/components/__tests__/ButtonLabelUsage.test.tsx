import React from "react";
import { View } from "react-native";
import { render } from "@testing-library/react-native";
import OptionChips from "../OptionChips";
import ModeTiles from "../ModeTiles";
import DeviceCapabilityControls from "../DeviceCapabilityControls";
import ButtonLabel from "../ButtonLabel";
import type { Device } from "../../store/useHomeStore";

jest.mock("@expo/vector-icons/Ionicons", () => {
  return function MockIonicons(props: any) {
    return <View {...props} />;
  };
});

jest.mock("../../theme/layout", () => ({
  useResponsive: () => ({
    isTablet: false,
    isLandscape: false,
    scale: 1,
    width: 390,
  }),
}));

describe("shared button label usage", () => {
  it("renders option chips with shared button labels", () => {
    const { UNSAFE_getAllByType } = render(
      <OptionChips
        options={[
          { label: "Quick Wash", value: "quick" },
          { label: "Heavy Duty", value: "heavy" },
        ]}
        value="quick"
        onSelect={() => {}}
        rowStyle={null}
        chipStyle={() => null}
        chipTextStyle={() => null}
      />,
    );

    expect(UNSAFE_getAllByType(ButtonLabel)).toHaveLength(2);
  });

  it("renders mode tiles with two-line shared button labels", () => {
    const { UNSAFE_getAllByType } = render(
      <ModeTiles value="cold" onChange={() => {}} />,
    );

    const labels = UNSAFE_getAllByType(ButtonLabel);
    expect(labels).toHaveLength(3);
    labels.forEach((label) => expect(label.props.lines).toBe(2));
  });

  it("renders quick control pills with shared button labels", () => {
    const device: Device = {
      id: "tv-1",
      name: "Living Room TV",
      kind: "tv",
      roomId: "room-1",
      isOn: true,
      volume: 18,
      muted: false,
    };

    const { UNSAFE_getAllByType } = render(
      <DeviceCapabilityControls device={device} context="quick" />,
    );

    expect(UNSAFE_getAllByType(ButtonLabel).length).toBeGreaterThanOrEqual(2);
  });
});
