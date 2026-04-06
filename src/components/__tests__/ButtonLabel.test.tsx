import React from "react";
import { StyleSheet } from "react-native";
import { render } from "@testing-library/react-native";
import ButtonLabel from "../ButtonLabel";

describe("ButtonLabel", () => {
  it("applies constrained fitting defaults for button text", () => {
    const { getByText } = render(
      <ButtonLabel>Steam Refresh Enhancement</ButtonLabel>,
    );

    const label = getByText("Steam Refresh Enhancement");
    const style = StyleSheet.flatten(label.props.style);

    expect(label.props.adjustsFontSizeToFit).toBe(true);
    expect(label.props.allowFontScaling).toBe(false);
    expect(label.props.ellipsizeMode).toBe("tail");
    expect(label.props.maxFontSizeMultiplier).toBe(1.05);
    expect(label.props.minimumFontScale).toBe(0.78);
    expect(label.props.numberOfLines).toBe(1);
    expect(style.maxWidth).toBe("100%");
    expect(style.flexShrink).toBe(1);
    expect(style.textAlign).toBe("center");
  });

  it("supports two-line tile labels when requested", () => {
    const { getByText } = render(
      <ButtonLabel lines={2}>Wrinkle Guard</ButtonLabel>,
    );

    expect(getByText("Wrinkle Guard").props.numberOfLines).toBe(2);
  });
});
