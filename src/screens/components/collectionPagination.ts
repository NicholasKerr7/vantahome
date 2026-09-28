import { useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';

/** Keep collection pages inside their measured space, including after rotation or deletion. */
export function useCollectionPagination(total: number, rowHeight: number, allowColumns = false) {
  const { fontScale } = useWindowDimensions();
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const [requestedPage, setRequestedPage] = useState(0);
  const columns = allowColumns && space.width >= 620 ? 2 : 1;
  // Text can grow independently of window size; reserve scaled row space before selecting a page.
  const textScale = Math.max(1, fontScale);
  const rows = Math.max(1, Math.min(allowColumns ? 3 : 5, Math.floor(space.height / (rowHeight * textScale))));
  const capacity = columns * rows;
  const pageCount = Math.max(1, Math.ceil(total / capacity));
  const page = Math.min(requestedPage, pageCount - 1);
  const start = page * capacity;

  /** Ignore identical layout events to avoid rerendering an already fitted collection. */
  function measure(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSpace((previous) => previous.width === width && previous.height === height ? previous : { width, height });
  }

  /** Clamp navigation to the currently available data and measured page capacity. */
  function changePage(nextPage: number) {
    setRequestedPage(Math.max(0, Math.min(pageCount - 1, nextPage)));
  }

  return { columns, capacity, page, pageCount, start, end: Math.min(total, start + capacity), largeText: textScale > 1, measure, changePage };
}

/** Group a bounded page into equal-width rows without modifying its source collection. */
export function collectionRows<T>(items: readonly T[], columns: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) rows.push(items.slice(index, index + columns));
  return rows;
}
