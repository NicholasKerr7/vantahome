import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import DeviceCollectionCard from "../DeviceCollectionCard";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: require("react-native").View,
}));

const presentation = {
  name: "Primary suite ceiling lights",
  status: "On · 68%",
  value: "68%",
  caption: "Brightness",
  active: true,
  quickActionLabel: "Turn off",
};

test("provides separate named buttons for immediate action and full controls", () => {
  const onOpen = jest.fn();
  const onQuickAction = jest.fn();
  const screen = render(
    <DeviceCollectionCard
      {...presentation}
      onOpen={onOpen}
      onQuickAction={onQuickAction}
    />,
  );
  expect(screen.getAllByRole("button")).toHaveLength(2);
  fireEvent.press(
    screen.getByRole("button", {
      name: "Turn off: Primary suite ceiling lights",
    }),
  );
  expect(onQuickAction).toHaveBeenCalledTimes(1);
  expect(onOpen).not.toHaveBeenCalled();
  fireEvent.press(
    screen.getByRole("button", {
      name: "Primary suite ceiling lights, On · 68%. Full controls",
    }),
  );
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onQuickAction).toHaveBeenCalledTimes(1);
  expect(screen.getByText("68%")).toBeTruthy();
  expect(screen.getByText("Brightness")).toBeTruthy();
});

test("blocks unavailable quick commands while retaining access to full controls", () => {
  const onOpen = jest.fn();
  const onQuickAction = jest.fn();
  const screen = render(
    <DeviceCollectionCard
      {...presentation}
      disabled
      onOpen={onOpen}
      onQuickAction={onQuickAction}
    />,
  );
  const quick = screen.getByRole("button", {
    name: "Turn off: Primary suite ceiling lights",
  });
  expect(quick.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(quick);
  expect(onQuickAction).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: /Full controls$/ }));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

test("offers the same management action through touch and assistive technology", () => {
  const onOpen = jest.fn();
  const onLongPress = jest.fn();
  const screen = render(
    <DeviceCollectionCard
      {...presentation}
      onOpen={onOpen}
      onQuickAction={jest.fn()}
      onLongPress={onLongPress}
    />,
  );
  const identity = screen.getByRole("button", { name: /Full controls$/ });
  fireEvent(identity, "longPress");
  fireEvent(identity, "accessibilityAction", {
    nativeEvent: { actionName: "longpress" },
  });
  fireEvent(identity, "accessibilityAction", {
    nativeEvent: { actionName: "unrelated" },
  });
  expect(onLongPress).toHaveBeenCalledTimes(2);
  expect(onOpen).not.toHaveBeenCalled();
});

test("uses device-specific sensor actions without assuming power-toggle behavior", () => {
  const onQuickAction = jest.fn();
  const screen = render(
    <DeviceCollectionCard
      name="Family smoke sensor"
      status="Sensor healthy"
      value="Healthy"
      caption="No smoke detected"
      active
      quickActionLabel="Run self-test"
      onOpen={jest.fn()}
      onQuickAction={onQuickAction}
    />,
  );
  fireEvent.press(
    screen.getByRole("button", { name: "Run self-test: Family smoke sensor" }),
  );
  expect(onQuickAction).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Turn off")).toBeNull();
});
