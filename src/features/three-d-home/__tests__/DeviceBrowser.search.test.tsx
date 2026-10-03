import { FULL_SCENE_ACCESS } from '../../../../packages/home-scene/src/sceneAccess';
import React from "react";
import { StyleSheet } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { DEVICES } from "../../../../packages/home-scene/src/data";
import DeviceBrowser from "../DeviceBrowser";
import { SimulationControlClient } from "../simulationControlClient";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: require("react-native").View,
}));
const mockFavorites = {
  enabled: true,
  ids: [] as string[],
  status: "saved",
  toggle: jest.fn(),
};
jest.mock("../useDeviceBrowserFavorites", () => ({
  useDeviceBrowserFavorites: () => mockFavorites,
}));
beforeEach(() => {
  jest
    .spyOn(
      require("react-native") as typeof import("react-native"),
      "useWindowDimensions",
    )
    .mockReturnValue({ width: 375, height: 667, fontScale: 1, scale: 1 });
  mockFavorites.enabled = true;
  mockFavorites.ids = [];
  mockFavorites.status = "saved";
  mockFavorites.toggle.mockClear();
});
afterEach(() => jest.restoreAllMocks());
const client = new SimulationControlClient();
const snapshot = { ...client.getSnapshot(), ready: true, access: FULL_SCENE_ACCESS };

/** Reflect an accepted quick action so the blur regression covers the visible state change. */
function InteractiveSearch({ onSelect }: { onSelect: (id: string) => void }) {
  const [current, setCurrent] = React.useState(snapshot);
  const controls = {
    setSetting: jest.fn(),
    setLevel: jest.fn(),
    setPower: jest.fn(),
    runAction: jest.fn(),
    toggle: (id: string) =>
      setCurrent((previous) => ({
        ...previous,
        state: {
          ...previous.state,
          deviceStates: {
            ...previous.state.deviceStates,
            [id]: {
              ...previous.state.deviceStates[id],
              on: !previous.state.deviceStates[id].on,
            },
          },
        },
      })),
  };
  return (
    <DeviceBrowser
      snapshot={current}
      client={controls}
      onSelect={onSelect}
      allowedDeviceIds={["living-light"]}
    />
  );
}

test("searches every room from a room view and clears back to the directory", () => {
  const screen = render(
    <DeviceBrowser snapshot={snapshot} client={client} onSelect={jest.fn()} />,
  );
  fireEvent.press(screen.getByLabelText(/Living room, \d+ devices/));
  fireEvent.changeText(
    screen.getByLabelText("Search all devices and rooms"),
    "primary suite",
  );
  expect(screen.getAllByLabelText(/Full controls$/).length).toBeGreaterThan(0);
  expect(screen.queryByLabelText(/Living room.*Full controls$/)).toBeNull();
  fireEvent.changeText(
    screen.getByLabelText("Search all devices and rooms"),
    "no such room",
  );
  expect(screen.getByText("No matching devices")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Clear device search"));
  expect(screen.getByLabelText(/Living room, \d+ devices/)).toBeTruthy();
});

test("resets paged search when a query changes and never includes hidden devices", () => {
  const screen = render(
    <DeviceBrowser snapshot={snapshot} client={client} onSelect={jest.fn()} />,
  );
  fireEvent(screen.getByTestId("device-browser-card-area"), "layout", {
    nativeEvent: { layout: { width: 360, height: 220 } },
  });
  fireEvent.changeText(
    screen.getByLabelText("Search all devices and rooms"),
    "light",
  );
  fireEvent.press(screen.getByLabelText("Next controls page"));
  expect(
    screen.getByLabelText("Previous controls page").props.accessibilityState
      .disabled,
  ).toBe(false);
  fireEvent.changeText(
    screen.getByLabelText("Search all devices and rooms"),
    "living",
  );
  expect(
    screen.getByLabelText("Previous controls page").props.accessibilityState
      .disabled,
  ).toBe(true);
  screen.rerender(
    <DeviceBrowser
      snapshot={snapshot}
      client={client}
      onSelect={jest.fn()}
      allowedDeviceIds={["living-light"]}
    />,
  );
  expect(screen.getAllByLabelText(/Full controls$/)).toHaveLength(1);
  expect(screen.queryByLabelText(/Living room fan.*Full controls/)).toBeNull();
});

test("favorites retain full controls, paginate, and exclude out-of-scope saved IDs", () => {
  mockFavorites.ids = DEVICES.slice(0, 8).map((device) => device.id);
  const onSelect = jest.fn();
  const screen = render(
    <DeviceBrowser snapshot={snapshot} client={client} onSelect={onSelect} />,
  );
  fireEvent(screen.getByTestId("device-browser-card-area"), "layout", {
    nativeEvent: { layout: { width: 360, height: 220 } },
  });
  fireEvent.press(screen.getByLabelText("Browse favorite devices"));
  act(() =>
    screen
      .getByTestId("device-browser-card-area")
      .props.onLayout({ nativeEvent: { layout: { width: 360, height: 220 } } }),
  );
  expect(screen.getByText("1 / 4")).toBeTruthy();
  expect(screen.getAllByLabelText(/Full controls$/)).toHaveLength(2);
  fireEvent.press(screen.getByLabelText("Next controls page"));
  expect(
    screen.getByLabelText("Previous controls page").props.accessibilityState
      .disabled,
  ).toBe(false);
  screen.rerender(
    <DeviceBrowser
      snapshot={snapshot}
      client={client}
      onSelect={onSelect}
      allowedDeviceIds={["living-light"]}
    />,
  );
  expect(screen.getAllByLabelText(/Full controls$/)).toHaveLength(1);
  const device = DEVICES.find((item) => item.id === "living-light")!;
  fireEvent.press(
    screen.getByLabelText(`Remove ${device.name} from favorites`),
  );
  expect(mockFavorites.toggle).toHaveBeenCalledWith(device.id);
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText(/Full controls$/));
  expect(onSelect).toHaveBeenCalledWith(device.id);
  fireEvent.press(screen.getByLabelText("Browse all rooms"));
  expect(screen.getByLabelText("Living room, 1 devices")).toBeTruthy();
});

test("explains empty favorites, guards hydration, and hides favorites outside its scope", () => {
  mockFavorites.status = "loading";
  const screen = render(
    <DeviceBrowser
      snapshot={snapshot}
      client={client}
      onSelect={jest.fn()}
      allowedDeviceIds={["living-light"]}
    />,
  );
  fireEvent.press(screen.getByLabelText("Living room, 1 devices"));
  const star = screen.getByLabelText(/Add .* to favorites/);
  expect(star.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(star);
  expect(mockFavorites.toggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText("Browse favorite devices"));
  expect(screen.getByText("Loading favorites…")).toBeTruthy();
  mockFavorites.status = "error";
  screen.rerender(
    <DeviceBrowser
      snapshot={snapshot}
      client={client}
      onSelect={jest.fn()}
      allowedDeviceIds={["living-light"]}
    />,
  );
  expect(screen.getByText("Your favorites start here")).toBeTruthy();
  expect(
    screen.getByText(/Favorites could not be saved or loaded/),
  ).toBeTruthy();
  mockFavorites.enabled = false;
  screen.rerender(
    <DeviceBrowser
      snapshot={snapshot}
      client={client}
      onSelect={jest.fn()}
      allowedDeviceIds={["living-light"]}
    />,
  );
  expect(screen.queryByLabelText("Browse favorite devices")).toBeNull();
  expect(screen.getByLabelText("Living room, 1 devices")).toBeTruthy();
});

test("keeps compact phone search results actionable and restores cards after submit", () => {
  const onSelect = jest.fn();
  const screen = render(
    <DeviceBrowser
      snapshot={snapshot}
      client={client}
      onSelect={onSelect}
      allowedDeviceIds={["living-light"]}
    />,
  );
  const search = screen.getByLabelText("Search all devices and rooms");
  fireEvent(search, "focus");
  fireEvent.changeText(search, "living");
  fireEvent(screen.getByTestId("device-browser-card-area"), "layout", {
    nativeEvent: { layout: { width: 320, height: 440 } },
  });
  expect(
    StyleSheet.flatten(
      screen.getByTestId("device-browser-result-row").props.style,
    ),
  ).toMatchObject({ flex: 0, minHeight: 88 });
  expect(screen.getByLabelText(/Full controls$/)).toBeTruthy();
  expect(screen.queryByLabelText("Browse favorite devices")).toBeNull();
  fireEvent(search, "submitEditing");
  expect(
    StyleSheet.flatten(
      screen.getByTestId("device-browser-result-row").props.style,
    ).flex,
  ).toBe(1);
  expect(
    StyleSheet.flatten(
      screen.getByTestId("device-browser-result-row").props.style,
    ),
  ).toMatchObject({ minHeight: 192, maxHeight: 240 });
  expect(screen.getByLabelText("Browse favorite devices")).toBeTruthy();
  fireEvent.press(screen.getByLabelText(/Full controls$/));
  expect(onSelect).toHaveBeenCalledWith("living-light");
});

test("keeps the first quick, favorite, and full-controls tap stable after input blur", () => {
  const onSelect = jest.fn();
  const screen = render(<InteractiveSearch onSelect={onSelect} />);
  const search = screen.getByLabelText("Search all devices and rooms");
  fireEvent(search, "focus");
  fireEvent.changeText(search, "pendant");
  const action = screen.getByLabelText("Turn off: Pendant light");
  fireEvent(search, "blur");
  expect(screen.getByLabelText("Turn off: Pendant light")).toBe(action);
  expect(
    StyleSheet.flatten(
      screen.getByTestId("device-browser-result-row").props.style,
    ).flex,
  ).toBe(0);
  fireEvent.press(action);
  expect(screen.getByLabelText("Turn on: Pendant light")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Add Pendant light to favorites"));
  expect(mockFavorites.toggle).toHaveBeenCalledWith("living-light");
  fireEvent.press(screen.getByLabelText(/Full controls$/));
  expect(onSelect).toHaveBeenCalledWith("living-light");
});

test("provides an explicit exit for an empty active search after the keyboard blurs", () => {
  const screen = render(
    <DeviceBrowser
      snapshot={snapshot}
      client={client}
      onSelect={jest.fn()}
      allowedDeviceIds={["living-light"]}
    />,
  );
  const search = screen.getByLabelText("Search all devices and rooms");
  fireEvent(search, "focus");
  fireEvent(search, "blur");
  fireEvent.press(screen.getByLabelText("Close device search"));
  expect(screen.getByLabelText("Living room, 1 devices")).toBeTruthy();
  expect(screen.queryByLabelText("Close device search")).toBeNull();
});
