import React from "react";
import { Text } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import Pressable from "../Pressable";

describe("Pressable", () => {
  test("exposes tappable controls as buttons by default", () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Pressable onPress={jest.fn()}>
          <Text>Open</Text>
        </Pressable>,
      );
    });

    expect(tree.root.findByProps({ accessibilityRole: "button" })).toBeTruthy();
  });

  test("preserves an explicitly supplied accessibility role", () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Pressable accessibilityRole="tab" onPress={jest.fn()}>
          <Text>Home</Text>
        </Pressable>,
      );
    });

    expect(tree.root.findByProps({ accessibilityRole: "tab" })).toBeTruthy();
  });
});
