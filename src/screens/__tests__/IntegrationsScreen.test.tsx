import React from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import IntegrationsScreen from "../IntegrationsScreen";
import Pressable from "../../components/Pressable";
import { useHomeStore } from "../../store/useHomeStore";
import { HubPreparation } from "../../features/integrations/HubPreparation";
import ModalCard from "../../components/ModalCard";

const mockConfiguration = jest.fn(() => null as object | null);
const mockLink = jest.fn(async () => "authorization-saved");
const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
let mockAllowTools = true;
let mockDimensions = { width: 834, height: 1194, scale: 1, fontScale: 1 };

jest.mock("../../features/integrations/voiceLinkService", () => ({
  getVoiceLinkConfiguration: () => mockConfiguration(),
  linkVoiceAccount: () => mockLink(),
}));
jest.mock("../../services/supabaseClient", () => ({ supabase: null }));
jest.mock("../../config/runtimeMode", () => ({ runtimePolicy: { allowUnauthenticatedDemo: true, get allowDirectMqtt() { return mockAllowTools; } } }));
jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View, useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockDimensions }));

const seed = useHomeStore.getState();
type AccessibleNode = { props: { accessibilityLabel?: string; children?: unknown; disabled?: boolean; onPress?: () => void } };

/** Render only public controls; no browser or external provider is contacted. */
function renderScreen() {
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(<IntegrationsScreen navigation={{ navigate: mockNavigate, dispatch: mockDispatch, goBack: jest.fn() } as never} route={{ key: "integrations", name: "Integrations" }} />); });
  return tree;
}

/** Select a visible control by the same accessible name exposed to assistive technology. */
function control(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(Pressable).find((node: AccessibleNode) => node.props.accessibilityLabel === label)!;
}

describe("Integrations screen", () => {
  let tree: ReactTestRenderer | undefined;
  beforeEach(() => {
    jest.clearAllMocks();
    mockAllowTools = true;
    mockDimensions = { width: 834, height: 1194, scale: 1, fontScale: 1 };
    mockConfiguration.mockReturnValue(null);
    useHomeStore.setState({ ...seed, integrations: { alexa: { status: "not-linked" }, google: { status: "not-linked" }, homekit: { status: "not-linked" }, matter: { status: "not-linked" } }, authenticatedUserId: null, membershipReady: true });
  });
  afterEach(() => { if (tree) act(() => tree?.unmount()); tree = undefined; });

  it("uses bounded pages instead of a vertical scroll and disables unconfigured linking", () => {
    tree = renderScreen();
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(control(tree, "Authorize Amazon Alexa").props.disabled).toBe(true);
    expect(mockLink).not.toHaveBeenCalled();
  });

  it("returns directly to the existing 3D home from any integration entry point", () => {
    tree = renderScreen();
    act(() => control(tree!, "Back to home").props.onPress());
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ name: "Main", params: expect.objectContaining({ screen: "Home" }), pop: true }) }));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("keeps planned providers unavailable even if an old record says linked", () => {
    useHomeStore.setState({ integrations: { ...seed.integrations, homekit: { status: "linked" } } });
    tree = renderScreen();
    act(() => control(tree!, "Apple Home").props.onPress());
    expect(tree.root.findAllByType(Text).some((node: AccessibleNode) => node.props.children === "Planned")).toBe(true);
    expect(control(tree, "Authorize Apple Home")).toBeUndefined();
  });

  it("exposes development tools only on the bridge page", () => {
    tree = renderScreen();
    act(() => control(tree!, "Vanta Bridge").props.onPress());
    act(() => control(tree!, "Open development connection tools").props.onPress());
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ name: "Main", params: expect.objectContaining({ screen: "Settings" }), pop: true }) }));
  });

  it("hides direct connection tools outside development-capable runtimes", () => {
    mockAllowTools = false;
    tree = renderScreen();
    act(() => control(tree!, "Vanta Bridge").props.onPress());
    expect(control(tree, "Open development connection tools")).toBeUndefined();
  });

  it('opens every hub preparation step without changing pairing, execution, account or integration state', () => {
    const before = useHomeStore.getState();
    tree = renderScreen();
    act(() => control(tree!, 'Vanta Bridge').props.onPress());
    act(() => control(tree!, 'Prepare home hub').props.onPress());
    const hasText = (text: string) => tree!.root.findAllByType(Text).some((node: AccessibleNode) => node.props.children === text);
    expect(hasText('Your preview is ready')).toBe(true);
    expect(control(tree, 'Previous preparation step').props.disabled).toBe(true);
    act(() => control(tree!, 'Next preparation step').props.onPress());
    expect(hasText('Prepare a local home hub')).toBe(true);
    act(() => control(tree!, 'Next preparation step').props.onPress());
    expect(hasText('Link, review, then activate')).toBe(true);
    act(() => control(tree!, 'Previous preparation step').props.onPress());
    expect(hasText('Prepare a local home hub')).toBe(true);
    act(() => control(tree!, 'Next preparation step').props.onPress());
    act(() => control(tree!, 'Finish preparation guide').props.onPress());
    expect(tree.root.findAllByType(HubPreparation)).toHaveLength(0);
    expect(useHomeStore.getState()).toBe(before);
    expect(mockLink).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
    act(() => control(tree!, 'Prepare home hub').props.onPress());
    expect(hasText('Your preview is ready')).toBe(true);
  });

  it.each(['button', 'dismiss'] as const)('starts at step one after closing via %s', (method) => {
    tree = renderScreen();
    act(() => control(tree!, 'Vanta Bridge').props.onPress());
    act(() => control(tree!, 'Prepare home hub').props.onPress());
    act(() => control(tree!, 'Next preparation step').props.onPress());
    act(() => {
      if (method === 'button') control(tree!, 'Close preparation guide').props.onPress();
      else tree!.root.findByType(ModalCard).props.onRequestClose();
    });
    expect(tree.root.findAllByType(HubPreparation)).toHaveLength(0);
    act(() => control(tree!, 'Prepare home hub').props.onPress());
    expect(control(tree, 'Previous preparation step').props.disabled).toBe(true);
    expect(tree.root.findAllByType(Text).some((node: AccessibleNode) => node.props.children === 'Your preview is ready')).toBe(true);
  });

  it('keeps short-phone guide navigation outside bounded, momentum-enabled copy without motion', () => {
    mockDimensions = { width: 320, height: 562, scale: 1, fontScale: 1.6 };
    tree = renderScreen();
    act(() => control(tree!, 'Vanta Bridge').props.onPress());
    expect(control(tree, 'Prepare home hub')).toBeDefined();
    expect(control(tree, 'Open development connection tools')).toBeUndefined();
    act(() => control(tree!, 'Prepare home hub').props.onPress());
    const modal = tree.root.findByType(ModalCard);
    expect(StyleSheet.flatten(modal.props.cardStyle).maxHeight).toBe(506);
    expect(modal.props.animationType).toBe('none');
    const copy = tree.root.findByType(ScrollView);
    expect(copy.props.bounces).toBe(false);
    expect(copy.props.overScrollMode).toBe('never');
    expect(copy.findAllByType(Pressable)).toHaveLength(0);
    expect(StyleSheet.flatten(control(tree, 'Next preparation step').props.style).minHeight).toBeGreaterThanOrEqual(44);
    act(() => control(tree!, 'Close preparation guide').props.onPress());
    act(() => control(tree!, 'Show integration setup details').props.onPress());
    expect(control(tree, 'Open development connection tools')).toBeDefined();
    expect(control(tree, 'Prepare home hub')).toBeUndefined();
    act(() => control(tree!, 'Show integration overview').props.onPress());
    expect(control(tree, 'Prepare home hub')).toBeDefined();
  });

  it('keeps preparation available in short-phone setup details when development tools are unavailable', () => {
    mockDimensions = { width: 320, height: 562, scale: 1, fontScale: 1 };
    mockAllowTools = false;
    tree = renderScreen();
    act(() => control(tree!, 'Vanta Bridge').props.onPress());
    act(() => control(tree!, 'Show integration setup details').props.onPress());
    expect(control(tree, 'Prepare home hub')).toBeDefined();
    expect(control(tree, 'Open development connection tools')).toBeUndefined();
  });

  it("keeps saved authorization distinct from a provider connection", () => {
    useHomeStore.setState({ integrations: { ...seed.integrations, alexa: { status: "linked" } } });
    tree = renderScreen();
    expect(tree.root.findAllByType(Text).some((node: AccessibleNode) => node.props.children === "Authorization saved")).toBe(true);
    expect(control(tree, "Remove Amazon Alexa authorization")).toBeDefined();
  });

  it("runs configured authorization only for an authenticated household", async () => {
    mockConfiguration.mockReturnValue({});
    useHomeStore.setState({ authenticatedUserId: "owner", activeHomeId: "home", activeMemberId: "member", membershipReady: true });
    tree = renderScreen();
    expect(control(tree, "Authorize Amazon Alexa").props.disabled).toBe(false);
    await act(async () => { await control(tree!, "Authorize Amazon Alexa").props.onPress(); });
    expect(mockLink).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(Text).some((node: AccessibleNode) => String(node.props.children).includes("Provider verification and device control are still pending"))).toBe(true);
  });

  it("does not clear another session’s authorization from an old confirmation dialog", () => {
    useHomeStore.setState({ authenticatedUserId: "owner", activeHomeId: "home", activeMemberId: "member", membershipReady: true, integrations: { ...seed.integrations, alexa: { status: "linked" } } });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    tree = renderScreen();
    act(() => control(tree!, "Remove Amazon Alexa authorization").props.onPress());
    const confirm = alert.mock.calls[0][2]?.find((button) => button.text === "Remove")?.onPress;
    expect(confirm).toBeDefined();
    act(() => { useHomeStore.setState({ sessionEpoch: seed.sessionEpoch + 1 }); });
    act(() => { confirm?.(); });
    expect(useHomeStore.getState().integrations.alexa.status).toBe("linked");
    alert.mockRestore();
  });
});
