import React from "react";
import { Text } from "react-native";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";
import RadialDial from "../RadialDial";

const panGestures: any[] = [];
const tapGestures: any[] = [];

jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  const Mock = (props: any) => <View {...props} />;
  const MockText = (props: any) => <Text {...props} />;
  return {
    __esModule: true,
    default: Mock,
    Path: Mock,
    Circle: Mock,
    Defs: Mock,
    LinearGradient: Mock,
    Stop: Mock,
    Text: MockText,
  };
});

jest.mock("react-native-gesture-handler", () => {
  const React = require("react");
  const { View } = require("react-native");
  const createGesture = (kind: "pan" | "tap") => {
    const handlers: Record<string, any> = {};
    const api: any = {
      __handlers: handlers,
      minDistance: jest.fn().mockReturnThis(),
      onBegin: jest.fn((fn: any) => {
        handlers.onBegin = fn;
        return api;
      }),
      onStart: jest.fn((fn: any) => {
        handlers.onStart = fn;
        return api;
      }),
      onUpdate: jest.fn((fn: any) => {
        handlers.onUpdate = fn;
        return api;
      }),
      onFinalize: jest.fn((fn: any) => {
        handlers.onFinalize = fn;
        return api;
      }),
      runOnJS: jest.fn().mockReturnThis(),
    };
    if (kind === "pan") panGestures.push(api);
    if (kind === "tap") tapGestures.push(api);
    return api;
  };
  return {
    GestureDetector: ({ children }: any) => <View>{children}</View>,
    Gesture: {
      Pan: () => createGesture("pan"),
      Tap: () => createGesture("tap"),
      Simultaneous: (...gestures: any[]) => ({ gestures }),
    },
  };
});

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

const flattenText = (value: any): string[] => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }
  return [];
};

const dialPointForValue = (
  value: number,
  min: number,
  max: number,
  size: number,
) => {
  const start = (Math.PI * 5) / 6;
  const sweep = (Math.PI * 4) / 3;
  const t = (value - min) / (max - min);
  const angle = start + sweep * t;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.25;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
};

describe("RadialDial", () => {
  beforeEach(() => {
    panGestures.length = 0;
    tapGestures.length = 0;
  });

  it("renders the center label and formatted center value", () => {
    const onChange = jest.fn();
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <RadialDial
          value={24}
          min={10}
          max={30}
          centerLabel="Target"
          centerValue={21}
          formatCenterValue={(v) => `${v}m`}
          formatTick={(v) => `${v}`}
          tickValues={[10, 20, 30]}
          onChange={onChange}
        />,
      );
    });

    const texts = tree.root
      .findAllByType(Text)
      .flatMap((node: any) => flattenText(node.props.children));

    expect(texts).toContain("Target");
    expect(texts).toContain("21m");

    act(() => {
      tree.unmount();
    });
  });

  it("updates value on pan gesture", () => {
    const onChange = jest.fn();
    const size = 200;
    act(() => {
      renderer.create(
        <RadialDial
          value={15}
          min={10}
          max={30}
          size={size}
          onChange={onChange}
        />,
      );
    });

    const pan = panGestures[panGestures.length - 1];
    const target = dialPointForValue(25, 10, 30, size);
    act(() => {
      pan.__handlers.onBegin?.(target);
    });

    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it("updates value on tap gesture", () => {
    const onChange = jest.fn();
    const size = 200;
    act(() => {
      renderer.create(
        <RadialDial
          value={12}
          min={10}
          max={30}
          size={size}
          onChange={onChange}
        />,
      );
    });

    const tap = tapGestures[tapGestures.length - 1];
    const target = dialPointForValue(18, 10, 30, size);
    act(() => {
      tap.__handlers.onStart?.(target);
    });

    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(18);
  });
});
