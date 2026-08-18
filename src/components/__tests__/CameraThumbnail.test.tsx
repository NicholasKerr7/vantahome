import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import CameraThumbnail from "../CameraThumbnail";

jest.mock("@expo/vector-icons/Ionicons", () => {
  const { Text } = require("react-native");
  return (props: object) => <Text {...props} />;
});

describe("CameraThumbnail", () => {
  test("uses memory and disk caching for offline fallback", () => {
    const { getByTestId } = render(
      <CameraThumbnail uri="https://example.com/camera.jpg" />,
    );

    expect(getByTestId("camera-thumbnail-image")).toHaveProp(
      "cachePolicy",
      "memory-disk",
    );
  });

  test("retries after the thumbnail URL changes", async () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <CameraThumbnail uri="https://example.com/old.jpg" />,
    );

    fireEvent(getByTestId("camera-thumbnail-image"), "error");
    expect(queryByTestId("camera-thumbnail-image")).toBeNull();

    rerender(<CameraThumbnail uri="https://example.com/new.jpg" />);
    await waitFor(() =>
      expect(getByTestId("camera-thumbnail-image")).toHaveProp("source", {
        uri: "https://example.com/new.jpg",
      }),
    );
  });
});
