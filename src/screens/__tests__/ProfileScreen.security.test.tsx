import React from "react";
import { Alert, Text, TextInput } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import ProfileScreen from "../ProfileScreen";
import Pressable from "../../components/Pressable";
import MemberPermissionEditor from "../../components/MemberPermissionEditor";
import { useHomeStore, type HouseholdMember } from "../../store/useHomeStore";

const mockInvite = jest.fn();
const mockListInvites = jest.fn();
const mockConfirm = jest.fn();
const mockSetPermission = jest.fn();
const mockGetSession = jest.fn();
const mockDeleteResult = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();

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
  respondHomeInvite: jest.fn(),
}));
jest.mock("../../services/membership", () => ({
  applyMembershipSnapshot: jest.fn(),
  syncMembershipFromSupabase: jest.fn(),
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

  async function mount(actor = owner) {
    useHomeStore.setState({ authenticatedUserId: actor.userId, activeMemberId: actor.id });
    await act(async () => {
      tree = renderer.create(<ProfileScreen navigation={{ navigate: jest.fn() } as never} route={{ key: "Profile", name: "Profile" } as never} />);
    });
    await press(button("People"));
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
    await press(button("Invite member"));
    expect(mockInvite).toHaveBeenCalledWith(
      expect.objectContaining({ email: "invitee@example.test", role: "admin" }),
      owner.userId,
    );
    expect(useHomeStore.getState().household).toEqual(initial);
    expect(alert).toHaveBeenCalledWith("Invitation sent", expect.any(String));
  });

  it("keeps rejected cloud invitations out of local household membership", async () => {
    mockInvite.mockRejectedValueOnce(new Error("Invitation refused"));
    await mount();
    const initial = useHomeStore.getState().household;
    await fillInvitation();
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
