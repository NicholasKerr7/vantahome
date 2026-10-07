import React from "react";
import { Text, TextInput } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import Pressable from "../../../components/Pressable";
import { GuestAccessDeadline, GuestAccessExtension } from "../GuestAccessExtension";
import { useHomeStore, type HouseholdMember } from "../../../store/useHomeStore";
import { formatGuestAccessDeadline, parseGuestAccessLocalDateTime } from "../../../security/guestAccessExtension";

type TestNode = {
  props: {
    accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean; disabled?: boolean };
    children?: unknown;
    disabled?: boolean;
    onPress: () => unknown;
    onChangeText: (value: string) => void;
  };
};

const mockSave = jest.fn();
const mockCanManage = jest.fn();
const mockClose = jest.fn();

jest.mock("../../../services/guestAccessExtension", () => ({
  canManageGuestAccessExtension: (...args: unknown[]) => mockCanManage(...args),
  saveGuestAccessExtension: (...args: unknown[]) => mockSave(...args),
}));
jest.mock("../../../services/supabaseClient", () => ({ supabase: {} }));
jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const initialState = useHomeStore.getState();
const NOW = Date.parse("2026-10-07T12:00:00.000Z");
const currentExpiry = "2026-10-08T12:00:00.000Z";
const extendedExpiry = "2026-10-09T12:00:00.000Z";
const guest: HouseholdMember = {
  id: "guest", userId: "guest", name: "Avery", role: "Guest", status: "away",
  accessExpiresAt: currentExpiry, shareInteriorLayout: true,
};
const owner: HouseholdMember = { id: "owner", userId: "owner", name: "Owner", role: "Owner", status: "home" };

/** Keep the panel connected to membership changes just as the Household workspace is. */
function ExtensionHarness() {
  const member = useHomeStore((state) => state.household.find((item) => item.id === guest.id));
  return member ? <GuestAccessExtension member={member} roomNames={["Living room", "Kitchen"]} onClose={mockClose} /> : null;
}

/** Hold server verification open to exercise duplicate presses and stale-account replies. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (failure: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

describe("Guest access extension presentation", () => {
  let tree: ReactTestRenderer;
  let clock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    clock = jest.spyOn(Date, "now").mockReturnValue(NOW);
    mockCanManage.mockReset().mockReturnValue(true);
    mockSave.mockReset().mockImplementation(async () => {
      useHomeStore.setState((state) => ({ household: state.household.map((member) => member.id === guest.id
        ? { ...member, accessExpiresAt: extendedExpiry, shareInteriorLayout: false } : member) }));
      return extendedExpiry;
    });
    useHomeStore.setState({
      ...initialState, authenticatedUserId: "owner", accountUserId: "owner", accountHomeId: "home",
      activeHomeId: "home", activeMemberId: "owner", membershipReady: true,
      household: [owner, guest],
    });
  });
  afterEach(() => {
    if (tree) act(() => tree.unmount());
    clock.mockRestore();
  });

  /** Open the mounted sheet without involving unrelated profile screens or network data. */
  function mount() { act(() => { tree = renderer.create(<ExtensionHarness />); }); }
  /** Find the custom touch target, avoiding duplicate React Native host nodes. */
  function button(label: string) {
    return tree.root.findAllByType(Pressable).find((node: TestNode) => node.props.accessibilityLabel === label)!;
  }
  /** Collect displayed native text for security explanations and server status assertions. */
  function textContent() {
    return tree.root.findAllByType(Text).map((node: TestNode) => node.props.children).join(" ");
  }
  /** Set a public date field rather than modifying component state directly. */
  function input(label: string, value: string) {
    act(() => tree.root.findAllByType(TextInput).find((node: TestNode) => node.props.accessibilityLabel === label)!.props.onChangeText(value));
  }
  /** Await a user action and all immediately settled service callbacks. */
  async function press(label: string) { await act(async () => { await button(label).props.onPress(); }); }

  it("requires review before extending and shows only the verified saved deadline", async () => {
    mount();
    expect(button("Add 24 hours of guest access").props.accessibilityState.selected).toBe(true);
    await press("Review change");
    expect(mockSave).not.toHaveBeenCalled();
    expect(textContent()).toContain(formatGuestAccessDeadline(extendedExpiry));
    expect(textContent()).toContain("Living room · Kitchen");
    expect(textContent()).toContain("Interior layout sharing will turn off");
    expect(textContent()).toContain("This replaces any pending invitation");
    await press("Extend access");
    expect(mockSave).toHaveBeenCalledWith("guest", { expectedExpiresAt: currentExpiry, durationHours: 24 });
    expect(textContent()).toContain("Their stay, extended.");
    expect(textContent()).toContain("Confirmed access until");
    expect(textContent()).not.toContain("Their deadline changed while you were reviewing");
    await press("Done");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("renews expired access from confirmation time without another invitation", async () => {
    const expired = "2026-10-06T12:00:00.000Z";
    useHomeStore.setState({ household: [owner, { ...guest, accessExpiresAt: expired }] });
    mount();
    expect(textContent()).toContain("Previous access ended");
    await press("Add 1 hour of guest access");
    await press("Review change");
    expect(textContent()).toContain("starts when confirmed");
    expect(textContent()).toContain(formatGuestAccessDeadline("2026-10-07T13:00:00.000Z"));
    await press("Renew access");
    expect(mockSave).toHaveBeenCalledWith("guest", { expectedExpiresAt: expired, durationHours: 1 });
    expect(textContent()).toContain("Welcome back.");
    expect(textContent()).toContain("No new invitation or acceptance is needed");
  });

  it("accepts an explicit local custom deadline and requires a second confirmation", async () => {
    mount();
    await press("Choose a custom access end date");
    input("Guest access end date", "2026-10-14");
    input("Guest access end time", "18:30");
    await press("Review change");
    expect(mockSave).not.toHaveBeenCalled();
    expect(textContent()).toContain(formatGuestAccessDeadline(parseGuestAccessLocalDateTime("2026-10-14", "18:30")));
    await press("Extend access");
    expect(mockSave).toHaveBeenCalledWith("guest", { expectedExpiresAt: currentExpiry, expiresAt: parseGuestAccessLocalDateTime("2026-10-14", "18:30") });
  });

  it.each([
    ["2026-02-30", "18:30", "valid local date and time"],
    ["2026-10-07", "00:00", "after now and the current access deadline"],
    ["2028-10-14", "18:30", "within the next 365 days"],
  ])("keeps invalid custom input on the choice step: %s", async (date, time, message) => {
    mount();
    await press("Choose a custom access end date");
    input("Guest access end date", date);
    input("Guest access end time", time);
    await press("Review change");
    expect(textContent()).toContain(message);
    expect(button("Review change")).toBeDefined();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("keeps a failed reviewed change retryable without claiming saved access", async () => {
    mockSave.mockRejectedValueOnce(new Error("Connection unavailable. Please try again."));
    mount();
    await press("Review change");
    await press("Extend access");
    expect(textContent()).toContain("Connection unavailable");
    expect(textContent()).not.toContain("Confirmed access until");
    expect(button("Extend access").props.disabled).toBe(false);
    await press("Extend access");
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(textContent()).toContain("Confirmed access until");
  });

  it("latches rapid confirmation presses until the authoritative request settles", async () => {
    const pending = deferred<string>();
    mockSave.mockReturnValue(pending.promise);
    mount();
    await press("Review change");
    const submit = button("Extend access").props.onPress;
    await act(async () => { submit(); submit(); });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(button("Saving…").props.disabled).toBe(true);
    expect(button("Back").props.disabled).toBe(true);
    expect(textContent()).not.toContain("Confirmed access until");
    await act(async () => { pending.resolve(extendedExpiry); });
    expect(textContent()).toContain("Confirmed access until");
  });

  it("rejects a deadline that changed after review and lets the owner review the new value", async () => {
    mount();
    await press("Review change");
    act(() => { useHomeStore.setState({ household: [owner, { ...guest, accessExpiresAt: extendedExpiry }] }); });
    expect(button("Extend access").props.disabled).toBe(true);
    expect(textContent()).toContain("Their deadline changed while you were reviewing");
    expect(mockSave).not.toHaveBeenCalled();
    await press("Back");
    await press("Review change");
    await press("Extend access");
    expect(mockSave.mock.calls[0][1]).toMatchObject({ expectedExpiresAt: extendedExpiry });
  });

  it("honors the service's authority predicate when the Guest or an unauthorized actor opens the sheet", async () => {
    mockCanManage.mockReturnValue(false);
    mount();
    expect(button("Review change").props.disabled).toBe(true);
    await press("Review change");
    expect(button("Extend access")).toBeUndefined();
    expect(mockSave).not.toHaveBeenCalled();
    expect(textContent()).toContain("can no longer be changed from this screen");
  });

  it.each(["success", "failure"])("discards a delayed %s after changing authenticated sessions", async (outcome) => {
    const pending = deferred<string>();
    mockSave.mockReturnValue(pending.promise);
    mount();
    await press("Review change");
    await press("Extend access");
    act(() => { useHomeStore.setState({ sessionEpoch: useHomeStore.getState().sessionEpoch + 1 }); });
    await act(async () => {
      if (outcome === "success") pending.resolve(extendedExpiry);
      else pending.reject(new Error("Private previous-household failure"));
    });
    expect(textContent()).not.toContain("Confirmed access until");
    expect(textContent()).not.toContain("Private previous-household failure");
    expect(button("Extend access").props.disabled).toBe(true);
  });

  it("does not render an extend action for a perpetual or invalid Guest grant", () => {
    act(() => { tree = renderer.create(<GuestAccessDeadline member={{ ...guest, accessExpiresAt: null }} canEdit onPress={mockClose} />); });
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
    expect(textContent()).toContain("No automatic expiry");
    act(() => { tree.update(<GuestAccessDeadline member={{ ...guest, accessExpiresAt: "invalid" }} canEdit onPress={mockClose} />); });
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
    expect(textContent()).toContain("Access unavailable");
  });

  it("shows the exact deadline to a read-only Guest without offering a self-extension", () => {
    act(() => { tree = renderer.create(<GuestAccessDeadline member={guest} canEdit={false} onPress={mockClose} />); });
    expect(textContent()).toContain(formatGuestAccessDeadline(currentExpiry));
    expect(textContent()).not.toContain("Extend");
    expect(tree.root.findAllByType(Pressable)).toHaveLength(0);
  });
});
