import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import MemberPermissionEditor from "../MemberPermissionEditor";

jest.mock("@expo/vector-icons/Ionicons", () => require("react-native").View);

/** Navigate the compact permission pages through their accessible actions. */
function findPermission(tree: ReactTestRenderer, label: string) {
  const previous = () => tree.root.findByProps({ accessibilityLabel: "Previous permissions" });
  while (!previous().props.disabled) act(() => previous().props.onPress());
  for (let page = 0; page < 4; page += 1) {
    const found = tree.root.findAllByProps({ accessibilityLabel: label });
    if (found.length) return found[0];
    const next = tree.root.findByProps({ accessibilityLabel: "Next permissions" });
    if (!next.props.disabled) act(() => next.props.onPress());
  }
  throw new Error(`Permission control missing: ${label}`);
}

describe("MemberPermissionEditor", () => {
  test("read-only permissions cannot invoke changes", () => {
    const onChange = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => { tree = renderer.create(<MemberPermissionEditor role="Admin" overrides={[]}
      canChange={(permission) => permission !== "lock.unlock"} onChange={onChange} />); });
    const denied = findPermission(tree, "Unlock doors: Role");
    expect(denied.props.accessibilityState.disabled).toBe(true);
    act(() => denied.props.onPress());
    expect(onChange).not.toHaveBeenCalled();
    expect(findPermission(tree, "Lights: Allow").props.accessibilityState.disabled).toBe(false);
  });
  test("renders role defaults and exposes all three decisions", () => {
    const onChange = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MemberPermissionEditor
          role="Guest"
          overrides={[]}
          onChange={onChange}
        />,
      );
    });

    const allow = findPermission(tree, "Live cameras: Allow");
    expect(allow.props.accessibilityState.selected).toBe(false);
    act(() => allow.props.onPress());
    expect(onChange).toHaveBeenCalledWith("camera.live", true);

    expect(
      tree.root.findByProps({ accessibilityLabel: "Live cameras: Role" }).props
        .accessibilityState.selected,
    ).toBe(true);
    expect(
      tree.root.findByProps({ accessibilityLabel: "Live cameras: Deny" }),
    ).toBeTruthy();
  });

  test("does not render editable controls for the owner", () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MemberPermissionEditor
          role="Owner"
          overrides={[]}
          onChange={jest.fn()}
        />,
      );
    });
    expect(
      tree.root.findAllByProps({ accessibilityLabel: "Live cameras: Deny" }),
    ).toHaveLength(0);
  });
});
