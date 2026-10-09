import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import DeviceCollectionCard from "../DeviceCollectionCard";
import CinematicCardArtwork from "../../features/cinematic-artwork/CinematicCardArtwork";
import { deviceArtwork } from "../../features/cinematic-artwork/artwork";
import { theme } from "../../theme/theme";

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

test("reference artwork stays unchanged when the actual device switches off", () => {
  const artwork = deviceArtwork({ kind: "light", id: "living-light" });
  const onQuickAction = jest.fn();
  const screen = render(<DeviceCollectionCard {...presentation} artwork={artwork} onOpen={jest.fn()} onQuickAction={onQuickAction} />);
  expect(screen.UNSAFE_getByType(CinematicCardArtwork).props.artwork).toBe(artwork);
  screen.rerender(<DeviceCollectionCard {...presentation} artwork={artwork} active={false} status="Off" value="Off" quickActionLabel="Turn on" onOpen={jest.fn()} onQuickAction={onQuickAction} />);
  expect(screen.UNSAFE_getByType(CinematicCardArtwork).props.artwork).toBe(artwork);
  expect(screen.getByText("Off")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Turn on: Primary suite ceiling lights" }));
  expect(onQuickAction).toHaveBeenCalledTimes(1);
  expect(screen.getAllByRole("button")).toHaveLength(2);
});

test("keeps the favorite action independent from device controls and reports selection", () => {
  const onOpen = jest.fn();
  const onQuickAction = jest.fn();
  const onToggleFavorite = jest.fn();
  const screen = render(
    <DeviceCollectionCard
      {...presentation}
      favorite
      onOpen={onOpen}
      onQuickAction={onQuickAction}
      onToggleFavorite={onToggleFavorite}
    />,
  );
  const favorite = screen.getByRole("button", {
    name: `Remove ${presentation.name} from favorites`,
  });
  expect(favorite.props.accessibilityState.selected).toBe(true);
  fireEvent.press(favorite);
  expect(onToggleFavorite).toHaveBeenCalledTimes(1);
  expect(onQuickAction).not.toHaveBeenCalled();
  expect(onOpen).not.toHaveBeenCalled();
  screen.rerender(
    <DeviceCollectionCard
      {...presentation}
      favoriteDisabled
      onOpen={onOpen}
      onQuickAction={onQuickAction}
      onToggleFavorite={onToggleFavorite}
    />,
  );
  fireEvent.press(
    screen.getByRole("button", {
      name: `Add ${presentation.name} to favorites`,
    }),
  );
  expect(onToggleFavorite).toHaveBeenCalledTimes(1);
});

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

test('alarm and reset-pending states take visual priority over the normal active accent', () => {
  const props = { ...presentation, onOpen: jest.fn(), onQuickAction: jest.fn() };
  const screen = render(<DeviceCollectionCard {...props} status="Smoke alarm" value="Smoke" statusTone="alarm" />);
  expect(screen.getByText('Smoke')).toHaveStyle({ color: theme.colors.alarmText });
  screen.rerender(<DeviceCollectionCard {...props} status="Incident awaiting reset" value="Reset pending" statusTone="warning" />);
  expect(screen.getByText('Reset pending')).toHaveStyle({ color: theme.colors.warningText });
});
