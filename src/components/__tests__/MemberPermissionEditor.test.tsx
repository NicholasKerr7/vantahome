import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import MemberPermissionEditor from "../MemberPermissionEditor";

describe("MemberPermissionEditor", () => {
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
