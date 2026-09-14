import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import MemberPermissionEditor from "../MemberPermissionEditor";

describe("MemberPermissionEditor", () => {
  test("read-only permissions cannot invoke changes", () => {
    const onChange = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => { tree = renderer.create(<MemberPermissionEditor role="Admin" overrides={[]}
      canChange={(permission) => permission !== "lock.unlock"} onChange={onChange} />); });
    const denied = tree.root.findByProps({ accessibilityLabel: "Unlock doors: Role" });
    expect(denied.props.accessibilityState.disabled).toBe(true);
    act(() => denied.props.onPress());
    expect(onChange).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ accessibilityLabel: "Lights: Allow" }).props.accessibilityState.disabled).toBe(false);
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

    const allow = tree.root.findByProps({
      accessibilityLabel: "Live cameras: Allow",
    });
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
