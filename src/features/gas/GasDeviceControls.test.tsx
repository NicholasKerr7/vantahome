import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { useHomeStore } from "../../store/useHomeStore";
import GasDeviceControls from "./GasDeviceControls";
import { createGasDemoDevices } from "./gasDemoDevices";

const seed = useHomeStore.getState();
let mounted: ReactTestRenderer | undefined;
type ControlNode = { props: { accessibilityLabel?: string; onPress?: unknown } };

/** Feed live local demo values into the panel exactly as the detail screen does. */
function Panel({ id }: { id: string }) {
  const device = useHomeStore((state) => state.devices.find((candidate) => candidate.id === id)!);
  return <GasDeviceControls device={device} />;
}

/** Activate a named native button without relying on implementation component names. */
function press(tree: ReactTestRenderer, label: string): void {
  const button = tree.root.findAll((node: ControlNode) => node.props.accessibilityLabel === label && typeof node.props.onPress === "function")[0];
  expect(button).toBeDefined();
  act(() => button.props.onPress());
}

beforeEach(() => {
  useHomeStore.setState({
    ...seed, accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null,
    realtime: { enabled: false, useMqtt: false, wsUrl: "" }, activeMemberId: "gas-owner",
    household: [{ id: "gas-owner", name: "Demo", role: "Owner", status: "home", avatarColor: "#000000" }],
    devices: createGasDemoDevices(),
  });
});
afterEach(() => {
  act(() => { mounted?.unmount(); });
  mounted = undefined;
  useHomeStore.setState(seed);
});

test("meter pages separate scenarios and preferences, with live canonical sample values", () => {
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(<Panel id="d40" />); mounted = tree; });
  expect(tree.root.findAllByProps({ accessibilityLabel: "Simulate usage" })).toHaveLength(0);
  press(tree, "Scenarios gas controls");
  press(tree, "Simulate usage");
  expect(useHomeStore.getState().devices[0].gasRemainingKg).toBe(8.5);
  press(tree, "Overview gas controls");
  expect(JSON.stringify(tree.toJSON())).toContain("68 % remaining");
  press(tree, "Budget gas controls");
  expect(tree.root.findAllByProps({ accessibilityLabel: "Usage budget alerts" })).toHaveLength(0);
  press(tree, "Alerts gas controls");
  press(tree, "Usage budget alerts");
  expect(useHomeStore.getState().devices[0].gasUsageAlerts).toBe(false);
});

test("silencing leaves the active leak visible and actions disable after scope changes", () => {
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(<Panel id="d41" />); mounted = tree; });
  press(tree, "Scenarios gas controls");
  press(tree, "Simulate a leak");
  press(tree, "Silence demo alarm");
  expect(JSON.stringify(tree.toJSON())).toContain("Leak preview · sound silenced");
  expect(useHomeStore.getState().devices[1].gasLeakDetected).toBe(true);
  act(() => { useHomeStore.setState({ accountUserId: "real-account" }); });
  const action = tree.root.findAll((node: ControlNode) => node.props.accessibilityLabel === "Clear leak scenario" && typeof node.props.onPress === "function")[0];
  expect(action.props.disabled).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain("offline Owner demo");
});
