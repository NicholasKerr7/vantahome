import { useCallback, useState } from "react";
import { useWindowDimensions, type LayoutChangeEvent } from "react-native";

/** Fit complete activity cards in the available panel without scrolling the page. */
export function useActivityPages(
  itemCount: number,
  cardHeight: number,
  maximum = 6,
) {
  const { fontScale } = useWindowDimensions();
  const [height, setHeight] = useState(0);
  const [page, setPage] = useState(0);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height),
    [],
  );
  const pageSize = Math.max(
    1,
    Math.min(
      maximum,
      Math.floor((height + 12) / (cardHeight * Math.max(1, fontScale) + 12)),
    ),
  );
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  return {
    page: currentPage,
    pageSize,
    pageCount,
    start: currentPage * pageSize,
    onLayout,
    setPage,
  };
}
