import React from "react";
import { Alert, ScrollView, Switch, Text, TextInput } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import SettingsWorkspace from "./SettingsWorkspace";
import Pressable from "../../components/Pressable";
import { useHomeStore } from "../../store/useHomeStore";

const mockNavigate = jest.fn();
const mockActivity = jest.fn();
const mockBootstrap = jest.fn(async (_home: string): Promise<void> => undefined);
const mockUnsubscribe = jest.fn();
let mockDevelopmentTools = true;

jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);
jest.mock("../../services/supabaseClient", () => ({ supabase: null }));
jest.mock("../../services/cloudRegistry", () => ({ bootstrapHome: (home: string) => mockBootstrap(home) }));
jest.mock("../../services/deviceClient", () => ({ deviceClient: {
  subscribeConnection: () => mockUnsubscribe,
  subscribeRetry: () => mockUnsubscribe,
} }));
jest.mock("../../components/command-feedback/CommandActivityContext", () => ({
  useCommandActivityLauncher: () => ({ count: 4, open: mockActivity }),
}));
jest.mock("../../config/runtimeMode", () => ({ runtimePolicy: {
  mode: "demo", allowUnauthenticatedDemo: true, get allowDirectMqtt() { return mockDevelopmentTools; },
} }));

const seed = useHomeStore.getState();
type TestNode = { props: { accessibilityLabel?: string; children?: unknown; disabled?: boolean; onPress: () => void; onValueChange: (value: boolean) => void; onChangeText: (value: string) => void } };

/** Find the same accessible action exposed to a screen reader. */
function action(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(Pressable).find((node: TestNode) => node.props.accessibilityLabel === label)!;
}

/** Build the settings workspace with isolated local data and no device transport. */
function renderWorkspace() {
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(<SettingsWorkspace />); });
  return tree;
}

describe("architectural settings workspace", () => {
  let tree: ReactTestRenderer | undefined;
  let alert: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockDevelopmentTools = true;
    mockBootstrap.mockResolvedValue(undefined);
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    useHomeStore.setState({ ...seed, profile: { ...seed.profile, homeName: "Test home" }, preferences: { haptics: true, notifications: true }, realtime: { ...seed.realtime, enabled: false, useMqtt: false, wsUrl: "" } });
  });
  afterEach(() => {
    if (tree) act(() => { tree?.unmount(); });
    tree = undefined;
    alert.mockRestore();
  });

  it("keeps categories bounded and preferences connected to the existing store", () => {
    tree = renderWorkspace();
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
    act(() => { action(tree!, "Feel settings").props.onPress(); });
    const switches = tree.root.findAllByType(Switch);
    act(() => { switches.find((node: TestNode) => node.props.accessibilityLabel === "Haptics")!.props.onValueChange(false); });
    act(() => { switches.find((node: TestNode) => node.props.accessibilityLabel === "Notifications")!.props.onValueChange(false); });
    expect(useHomeStore.getState().preferences).toEqual({ haptics: false, notifications: false });
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
  });

  it("preserves profile, integrations and both activity destinations", () => {
    tree = renderWorkspace();
    act(() => { action(tree!, "Edit profile").props.onPress(); });
    expect(mockNavigate).toHaveBeenLastCalledWith("Profile");
    act(() => { action(tree!, "Voice settings").props.onPress(); });
    act(() => { action(tree!, "Open voice and integrations").props.onPress(); });
    expect(mockNavigate).toHaveBeenLastCalledWith("Integrations");
    act(() => { action(tree!, "Activity settings").props.onPress(); });
    act(() => { action(tree!, "Open command activity").props.onPress(); });
    expect(mockActivity).toHaveBeenCalledTimes(1);
    act(() => { action(tree!, "View activity log").props.onPress(); });
    expect(mockNavigate).toHaveBeenLastCalledWith("AuditLog");
  });

  it("keeps personal settings while removing administrator cards for a room assignee", () => {
    useHomeStore.setState({ activeMemberId: 'tenant', household: [{ id: 'tenant', name: 'Tenant', role: 'Tenant', status: 'home' }] });
    tree = renderWorkspace();
    expect(action(tree!, 'Edit profile')).toBeTruthy();
    expect(action(tree!, 'Initialize cloud home')).toBeUndefined();
    expect(action(tree!, 'Voice settings')).toBeUndefined();
    expect(action(tree!, 'Tools settings')).toBeUndefined();
    expect(action(tree!, 'Weather settings')).toBeUndefined();
    act(() => { action(tree!, 'Activity settings').props.onPress(); });
    expect(action(tree!, 'Open command activity')).toBeTruthy();
    expect(action(tree!, 'View activity log')).toBeUndefined();
  });

  it("exposes property weather only to a verified Owner and removes it immediately after revocation", () => {
    useHomeStore.setState({ authenticatedUserId: 'owner', accountUserId: 'owner', activeHomeId: 'home', accountHomeId: 'home', membershipReady: true,
      activeMemberId: 'owner', household: [{ id: 'owner', name: 'Owner', role: 'Owner', status: 'home' }] });
    tree = renderWorkspace();
    expect(action(tree, 'Weather settings')).toBeTruthy();
    act(() => { action(tree!, 'Weather settings').props.onPress(); });
    act(() => { useHomeStore.setState({ household: [{ id: 'owner', name: 'Admin', role: 'Admin', status: 'home' }] }); });
    expect(action(tree!, 'Weather settings')).toBeUndefined();
    expect(action(tree!, 'Edit profile')).toBeTruthy();
  });

  it("replaces an open administrative category and rejects its retained callback after role revocation", () => {
    tree = renderWorkspace();
    act(() => { action(tree!, 'Voice settings').props.onPress(); });
    const retainedOpen = action(tree!, 'Open voice and integrations').props.onPress;
    act(() => { useHomeStore.setState({ activeMemberId: 'tenant', household: [{ id: 'tenant', name: 'Tenant', role: 'Tenant', status: 'home' }] }); });
    expect(action(tree!, 'Open voice and integrations')).toBeUndefined();
    expect(action(tree!, 'Edit profile')).toBeTruthy();
    act(() => { retainedOpen(); });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("keeps all existing development controls on short connection pages", () => {
    tree = renderWorkspace();
    act(() => { action(tree!, "Tools settings").props.onPress(); });
    const switches = tree.root.findAllByType(Switch);
    act(() => { switches.find((node: TestNode) => node.props.accessibilityLabel === "Enable realtime")!.props.onValueChange(true); });
    act(() => { switches.find((node: TestNode) => node.props.accessibilityLabel === "Use MQTT bridge")!.props.onValueChange(true); });
    act(() => { tree!.root.findByType(TextInput).props.onChangeText("ws://localhost:9000"); });
    expect(useHomeStore.getState().realtime).toMatchObject({ enabled: true, useMqtt: true, wsUrl: "ws://localhost:9000" });
    for (let page = 1; page < 4; page += 1) {
      act(() => { action(tree!, "Next connection page").props.onPress(); });
      expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
    }
    expect(action(tree, "Next connection page").props.disabled).toBe(true);
    expect(tree.root.findAllByType(Text).some((node: TestNode) => String(node.props.children).includes("Never expose an anonymous MQTT broker"))).toBe(true);
  });

  it("does not expose development controls in restricted runtime modes", () => {
    mockDevelopmentTools = false;
    tree = renderWorkspace();
    expect(action(tree, "Tools settings")).toBeUndefined();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it("starts cloud setup once and reports the existing outcome", async () => {
    let finish!: () => void;
    mockBootstrap.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    tree = renderWorkspace();
    const start = action(tree, "Initialize cloud home").props.onPress;
    act(() => { start(); start(); });
    expect(mockBootstrap).toHaveBeenCalledTimes(1);
    expect(mockBootstrap).toHaveBeenCalledWith("Test home");
    await act(async () => { finish(); });
    expect(alert).toHaveBeenCalledWith("Cloud home ready", expect.any(String));
  });

  it("ignores cloud feedback after the account session changes", async () => {
    let finish!: () => void;
    mockBootstrap.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    tree = renderWorkspace();
    act(() => { action(tree!, "Initialize cloud home").props.onPress(); });
    act(() => { useHomeStore.setState({ sessionEpoch: seed.sessionEpoch + 1 }); });
    await act(async () => { finish(); });
    expect(alert).not.toHaveBeenCalled();
  });

  it("shows a fixed recoverable cloud error without exposing service details", async () => {
    mockBootstrap.mockRejectedValue(new Error("private provider details"));
    tree = renderWorkspace();
    await act(async () => { action(tree!, "Initialize cloud home").props.onPress(); });
    expect(alert).toHaveBeenCalledWith("Cloud setup unavailable", expect.not.stringContaining("private provider"));
  });
});
