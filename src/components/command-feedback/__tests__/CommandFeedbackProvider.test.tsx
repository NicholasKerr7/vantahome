import React from "react";
import { Text } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import {
  CommandProgressStore,
  type CommandProgressEvent,
  type CommandProgressHandle,
} from "../../../services/commandProgress";
import { useHomeStore } from "../../../store/useHomeStore";
import CommandFeedbackProvider from "../CommandFeedbackProvider";
import { useCommandActivityLauncher } from "../CommandActivityContext";
import Pressable from "../../Pressable";
import type { RuntimeMode } from "../../../config/runtimeMode";

let mockProgress: CommandProgressStore;
let mockRuntimeMode: RuntimeMode = "production";
jest.mock("../../../services/deviceClient", () => ({
  deviceClient: {
    getCommandHistory: () => mockProgress.getAll(),
    subscribeCommandProgress: (listener: (event: CommandProgressEvent) => void) =>
      mockProgress.subscribe(listener),
  },
}));
jest.mock("../../../config/runtimeMode", () => ({
  runtimePolicy: {
    /** Change presentation mode without reloading the provider or its context. */
    get mode() { return mockRuntimeMode; },
    /** Preserve the real distinction between demo, development and release copy. */
    get allowMockTelemetry() { return mockRuntimeMode === "demo" || mockRuntimeMode === "development"; },
  },
}));
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }),
  };
});
jest.mock("@expo/vector-icons/Ionicons", () => () => null);

/** Exercise the same read-only launcher used by the Settings screen. */
function ActivityLauncher() {
  const activity = useCommandActivityLauncher();
  return activity ? (
    <Pressable accessibilityLabel="Open activity" onPress={activity.open}>
      <Text>{activity.count} recent</Text>
      <Text testID="activity-presentation">{activity.visible ? "covered" : "uncovered"}</Text>
    </Pressable>
  ) : (
    <Text>Unavailable</Text>
  );
}

/** Keep the provider stable while exercising real home-store visibility changes. */
function AppShell({ enabled = true }: { enabled?: boolean }) {
  return (
    <CommandFeedbackProvider enabled={enabled}>
      <ActivityLauncher />
    </CommandFeedbackProvider>
  );
}

/** Admit metadata only; these UI tests never contact a transport. */
function admit(commandId = "command-a", deviceId = "light-a") {
  return mockProgress.start({
    commandId,
    deviceId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 15000,
  });
}

/** Represent a transport handoff, deliberately not a device-state observation. */
function submit(handle: CommandProgressHandle) {
  mockProgress.transition(handle, "sending", 1);
  mockProgress.transition(handle, "submitted");
}

describe("private command feedback", () => {
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => {
    mockRuntimeMode = "production";
    mockProgress = new CommandProgressStore();
    useHomeStore.setState({
      authenticatedUserId: "alice",
      accountUserId: "alice",
      sessionEpoch: 1,
      accountHomeId: "home-a",
      activeHomeId: "home-a",
      membershipReady: true,
      activeMemberId: "member-a",
      household: [{ id: "member-a", name: "Alice", role: "Tenant", status: "home" }],
      rooms: [{ id: "room-a", name: "Room" }],
      roomMembers: [{ memberId: "member-a", roomIds: ["room-a"] }],
      memberPermissionOverrides: [],
      devices: [
        {
          id: "light-a",
          kind: "light",
          name: "Reading light",
          roomId: "room-a",
          isOn: false,
        },
        {
          id: "private-light",
          kind: "light",
          name: "Private light",
          roomId: "private-room",
          isOn: false,
        },
      ],
    });
  });

  test("empty activity does not cover the screen and can be opened deliberately", () => {
    const screen = render(<AppShell />);
    expect(screen.queryByTestId("command-delivery-notice")).toBeNull();
    expect(screen.getByTestId("activity-presentation")).toHaveTextContent("uncovered");
    fireEvent.press(screen.getByLabelText("Open activity"));
    expect(screen.getByText("No recent commands")).toBeTruthy();
    expect(screen.getByTestId("activity-presentation")).toHaveTextContent("covered");
    fireEvent.press(screen.getByLabelText("Close command activity"));
    expect(screen.queryByText("No recent commands")).toBeNull();
    expect(screen.getByTestId("activity-presentation")).toHaveTextContent("uncovered");
  });

  test("submitted feedback stays unconfirmed, and dismissal does not discard history", () => {
    const screen = render(<AppShell />);
    act(() => {
      submit(admit());
    });
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(
      screen.getByText("Device state unconfirmed · View activity"),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Dismiss delivery notice"));
    expect(screen.queryByTestId("command-delivery-notice")).toBeNull();
    expect(mockProgress.get("command-a")?.status).toBe("submitted");
    fireEvent.press(screen.getByLabelText("Open activity"));
    expect(
      screen.getByText(
        "Transport accepted the request. Device state is not confirmed.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("command-a")).toBeNull();
    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.getByTestId("command-activity-list")).toHaveProp("bounces", false);
  });

  test("demo preparation, sending and submitted phases stay quiet without losing activity", () => {
    mockRuntimeMode = "demo";
    const screen = render(<AppShell />);
    let handle!: CommandProgressHandle;
    act(() => { handle = admit(); });
    expect(screen.queryByTestId("command-delivery-notice")).toBeNull();
    act(() => { mockProgress.transition(handle, "sending", 1); });
    expect(screen.queryByTestId("command-delivery-notice")).toBeNull();
    act(() => { mockProgress.transition(handle, "submitted"); });
    expect(screen.queryByTestId("command-delivery-notice")).toBeNull();
    expect(screen.getByText("1 recent")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Open activity"));
    expect(screen.getByText("Demo: Submitted")).toBeTruthy();
    expect(screen.getByText("Transport accepted the request. Device state is not confirmed. Simulation is not real-device confirmation.")).toBeTruthy();
    expect(mockProgress.get("command-a")?.status).toBe("submitted");
  });

  test.each([
    ["queued", "Queued for retry"],
    ["retrying", "Retrying command"],
    ["failed", "Delivery not verified"],
    ["rejected", "Delivery stopped"],
    ["expired", "Command expired"],
    ["timed_out", "Response timed out"],
    ["cancelled", "Local tracking stopped"],
  ] as const)("demo keeps %s feedback visible", (status, title) => {
    mockRuntimeMode = "demo";
    const screen = render(<AppShell />);
    act(() => {
      const handle = admit();
      mockProgress.transition(handle, "sending", 1);
      if (status === "retrying") mockProgress.transition(handle, "queued");
      expect(mockProgress.transition(handle, status, status === "retrying" ? 2 : undefined)).toBe(true);
    });
    expect(screen.getByTestId("command-delivery-notice")).toBeTruthy();
    expect(screen.getByText(`Demo: ${title}`)).toBeTruthy();
    expect(screen.getByLabelText(/Open command activity/)).toHaveProp("accessibilityLiveRegion", "polite");
  });

  test.each(["queued", "timed_out"] as const)("a newer neutral demo command cannot conceal earlier %s feedback", (status) => {
    mockRuntimeMode = "demo";
    const clock = jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const screen = render(<AppShell />);
    act(() => {
      const handle = admit("warning");
      mockProgress.transition(handle, "sending", 1);
      mockProgress.transition(handle, status);
    });
    clock.mockReturnValue(1_800_000_001_000);
    act(() => { submit(admit("newer")); });
    expect(screen.getByText(status === "queued" ? "Demo: Queued for retry" : "Demo: Response timed out")).toBeTruthy();
    expect(screen.getByText("2 recent")).toBeTruthy();
    expect(screen.queryByText("Demo: Submitted")).toBeNull();
    if (status === "timed_out") expect(screen.getByText("1 needs review · View activity")).toBeTruthy();
  });

  test("demo retry feedback disappears after submission while activity retains its attempt count", () => {
    mockRuntimeMode = "demo";
    const screen = render(<AppShell />);
    let handle!: CommandProgressHandle;
    act(() => {
      handle = admit();
      mockProgress.transition(handle, "sending", 1);
      mockProgress.transition(handle, "queued");
    });
    expect(screen.getByText("Demo: Queued for retry")).toBeTruthy();
    act(() => { mockProgress.transition(handle, "retrying", 2); });
    expect(screen.getByText("Demo: Retrying command")).toBeTruthy();
    act(() => { mockProgress.transition(handle, "submitted"); });
    expect(screen.queryByTestId("command-delivery-notice")).toBeNull();
    fireEvent.press(screen.getByLabelText("Open activity"));
    expect(screen.getByText("Demo: Submitted")).toBeTruthy();
    expect(screen.getByText("2 of 4 delivery attempts")).toBeTruthy();
    expect(mockProgress.getAll()).toHaveLength(1);
  });

  test("a dismissed demo retry still reveals a later terminal failure", () => {
    mockRuntimeMode = "demo";
    const screen = render(<AppShell />);
    let handle!: CommandProgressHandle;
    act(() => {
      handle = admit();
      mockProgress.transition(handle, "sending", 1);
      mockProgress.transition(handle, "queued");
    });
    fireEvent.press(screen.getByLabelText("Dismiss delivery notice"));
    act(() => { mockProgress.transition(handle, "retrying", 2); });
    expect(screen.queryByTestId("command-delivery-notice")).toBeNull();
    act(() => { mockProgress.transition(handle, "failed", undefined, "retry_exhausted"); });
    expect(screen.getByText("Demo: Delivery not verified")).toBeTruthy();
    expect(screen.getByText("1 needs review · View activity")).toBeTruthy();
  });

  test.each(["development", "alpha", "production"] as const)("%s keeps ordinary delivery notices", (mode) => {
    mockRuntimeMode = mode;
    const prefix = mode === "development" ? "Demo: " : "";
    const screen = render(<AppShell />);
    let handle!: CommandProgressHandle;
    act(() => { handle = admit(); });
    expect(screen.getByText(`${prefix}Preparing command`)).toBeTruthy();
    act(() => { mockProgress.transition(handle, "sending", 1); });
    expect(screen.getByText(`${prefix}Sending command`)).toBeTruthy();
    act(() => { mockProgress.transition(handle, "submitted"); });
    expect(screen.getByText(`${prefix}Submitted`)).toBeTruthy();
    expect(screen.getByText("Device state unconfirmed · View activity")).toBeTruthy();
  });

  test("a dismissed retry does not spam notices, but terminal uncertainty is shown", () => {
    const screen = render(<AppShell />);
    let handle!: CommandProgressHandle;
    act(() => {
      handle = admit();
      mockProgress.transition(handle, "sending", 1);
      mockProgress.transition(handle, "queued");
    });
    fireEvent.press(screen.getByLabelText("Dismiss delivery notice"));
    act(() => {
      mockProgress.transition(handle, "retrying", 2);
    });
    expect(screen.queryByTestId("command-delivery-notice")).toBeNull();
    act(() => {
      mockProgress.transition(handle, "timed_out", undefined, "transport_timeout");
    });
    expect(screen.getByText("Response timed out")).toBeTruthy();
    expect(screen.getByText("1 needs review · View activity")).toBeTruthy();
    expect(
      screen.getByLabelText(/Open command activity, 1 needs review/),
    ).toBeTruthy();
  });

  test("dismissals survive other commands without hiding a later terminal outcome", () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const screen = render(<AppShell />);
    let first!: CommandProgressHandle;
    act(() => {
      first = admit("first");
      mockProgress.transition(first, "sending", 1);
      mockProgress.transition(first, "queued");
    });
    fireEvent.press(screen.getByLabelText("Dismiss delivery notice"));
    clock.mockReturnValue(1_800_000_001_000);
    act(() => {
      submit(admit("second"));
    });
    expect(screen.getByText("Submitted")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Dismiss delivery notice"));

    clock.mockReturnValue(1_800_000_002_000);
    act(() => {
      mockProgress.transition(first, "retrying", 2);
    });
    expect(screen.queryByTestId("command-delivery-notice")).toBeNull();
    clock.mockReturnValue(1_800_000_003_000);
    act(() => {
      mockProgress.transition(first, "timed_out", undefined, "transport_timeout");
    });
    expect(screen.getByText("Response timed out")).toBeTruthy();
    expect(screen.getByText("1 needs review · View activity")).toBeTruthy();
  });

  test("recording dismissals prunes commands evicted from the bounded history", () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    mockProgress = new CommandProgressStore(1);
    const screen = render(<AppShell />);
    act(() => {
      submit(admit("first"));
    });
    fireEvent.press(screen.getByLabelText("Dismiss delivery notice"));
    clock.mockReturnValue(1_800_000_001_000);
    act(() => {
      submit(admit("second"));
    });
    fireEvent.press(screen.getByLabelText("Dismiss delivery notice"));

    clock.mockReturnValue(1_800_000_002_000);
    act(() => {
      submit(admit("first"));
    });
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText("1 recent")).toBeTruthy();
  });

  test("same-clock reused IDs cannot inherit an evicted admission's dismissal", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    mockProgress = new CommandProgressStore(1);
    const screen = render(<AppShell />);
    act(() => {
      submit(admit("reused"));
    });
    const first = mockProgress.get("reused");
    fireEvent.press(screen.getByLabelText("Dismiss delivery notice"));

    act(() => {
      submit(admit("replacement"));
    });
    // No intervening dismissal prunes the old key, and every timestamp matches.
    act(() => {
      submit(admit("reused"));
    });
    expect(mockProgress.get("reused")).toEqual(first);
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText("1 recent")).toBeTruthy();
  });

  test("multiple warning outcomes use plural review copy", () => {
    const screen = render(<AppShell />);
    act(() => {
      for (const commandId of ["first", "second"]) {
        const handle = admit(commandId);
        mockProgress.transition(handle, "sending", 1);
        mockProgress.transition(
          handle,
          "timed_out",
          undefined,
          "transport_timeout",
        );
      }
    });
    expect(screen.getByText("2 need review · View activity")).toBeTruthy();
    expect(
      screen.getByLabelText(/Open command activity, 2 need review/),
    ).toBeTruthy();
  });

  test("private or newly revoked devices disappear from notices, rows and counts", () => {
    const screen = render(<AppShell />);
    act(() => {
      submit(admit());
      submit(admit("private", "private-light"));
    });
    expect(screen.getByText("1 recent")).toBeTruthy();
    expect(screen.queryByText("Private light")).toBeNull();
    fireEvent.press(screen.getByLabelText("Open activity"));
    expect(screen.getAllByText("Reading light").length).toBeGreaterThan(0);
    act(() => {
      useHomeStore.setState({ roomMembers: [] });
    });
    expect(screen.queryByText("Reading light")).toBeNull();
    expect(screen.queryByText("Private light")).toBeNull();
    expect(screen.getByText("No recent commands")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Close command activity"));
    expect(screen.getByText("0 recent")).toBeTruthy();
  });

  test("a late failure is not hidden by dismissal of a newer submitted command", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const screen = render(<AppShell />);
    let first!: CommandProgressHandle;
    act(() => {
      first = admit("first");
      mockProgress.transition(first, "sending", 1);
      mockProgress.transition(first, "queued");
      submit(admit("newer"));
    });
    fireEvent.press(screen.getByLabelText("Dismiss delivery notice"));
    act(() => {
      mockProgress.transition(first, "retrying", 2);
      mockProgress.transition(first, "timed_out", undefined, "transport_timeout");
    });
    expect(screen.getByText("Response timed out")).toBeTruthy();
    expect(
      screen.getByLabelText(/Reading light. Response timed out/),
    ).toHaveProp("accessibilityLiveRegion", "polite");
  });

  test.each(["activeHomeId", "activeMemberId", "authenticatedUserId"] as const)(
    "changing %s closes activity and clears old names",
    (field) => {
      const screen = render(<AppShell />);
      act(() => {
        submit(admit());
      });
      fireEvent.press(screen.getByLabelText("Open activity"));
      act(() => {
        useHomeStore.setState({ [field]: "different" });
      });
      expect(screen.queryByText("Command activity")).toBeNull();
      expect(screen.queryByText("Reading light")).toBeNull();
      expect(screen.getByText("0 recent")).toBeTruthy();
    },
  );

  test("reset closes an open dialog and clears local notice state", () => {
    const screen = render(<AppShell />);
    act(() => {
      submit(admit());
    });
    fireEvent.press(screen.getByLabelText("Open activity"));
    act(() => {
      mockProgress.reset();
    });
    expect(screen.queryByText("Command activity")).toBeNull();
    expect(screen.queryByTestId("command-delivery-notice")).toBeNull();
    expect(screen.getByText("0 recent")).toBeTruthy();
  });

  test("re-enabling the same scope cannot reopen a previously gated dialog", () => {
    const screen = render(<AppShell />);
    act(() => {
      submit(admit());
    });
    fireEvent.press(screen.getByLabelText("Open activity"));
    screen.rerender(<AppShell enabled={false} />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("Reading light")).toBeNull();
    screen.rerender(<AppShell />);
    expect(screen.queryByText("Command activity")).toBeNull();
    expect(screen.getByText("0 recent")).toBeTruthy();
  });
});
