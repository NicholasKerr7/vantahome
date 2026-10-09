import { useEffect, useState } from 'react';
import type { DeviceDefinition, DeviceId, RoomId } from './data';

/** Fit complete two-column rows using the CSS minimum, never stretched card measurements. */
export function inspectorDeviceCapacity(height: number, minimumCardHeight: number, rowGap: number): number {
  const minimum = Number.isFinite(minimumCardHeight) && minimumCardHeight > 0 ? minimumCardHeight : 108;
  const gap = Number.isFinite(rowGap) && rowGap >= 0 ? rowGap : 8;
  if (!Number.isFinite(height) || height <= 0) return 2;
  return Math.max(1, Math.floor((height + gap) / (minimum + gap))) * 2;
}

/** Keep the reader's current device in view as the bounded inspector gains or loses rows. */
export function useInspectorDevicePage(devices: readonly DeviceDefinition[], roomId: RoomId, selectedId: DeviceId | undefined) {
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const selectionKey = `${roomId}:${selectedId ?? ''}`;
  const deviceIds = devices.map((device) => device.id);
  const inventoryKey = deviceIds.join('|');
  const [pagination, setPagination] = useState({ selectionKey, anchorId: selectedId ?? devices[0]?.id, capacity: 2 });
  // Discard manual paging on every selection change, including a return to an earlier selected device.
  if (pagination.selectionKey !== selectionKey) {
    setPagination({ ...pagination, selectionKey, anchorId: selectedId ?? devices[0]?.id });
  }
  const anchorId = pagination.selectionKey === selectionKey ? pagination.anchorId : selectedId ?? devices[0]?.id;
  const requestedIndex = deviceIds.indexOf(anchorId ?? '');
  const anchorIndex = requestedIndex >= 0 ? requestedIndex : Math.max(0, deviceIds.indexOf(selectedId ?? ''));
  const page = Math.floor(anchorIndex / pagination.capacity);
  const pageCount = Math.max(1, Math.ceil(devices.length / pagination.capacity));
  const pageStart = page * pagination.capacity;

  useEffect(() => {
    if (!grid) return;
    const visibleIds = inventoryKey ? inventoryKey.split('|') : [];

    /** Resizing may repartition pages; retain a focused tile before React removes any siblings. */
    function measure() {
      if (!grid) return;
      // The undecorated grid's fractional height avoids fitting an extra row after clientHeight rounding.
      const height = grid.getBoundingClientRect().height;
      if (height <= 0) return;
      const styles = getComputedStyle(grid);
      const capacity = inspectorDeviceCapacity(height, Number.parseFloat(styles.getPropertyValue('--dashboard-device-card-min-height')), Number.parseFloat(styles.rowGap));
      const focused = document.activeElement?.closest<HTMLElement>('[data-inspector-device]');
      const focusedId = focused && grid.contains(focused) ? focused.dataset.inspectorDevice : undefined;
      setPagination((current) => {
        if (current.capacity === capacity) return current;
        const previousAnchor = current.selectionKey === selectionKey ? current.anchorId : selectedId ?? visibleIds[0];
        const anchor = visibleIds.find((id) => id === focusedId) ?? previousAnchor;
        return { selectionKey, anchorId: anchor, capacity };
      });
    }

    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    measure();
    return () => observer.disconnect();
  }, [grid, selectionKey, inventoryKey, selectedId]);

  /** Browse without changing selected controls, simulated device state, or keyboard focus. */
  function goToPage(requestedPage: number) {
    const nextPage = Math.max(0, Math.min(pageCount - 1, requestedPage));
    setPagination({ selectionKey, anchorId: devices[nextPage * pagination.capacity]?.id, capacity: pagination.capacity });
  }

  return { gridRef: setGrid, page, pageCount, pageStart, visibleDevices: devices.slice(pageStart, pageStart + pagination.capacity), goToPage };
}
