import React from "react";
import { Alert, Text, TextInput } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import ProfileScreen from "../ProfileScreen";
import Pressable from "../../components/Pressable";
import MemberPermissionEditor from "../../components/MemberPermissionEditor";
import { ProfileAvailabilityRow, ProfileToggle } from "../../features/household/ProfileControls";
import { useHomeStore, type HouseholdMember } from "../../store/useHomeStore";

const mockInvite = jest.fn();
const mockListInvites = jest.fn();
const mockConfirm = jest.fn();
const mockSetPermission = jest.fn();
const mockGetSession = jest.fn();
const mockDeleteResult = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();
const mockRespondInvite = jest.fn();
const mockSyncMembership = jest.fn();
const mockApplyMembership = jest.fn();

jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../services/supabaseClient", () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
jest.mock("../../services/cloudRegistry", () => ({
  inviteHomeMember: (...args: unknown[]) => mockInvite(...args),
  listPendingInvites: (...args: unknown[]) => mockListInvites(...args),
  respondHomeInvite: (...args: unknown[]) => mockRespondInvite(...args),
}));
jest.mock("../../services/membership", () => ({
  applyMembershipSnapshot: (...args: unknown[]) => mockApplyMembership(...args),
  syncMembershipFromSupabase: (...args: unknown[]) => mockSyncMembership(...args),
}));
jest.mock("../../services/roomMembers", () => ({ setRoomMembershipRemote: jest.fn() }));
jest.mock("../../services/memberPermissions", () => ({
  setMemberPermissionOverrideRemote: (...args: unknown[]) => mockSetPermission(...args),
}));
jest.mock("../../security/biometricConfirmation", () => ({
  confirmProtectedAccess: (...args: unknown[]) => mockConfirm(...args),
}));
jest.mock("../../config/runtimeMode", () => ({
  runtimePolicy: { allowUnauthenticatedDemo: false },
}));
jest.mock("../../theme/layout", () => ({
  useResponsive: () => ({ width: 390, height: 844, isLandscape: false, isTablet: false, gutter: 22, topPad: 56, scale: 1 }),
}));
jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: "Images" },
}));
jest.mock("../../components/PortraitFrame", () => {
  return function Frame({ children }: { children: React.ReactNode }) { return <>{children}</>; };
});
jest.mock("../../components/LandscapeFrame", () => {
  return function Frame({ children }: { children: React.ReactNode }) { return <>{children}</>; };
});

const owner: HouseholdMember = {
  id: "owner", userId: "10000000-0000-4000-8000-000000000001", name: "Owner", role: "Owner", status: "home",
};
const administrator: HouseholdMember = {
  id: "admin", userId: "10000000-0000-4000-8000-000000000002", name: "Administrator", role: "Admin", status: "home",
};
const peer: HouseholdMember = {
  id: "peer", userId: "10000000-0000-4000-8000-000000000003", name: "Peer administrator", role: "Admin", status: "away",
};
const member: HouseholdMember = {
  id: "member", userId: "10000000-0000-4000-8000-000000000004", name: "Ordinary member", role: "Member", status: "home",
};
const homeId = "20000000-0000-4000-8000-000000000001";
const seed = useHomeStore.getState();
type TestNode = {
  props: {
    accessibilityLabel?: string;
    children?: unknown;
    disabled?: boolean;
    onPress: () => unknown;
    onChangeText: (value: string) => void;
  };
  findAllByType: (component: unknown) => TestNode[];
};
type DeleteQuery = {
  delete: () => DeleteQuery;
  eq: jest.Mock;
  select: () => DeleteQuery;
  maybeSingle: (...args: unknown[]) => unknown;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

describe("Profile household authorization and account isolation", () => {
  let tree: ReactTestRenderer | undefined;
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInvite.mockReset().mockResolvedValue({ status: "pending" });
    mockListInvites.mockReset().mockResolvedValue([]);
    mockRespondInvite.mockReset().mockImplementation(async (inviteId: string) => ({ status: "accepted", inviteId }));
    mockSyncMembership.mockReset().mockResolvedValue({ homeId: "invited-home" });
    mockApplyMembership.mockReset().mockReturnValue(true);
    mockConfirm.mockReset().mockResolvedValue(undefined);
    mockSetPermission.mockReset().mockResolvedValue(undefined);
    mockGetSession.mockReset().mockResolvedValue({ data: { session: { access_token: "fixture-session" } } });
    mockDeleteResult.mockReset().mockResolvedValue({ data: { user_id: member.userId }, error: null });
    const query: DeleteQuery = {
      delete: jest.fn(() => query),
      eq: mockEq.mockImplementation(() => query),
      select: jest.fn(() => query),
      maybeSingle: (...args: unknown[]) => mockDeleteResult(...args),
    };
    mockFrom.mockImplementation(() => query);
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    useHomeStore.setState({
      ...seed,
      authenticatedUserId: owner.userId,
      activeHomeId: homeId,
      activeMemberId: owner.id,
      membershipReady: true,
      household: [owner, administrator, peer, member].map((item) => ({ ...item })),
      rooms: [{ id: "30000000-0000-4000-8000-000000000001", name: "Living room" }],
      devices: [], roomMembers: [], memberPermissionOverrides: [],
    });
  });
  afterEach(() => {
    if (tree) act(() => tree?.unmount());
    tree = undefined;
    alert.mockRestore();
  });

  /** Mount an authenticated profile and optionally use the menu's direct section target. */
  async function mount(actor = owner, section?: "household" | "preferences") {
    useHomeStore.setState({ authenticatedUserId: actor.userId, activeMemberId: actor.id });
    await act(async () => {
      tree = renderer.create(<ProfileScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never} route={{ key: "Profile", name: "Profile", params: section ? { section } : undefined }} />);
    });
    if (!section) await press(button("People"));
    return screenRoot();
  }
  function screenRoot(): TestNode { return tree!.root; }
  function button(label: string, root: TestNode = screenRoot()) {
    return root.findAllByType(Pressable).find((node) => node.props.accessibilityLabel === label)!;
  }
  function roleButtons(label: string) {
    return screenRoot().findAllByType(Pressable).filter((node) =>
      node.findAllByType(Text).some((text) => text.props.children === label));
  }
  async function press(node: TestNode) {
    await act(async () => { node.props.onPress(); });
  }
  /** Follow the member pager rather than assuming every permission form is mounted. */
  async function selectMember(target: HouseholdMember) {
    if (screenRoot().findAllByType(MemberPermissionEditor).length) await press(button("Done"));
    await press(button("Members"));
    while (!button("Previous household member").props.disabled) await press(button("Previous household member"));
    const index = useHomeStore.getState().household.findIndex((item) => item.id === target.id);
    for (let page = 0; page < index; page += 1) await press(button("Next household member"));
  }
  /** Open one member's focused permission sheet through the public interface. */
  async function openPermissions(target: HouseholdMember) {
    await selectMember(target);
    await press(button(`Permissions for ${target.name}`));
    return screenRoot().findAllByType(MemberPermissionEditor)[0];
  }
  /** Locate a permission on its bounded page, preserving disabled-control assertions. */
  async function permissionButton(label: string, editor: TestNode) {
    while (!button("Previous permissions", editor).props.disabled) await press(button("Previous permissions", editor));
    for (let page = 0; page < 4; page += 1) {
      const found = button(label, editor);
      if (found) return found;
      if (!button("Next permissions", editor).props.disabled) await press(button("Next permissions", editor));
    }
    throw new Error(`Permission control missing: ${label}`);
  }
  async function fillInvitation() {
    await press(button("Invite"));
    await act(async () => {
      const inputs = screenRoot().findAllByType(TextInput);
      inputs.find((node) => node.props.accessibilityLabel === "New member name")!.props.onChangeText("Invited person");
      inputs.find((node) => node.props.accessibilityLabel === "New member email")!.props.onChangeText("invitee@example.test");
    });
  }
  /** Existing invite scenarios deliberately choose the test room before submitting. */
  async function reviewInvitation() {
    if (button("Review invitation access")) await press(button("Review invitation access"));
    const roomChoice = button("Invite access to Living room");
    if (roomChoice) await press(roomChoice);
    if (button("Review invitation")) await press(button("Review invitation"));
  }
  function switchHousehold() {
    const nextOwner = { ...owner, id: "next-owner", userId: "10000000-0000-4000-8000-000000000005" };
    const nextMembers = [nextOwner, { ...member, name: "Different home member" }];
    useHomeStore.setState({
      authenticatedUserId: nextOwner.userId, activeMemberId: nextOwner.id,
      activeHomeId: "20000000-0000-4000-8000-000000000002", membershipReady: true,
      household: nextMembers, memberPermissionOverrides: [],
    });
    return nextMembers;
  }

  it("opens the Household shortcut on People and honors a changed section target", async () => {
    await mount(owner, "household");
    expect(button("Members")).toBeDefined();
    expect(button("Save profile")).toBeUndefined();
    await act(async () => {
      tree!.update(<ProfileScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never} route={{ key: "Profile", name: "Profile", params: { section: "preferences" } }} />);
    });
    expect(button("Comfort")).toBeDefined();
    expect(tree!.root.findAllByType(ProfileToggle)).toHaveLength(2);
  });

  it("shows unsupported privacy and report features as read-only explanations without save or switches", async () => {
    await mount(owner, "preferences");
    const before = useHomeStore.getState();
    await press(button("Privacy"));
    expect(tree!.root.findAllByType(ProfileToggle)).toHaveLength(0);
    expect(tree!.root.findAllByType(ProfileAvailabilityRow)).toHaveLength(3);
    expect(button("Save profile")).toBeUndefined();
    expect(screenRoot().findAllByType(Text).some((node) => String(node.props.children).includes("Sensitive actions use separate confirmation"))).toBe(true);
    await press(button("Reports"));
    expect(tree!.root.findAllByType(ProfileToggle)).toHaveLength(0);
    expect(tree!.root.findAllByType(ProfileAvailabilityRow)).toHaveLength(2);
    expect(button("Save profile")).toBeUndefined();
    expect(useHomeStore.getState()).toBe(before);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("retains real saved haptics and notification controls in Comfort", async () => {
    await mount(owner, "preferences");
    const before = useHomeStore.getState().preferences;
    await act(async () => {
      tree!.root.findAllByType(ProfileToggle).find((node: { props: { label: string } }) => node.props.label === "Haptics")!.props.onChange(!before.haptics);
      tree!.root.findAllByType(ProfileToggle).find((node: { props: { label: string } }) => node.props.label === "Notifications")!.props.onChange(!before.notifications);
    });
    expect(useHomeStore.getState().preferences).toEqual({ ...before, haptics: !before.haptics, notifications: !before.notifications });
    expect(button("Save profile")).toBeDefined();
  });

  it("makes an administrator's own and peer permissions/removal read-only while keeping ordinary members manageable", async () => {
    await mount(administrator);
    for (const target of [administrator, peer]) {
      await selectMember(target);
      const remove = button(`Remove ${target.name}`);
      expect(remove.props.disabled).toBe(true);
      await press(remove); // The handler also rejects stale/programmatic callbacks.
      const editor = await openPermissions(target);
      expect(editor.props.disabled).toBe(true);
      const allow = await permissionButton("Unlock doors: Allow", editor);
      expect(allow.props.disabled).toBe(true);
      await press(allow);
    }
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockSetPermission).not.toHaveBeenCalled();
    await selectMember(member);
    expect(button(`Remove ${member.name}`).props.disabled).toBe(false);
    const ordinaryEditor = await openPermissions(member);
    expect(ordinaryEditor.props.disabled).toBe(false);
    await press(await permissionButton("Lights: Allow", ordinaryEditor));
    expect(mockSetPermission).toHaveBeenCalledWith(member.userId, "light.control", true);
    await press(button("Done"));
    await press(button("Invite"));
    expect(roleButtons("Admin")).toHaveLength(0);
  });

  it("does not let a restricted administrator delegate the denied permission", async () => {
    useHomeStore.setState({ memberPermissionOverrides: [{ memberId: administrator.id, permission: "lock.unlock", allowed: false }] });
    await mount(administrator);
    const ordinaryEditor = await openPermissions(member);
    const allow = await permissionButton("Unlock doors: Allow", ordinaryEditor);
    expect(allow.props.disabled).toBe(true);
    await press(allow);
    expect(mockSetPermission).not.toHaveBeenCalled();
    expect((await permissionButton("Lights: Allow", ordinaryEditor)).props.disabled).toBe(false);
  });

  it("allows the owner to send an administrator invitation without creating accepted local membership", async () => {
    await mount();
    const initial = useHomeStore.getState().household;
    await fillInvitation();
    expect(roleButtons("Admin")).toHaveLength(1);
    await press(roleButtons("Admin")[0]);
    await reviewInvitation();
    await press(button("Invite member"));
    expect(mockInvite).toHaveBeenCalledWith(
      expect.objectContaining({ email: "invitee@example.test", role: "admin" }),
      owner.userId,
    );
    expect(useHomeStore.getState().household).toEqual(initial);
    expect(alert).toHaveBeenCalledWith("Invitation ready", expect.stringContaining("sign in and open People"));
  });

  it("requires deliberately selected rooms and sends the reviewed guest deadline", async () => {
    useHomeStore.setState({ rooms: [
      { id: "30000000-0000-4000-8000-000000000001", name: "Living room" },
      { id: "30000000-0000-4000-8000-000000000002", name: "Guest bedroom" },
    ] });
    await mount();
    await fillInvitation();
    await press(button("Review invitation access"));
    expect(button("Review invitation").props.disabled).toBe(true);
    expect(button("Invite member")).toBeUndefined();
    await press(button("Review invitation"));
    expect(mockInvite).not.toHaveBeenCalled();
    await press(button("Invite access to Guest bedroom"));
    expect(screenRoot().findAllByType(Text).some((node) => node.props.children === "1 room selected")).toBe(true);
    await press(button("Review invitation"));
    expect(button("Invite access to Guest bedroom")).toBeUndefined();
    await press(button("Guest access: 24 hours"));
    expect(button("Invite member").props.disabled).toBe(false);
    const before = Date.now();
    await press(button("Invite member"));
    const payload = mockInvite.mock.calls[0][0];
    expect(payload.roomIds).toEqual(["30000000-0000-4000-8000-000000000002"]);
    expect(Date.parse(payload.accessExpiresAt)).toBeGreaterThanOrEqual(before + 86400000);
    expect(Date.parse(payload.accessExpiresAt)).toBeLessThanOrEqual(Date.now() + 86400000);
  });

  it("rechecks invitation privileges after protected confirmation", async () => {
    const confirmation = deferred<void>();
    mockConfirm.mockReturnValueOnce(confirmation.promise);
    await mount();
    await fillInvitation();
    await reviewInvitation();
    await press(button("Invite member"));
    act(() => { useHomeStore.setState({ household: [{ ...owner, role: "Guest" }] }); });
    await act(async () => { confirmation.resolve(); });
    expect(mockInvite).not.toHaveBeenCalled();
  });

  it("keeps rejected cloud invitations out of local household membership", async () => {
    mockInvite.mockRejectedValueOnce(new Error("Invitation refused"));
    await mount();
    const initial = useHomeStore.getState().household;
    await fillInvitation();
    await reviewInvitation();
    await press(button("Invite member"));
    expect(mockInvite).toHaveBeenCalledTimes(1);
    expect(useHomeStore.getState().household).toEqual(initial);
    expect(alert).toHaveBeenCalledWith("Invitation not sent", "Invitation refused");
  });

  it("does not create a local invitation when the cloud session has expired", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    await mount();
    const initial = useHomeStore.getState().household;
    await fillInvitation();
    await reviewInvitation();
    await press(button("Invite member"));
    expect(mockInvite).not.toHaveBeenCalled();
    expect(useHomeStore.getState().household).toEqual(initial);
    expect(alert).toHaveBeenCalledWith("Sign in required", expect.any(String));
  });

  it("waits for an authoritative deleted row before removing a cloud member", async () => {
    const deletion = deferred<{ data: { user_id: string | undefined }; error: null }>();
    mockDeleteResult.mockReturnValueOnce(deletion.promise);
    await mount(administrator);
    await selectMember(member);
    await press(button(`Remove ${member.name}`));
    expect(mockFrom).toHaveBeenCalledWith("home_members");
    expect(mockEq).toHaveBeenCalledWith("home_id", homeId);
    expect(mockEq).toHaveBeenCalledWith("user_id", member.userId);
    expect(useHomeStore.getState().household).toContainEqual(member);
    await act(async () => { deletion.resolve({ data: { user_id: member.userId }, error: null }); });
    expect(useHomeStore.getState().household.some((item) => item.id === member.id)).toBe(false);
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: "denied" } },
  ])("preserves membership when cloud deletion returns no authorized row (%#)", async (result) => {
    mockDeleteResult.mockResolvedValueOnce(result);
    await mount();
    await selectMember(member);
    await press(button(`Remove ${member.name}`));
    expect(useHomeStore.getState().household).toContainEqual(member);
    expect(alert).toHaveBeenCalledWith("Member not removed", expect.any(String));
  });

  it("ignores a completed deletion after changing account and home", async () => {
    const deletion = deferred<{ data: { user_id: string | undefined }; error: null }>();
    mockDeleteResult.mockReturnValueOnce(deletion.promise);
    await mount();
    await selectMember(member);
    await press(button(`Remove ${member.name}`));
    let nextMembers: HouseholdMember[] = [];
    await act(async () => { nextMembers = switchHousehold(); });
    await act(async () => { deletion.resolve({ data: { user_id: member.userId }, error: null }); });
    expect(useHomeStore.getState().household).toEqual(nextMembers);
    expect(alert).not.toHaveBeenCalled();
  });

  it("ignores an invitation response after changing account and home", async () => {
    const invitation = deferred<{ status: string }>();
    mockInvite.mockReturnValueOnce(invitation.promise);
    await mount();
    await fillInvitation();
    await reviewInvitation();
    await press(button("Invite member"));
    expect(mockInvite).toHaveBeenCalledTimes(1);
    let nextMembers: HouseholdMember[] = [];
    await act(async () => { nextMembers = switchHousehold(); });
    await act(async () => { invitation.resolve({ status: "pending" }); });
    expect(useHomeStore.getState().household).toEqual(nextMembers);
    expect(mockListInvites).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it("does not render another account's delayed invitation list", async () => {
    const invitations = deferred<Array<{ id: string; role: string; email: string }>>();
    mockListInvites.mockReturnValueOnce(invitations.promise);
    await mount();
    await act(async () => { switchHousehold(); });
    await act(async () => {
      invitations.resolve([{ id: "old-account-invitation", role: "guest", email: "previous-account@example.test" }]);
    });
    expect(screenRoot().findAllByType(Text).some((node) => node.props.children === "previous-account@example.test")).toBe(false);
  });

  it("submits one invitation response and disables both decisions while it is pending", async () => {
    const response = deferred<{ status: string; inviteId: string }>();
    mockRespondInvite.mockReturnValueOnce(response.promise);
    mockListInvites.mockResolvedValueOnce([{ id: "incoming", home_id: "invited-home", home_name: "Hopewell", role: "guest", email: "owner@example.test" }]);
    await mount();
    await press(button("Inbox"));
    expect(screenRoot().findAllByType(Text).some((node) => node.props.children === "Hopewell")).toBe(true);
    const accept = button("Accept");
    const decline = button("Decline");
    await act(async () => { accept.props.onPress(); accept.props.onPress(); decline.props.onPress(); });
    expect(mockRespondInvite).toHaveBeenCalledTimes(1);
    expect(button("Accept").props.disabled).toBe(true);
    expect(button("Decline").props.disabled).toBe(true);
    await act(async () => { response.resolve({ status: "accepted", inviteId: "incoming" }); });
    expect(mockSyncMembership).toHaveBeenCalledWith(owner.userId, "invited-home");
    expect(button("Accept")).toBeUndefined();
  });

  it("retries only home synchronization after acceptance succeeds but registry refresh fails", async () => {
    mockListInvites.mockResolvedValueOnce([{ id: "incoming", home_id: "invited-home", home_name: "Hopewell", role: "guest", email: "owner@example.test" }]);
    mockSyncMembership.mockRejectedValueOnce(new Error("Registry offline"));
    await mount();
    await press(button("Inbox"));
    await press(button("Accept"));
    expect(mockRespondInvite).toHaveBeenCalledTimes(1);
    expect(button("Decline").props.disabled).toBe(true);
    expect(button("Retry home access").props.disabled).toBe(false);
    await press(button("Decline"));
    expect(mockRespondInvite).toHaveBeenCalledTimes(1);
    await press(button("Retry home access"));
    expect(mockRespondInvite).toHaveBeenCalledTimes(1);
    expect(mockSyncMembership).toHaveBeenCalledTimes(2);
    expect(button("Retry home access")).toBeUndefined();
  });

  it("does not install membership from an invitation accepted after changing accounts", async () => {
    const response = deferred<{ status: string; inviteId: string }>();
    mockRespondInvite.mockReturnValueOnce(response.promise);
    mockListInvites.mockResolvedValueOnce([{ id: "incoming", home_id: "invited-home", home_name: "Hopewell", role: "guest", email: "owner@example.test" }]);
    await mount();
    await press(button("Inbox"));
    await press(button("Accept"));
    await act(async () => { switchHousehold(); });
    await act(async () => { response.resolve({ status: "accepted", inviteId: "incoming" }); });
    expect(mockSyncMembership).not.toHaveBeenCalled();
    expect(mockApplyMembership).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  it("does not install home access when the server responds for a different invitation", async () => {
    mockListInvites.mockResolvedValueOnce([{ id: "incoming", home_id: "invited-home", home_name: "Hopewell", role: "guest", email: "owner@example.test" }]);
    mockRespondInvite.mockResolvedValueOnce({ status: "accepted", inviteId: "different-invitation" });
    await mount();
    await press(button("Inbox"));
    await press(button("Accept"));
    expect(mockSyncMembership).not.toHaveBeenCalled();
    expect(mockApplyMembership).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("Invite response failed", expect.stringContaining("not confirmed"));
    expect(button("Accept").props.disabled).toBe(false);
  });

  it("reports an unavailable invitation inbox and retries without claiming it is empty", async () => {
    mockListInvites.mockRejectedValueOnce(new Error("RPC migration unavailable"));
    await mount();
    await press(button("Inbox"));
    expect(screenRoot().findAllByType(Text).some((node) => node.props.children === "No pending invites.")).toBe(false);
    expect(button("Retry invitation inbox")).toBeDefined();
    await press(button("Retry invitation inbox"));
    expect(mockListInvites).toHaveBeenCalledTimes(2);
    expect(button("Retry invitation inbox")).toBeUndefined();
    expect(screenRoot().findAllByType(Text).some((node) => node.props.children === "No pending invites.")).toBe(true);
  });

  it("does not roll back another account's permission state after a delayed failure", async () => {
    const permission = deferred<void>();
    mockSetPermission.mockReturnValueOnce(permission.promise);
    await mount();
    const ordinaryEditor = await openPermissions(member);
    await press(await permissionButton("Lights: Allow", ordinaryEditor));
    expect(mockSetPermission).toHaveBeenCalledTimes(1);
    await act(async () => { switchHousehold(); });
    await act(async () => { permission.reject(new Error("Old request failed")); });
    expect(useHomeStore.getState().memberPermissionOverrides).toEqual([]);
    expect(alert).not.toHaveBeenCalled();
  });
});
