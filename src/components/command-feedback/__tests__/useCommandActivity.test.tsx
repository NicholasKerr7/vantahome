import { act, renderHook } from "@testing-library/react-native";
import {
  CommandProgressStore,
  type CommandProgress,
  type CommandProgressEvent,
  type CommandProgressHandle,
} from "../../../services/commandProgress";
import { deviceClient } from "../../../services/deviceClient";
import { useHomeStore } from "../../../store/useHomeStore";
import { getCommandActivityScope, useCommandActivity } from "../useCommandActivity";

let mockProgress: CommandProgressStore;
const mockListeners: Array<(event: CommandProgressEvent) => void> = [];
const mockUnsubscribe = jest.fn();
const mockScopeState = {
  authenticatedUserId: "alice",
  sessionEpoch: 1,
  accountHomeId: "alice-home",
  activeHomeId: "alice-home",
  activeMemberId: "alice-member",
};

jest.mock("../../../store/useHomeStore", () => ({
  useHomeStore: { getState: () => mockScopeState },
}));
jest.mock("../../../services/deviceClient", () => ({
  deviceClient: {
    getCommandHistory: jest.fn(() => mockProgress.getAll()),
    subscribeCommandProgress: jest.fn((listener: (event: CommandProgressEvent) => void) => {
      mockListeners.push(listener);
      const stop = mockProgress.subscribe(listener);
      return () => { mockUnsubscribe(); stop(); };
    }),
  },
}));

/** Create a valid local command without invoking transport or device controls. */
function admit(commandId = "command-a", deviceId = "light-a") {
  return mockProgress.start({
    commandId,
    deviceId,
    createdAt: 1_800_000_000_000,
    expiresAt: 1_800_000_030_000,
  });
}

/** Finish a command so bounded history is allowed to evict it later. */
function submit(handle: CommandProgressHandle) {
  mockProgress.transition(handle, "sending", 1);
  mockProgress.transition(handle, "submitted");
}

/** Resolve the exact scope currently supplied by the mocked account store. */
function currentScope() {
  return getCommandActivityScope(useHomeStore.getState());
}

describe("useCommandActivity", () => {
  afterEach(() => jest.restoreAllMocks());
  beforeEach(() => {
    jest.clearAllMocks();
    mockProgress = new CommandProgressStore();
    mockListeners.length = 0;
    Object.assign(mockScopeState, {
      authenticatedUserId: "alice",
      sessionEpoch: 1,
      accountHomeId: "alice-home",
      activeHomeId: "alice-home",
      activeMemberId: "alice-member",
    });
  });

  test("the scope includes account, home, session and active member boundaries", () => {
    expect(JSON.parse(currentScope())).toEqual([
      "alice", 1, "alice-home", "alice-home", "alice-member",
    ]);
  });

  test("never rehydrates commands admitted before this subscription", () => {
    const previous = admit("previous");
    const onReset = jest.fn();
    const { result } = renderHook(() => useCommandActivity(currentScope(), true, onReset));
    expect(result.current).toEqual([]);
    expect(deviceClient.getCommandHistory).not.toHaveBeenCalled();
    act(() => { submit(previous); });
    expect(result.current).toEqual([]);
    act(() => { admit("current"); });
    expect(result.current.map((command) => command.commandId)).toEqual(["current"]);
  });

  test("follows out-of-order updates using authoritative command identity", () => {
    const onReset = jest.fn();
    const { result } = renderHook(() => useCommandActivity(currentScope(), true, onReset));
    let first!: CommandProgressHandle;
    let second!: CommandProgressHandle;
    act(() => {
      first = admit("first", "light-a");
      second = admit("second", "light-b");
      submit(second);
      mockProgress.transition(first, "sending", 1);
      mockProgress.transition(first, "queued");
    });
    expect(result.current).toMatchObject([
      { commandId: "first", deviceId: "light-a", status: "queued" },
      { commandId: "second", deviceId: "light-b", status: "submitted" },
    ]);
    act(() => {
      mockProgress.transition(first, "retrying", 2);
      mockProgress.transition(first, "submitted");
    });
    expect(result.current[0]).toMatchObject({ status: "submitted", attempts: 2 });
    expect(onReset).not.toHaveBeenCalled();
  });

  test("observes a pending event delivered while subscription is being installed", () => {
    const onReset = jest.fn();
    jest.mocked(deviceClient.subscribeCommandProgress).mockImplementationOnce((listener) => {
      const unsubscribe = mockProgress.subscribe(listener);
      admit("during-subscription");
      return unsubscribe;
    });
    const { result } = renderHook(() => useCommandActivity(currentScope(), true, onReset));
    expect(result.current).toMatchObject([
      { commandId: "during-subscription", status: "pending" },
    ]);
  });

  test("a stale event cannot overwrite the newer authoritative service result", () => {
    const onReset = jest.fn();
    const { result } = renderHook(() => useCommandActivity(currentScope(), true, onReset));
    let stale!: CommandProgress;
    act(() => {
      const handle = admit();
      stale = mockProgress.get("command-a")!;
      submit(handle);
      mockListeners[0]({ type: "updated", command: stale });
    });
    expect(result.current).toMatchObject([
      { status: "submitted", attempts: 1, admissionSequence: 1 },
    ]);
  });

  test("duplicate pending snapshots preserve one stable admission identity", () => {
    const onReset = jest.fn();
    const { result } = renderHook(() => useCommandActivity(currentScope(), true, onReset));
    let handle!: CommandProgressHandle;
    act(() => {
      handle = admit();
      mockListeners[0]({ type: "updated", command: mockProgress.get("command-a")! });
    });
    expect(result.current[0].admissionSequence).toBe(1);
    act(() => {
      submit(handle);
    });
    expect(result.current[0].admissionSequence).toBe(1);
  });

  test("same-clock ID reuse after eviction receives a new UI-only admission identity", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    mockProgress = new CommandProgressStore(1);
    const onReset = jest.fn();
    const { result } = renderHook(() => useCommandActivity(currentScope(), true, onReset));
    act(() => {
      submit(admit("reused"));
    });
    const first = result.current[0];
    act(() => {
      submit(admit("replacement"));
    });
    act(() => {
      submit(admit("reused"));
    });
    expect(result.current).toEqual([{ ...first, admissionSequence: 3 }]);
    expect(mockProgress.get("reused")).not.toHaveProperty("admissionSequence");
  });

  test.each([
    ["authenticatedUserId", "bob"],
    ["sessionEpoch", 2],
    ["accountHomeId", "second-account-home"],
    ["activeHomeId", "second-active-home"],
    ["activeMemberId", "second-member"],
  ] as const)("a %s change cannot revive old commands with reused device IDs", (field, value) => {
    const onReset = jest.fn();
    const rendered: Array<{ scope: string; commands: readonly CommandProgress[] }> = [];
    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => {
        const commands = useCommandActivity(scope, true, onReset);
        rendered.push({ scope, commands });
        return commands;
      },
      { initialProps: { scope: currentScope() } },
    );
    let old!: CommandProgressHandle;
    act(() => { old = admit("old-command", "shared-light"); });
    expect(result.current).toHaveLength(1);
    const oldListener = mockListeners[0];
    Object.assign(mockScopeState, { [field]: value });
    rerender({ scope: currentScope() });
    expect(result.current).toEqual([]);
    // Inspect render-time values too, not only the result after effects flush.
    expect(rendered.filter((snapshot) => snapshot.scope === currentScope())
      .every((snapshot) => snapshot.commands.length === 0)).toBe(true);
    act(() => {
      submit(old);
      oldListener({ type: "updated", command: mockProgress.get("old-command")! });
    });
    expect(result.current).toEqual([]);
    act(() => { admit("new-command", "shared-light"); });
    expect(result.current.map((command) => command.commandId)).toEqual(["new-command"]);
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  test("rejects callbacks from the old scope even before effect cleanup", () => {
    const onReset = jest.fn();
    const { result } = renderHook(() => useCommandActivity(currentScope(), true, onReset));
    mockScopeState.activeHomeId = "other-home";
    act(() => { admit("other-command"); mockProgress.reset(); });
    expect(result.current).toEqual([]);
    expect(onReset).not.toHaveBeenCalled();
    expect(deviceClient.getCommandHistory).not.toHaveBeenCalled();
  });

  test("disable and re-enable discard the previous subscription's admissions", () => {
    const onReset = jest.fn();
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useCommandActivity(currentScope(), enabled, onReset),
      { initialProps: { enabled: true } },
    );
    let old!: CommandProgressHandle;
    act(() => { old = admit(); });
    expect(result.current).toHaveLength(1);
    rerender({ enabled: false });
    expect(result.current).toEqual([]);
    act(() => { admit("while-disabled"); });
    rerender({ enabled: true });
    expect(result.current).toEqual([]);
    act(() => { submit(old); });
    expect(result.current).toEqual([]);
    act(() => { admit("after-enabled"); });
    expect(result.current.map((command) => command.commandId)).toEqual(["after-enabled"]);
  });

  test("reset clears admissions and permits a newly admitted reused command ID", () => {
    const onReset = jest.fn();
    const { result } = renderHook(() => useCommandActivity(currentScope(), true, onReset));
    let old!: CommandProgressHandle;
    act(() => { old = admit(); });
    act(() => { mockProgress.reset(); });
    expect(result.current).toEqual([]);
    expect(onReset).toHaveBeenCalledTimes(1);
    act(() => { submit(old); });
    expect(result.current).toEqual([]);
    act(() => { admit(); });
    expect(result.current).toMatchObject([
      { commandId: "command-a", status: "pending", admissionSequence: 2 },
    ]);
  });

  test("retains no silently evicted history beyond the service's 200-entry bound", () => {
    const onReset = jest.fn();
    const { result } = renderHook(() => useCommandActivity(currentScope(), true, onReset));
    act(() => {
      for (let index = 0; index < 205; index += 1) {
        submit(admit(`command-${index}`));
      }
    });
    expect(result.current).toHaveLength(200);
    expect(result.current.some((command) => command.commandId === "command-0")).toBe(false);
    expect(result.current.at(-1)?.commandId).toBe("command-204");
    expect(result.current.map(({ admissionSequence: _sequence, ...command }) =>
      command,
    )).toEqual(mockProgress.getAll());
    expect(new Set(result.current.map((command) => command.admissionSequence)).size).toBe(200);
    expect(result.current[0].admissionSequence).toBe(6);
    expect(result.current.at(-1)?.admissionSequence).toBe(205);
  });

  test("unmount unsubscribes and ignores a retained callback", () => {
    const onReset = jest.fn();
    const { unmount } = renderHook(() => useCommandActivity(currentScope(), true, onReset));
    const previousListener = mockListeners[0];
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    act(() => { previousListener({ type: "reset" }); });
    expect(onReset).not.toHaveBeenCalled();
    expect(deviceClient.getCommandHistory).not.toHaveBeenCalled();
  });
});
