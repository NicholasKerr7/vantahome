import { act, renderHook } from "@testing-library/react-native";
import { Dimensions } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useActivityPages } from "../useActivityPages";

/** Create the layout event emitted by a bounded activity panel. */
function layout(height: number): LayoutChangeEvent {
  return {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  } as LayoutChangeEvent;
}

describe("activity pagination", () => {
  beforeEach(() =>
    Dimensions.set({
      window: { width: 390, height: 844, scale: 1, fontScale: 1 },
      screen: { width: 390, height: 844, scale: 1, fontScale: 1 },
    }),
  );
  test("fits complete cards and caps work for large tablet panels", () => {
    const { result } = renderHook(() => useActivityPages(20, 140));
    act(() => result.current.onLayout(layout(460)));
    expect(result.current.pageSize).toBe(3);
    expect(result.current.pageCount).toBe(7);
    act(() => result.current.onLayout(layout(2000)));
    expect(result.current.pageSize).toBe(6);
  });

  test("reserves more room for large accessibility text", () => {
    Dimensions.set({
      window: { width: 390, height: 844, scale: 1, fontScale: 2 },
    });
    const { result } = renderHook(() => useActivityPages(20, 140));
    act(() => result.current.onLayout(layout(460)));
    expect(result.current.pageSize).toBe(1);
  });

  test("keeps the current page reachable when entries are dismissed", () => {
    const { result, rerender } = renderHook(
      ({ count }: { count: number }) => useActivityPages(count, 140),
      { initialProps: { count: 8 } },
    );
    act(() => result.current.onLayout(layout(300)));
    act(() => result.current.setPage(3));
    expect(result.current.start).toBe(6);
    rerender({ count: 3 });
    expect(result.current.page).toBe(1);
    expect(result.current.start).toBe(2);
    rerender({ count: 0 });
    expect(result.current.page).toBe(0);
    expect(result.current.pageCount).toBe(1);
  });
});
