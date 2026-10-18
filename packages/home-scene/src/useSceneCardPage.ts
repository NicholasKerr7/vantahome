import { useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

type SceneCardPageSize = 1 | 2 | 3 | 4;
type SceneIdentity = { id: string };

/** Read a CSS layout token while retaining safe geometry before styles are available. */
function pixelValue(value: string, fallback: number, allowZero = false): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0) ? parsed : fallback;
}

/** Fit up to four readable cards across the full available scrolling surface. */
function sceneCardCapacity(width: number, total: number, minimumWidth: number, cardGap: number): SceneCardPageSize {
  const capacity = Math.max(1, Math.min(4, Math.floor((width + cardGap) / (minimumWidth + cardGap))));
  return Math.max(1, Math.min(total, capacity)) as SceneCardPageSize;
}

/** Keep readable scene cards and the reader's current identity within the measured dashboard row. */
export function useSceneCardPage(scenes: readonly SceneIdentity[]) {
  const [row, setRow] = useState<HTMLElement | null>(null);
  const [pagination, setPagination] = useState({ anchorId: scenes[0]?.id, anchorIndex: 0, pageSize: 1 as SceneCardPageSize });
  const focusedSceneId = useRef<string | undefined>(undefined);
  const pendingFocusId = useRef<string | undefined>(undefined);
  const sceneIds = scenes.map((scene) => scene.id);
  const inventoryKey = JSON.stringify(sceneIds);
  const foundIndex = sceneIds.indexOf(pagination.anchorId ?? '');
  const anchorIndex = foundIndex >= 0 ? foundIndex : Math.max(0, Math.min(pagination.anchorIndex, scenes.length - 1));
  const pageCount = Math.max(1, Math.ceil(scenes.length / pagination.pageSize));
  const page = Math.floor(anchorIndex / pagination.pageSize);

  useLayoutEffect(() => {
    if (!row) return;
    const label = row.querySelector<HTMLElement>('.dashboard-scenes-label');

    /** Preserve the focused card or current anchor when width, label visibility, or inventory changes. */
    function measure() {
      if (!row) return;
      const width = row.getBoundingClientRect().width;
      const measurable = Number.isFinite(width) && width > 0;
      const styles = getComputedStyle(row);
      const rowGap = pixelValue(styles.columnGap, 6, true);
      const labelStyles = label ? getComputedStyle(label) : null;
      const labelWidth = label && labelStyles?.display !== 'none' && labelStyles?.visibility !== 'hidden' ? label.getBoundingClientRect().width : 0;
      const availableWidth = width - (labelWidth > 0 ? labelWidth + rowGap : 0);
      const measuredPageSize = measurable ? sceneCardCapacity(availableWidth, sceneIds.length,
        pixelValue(styles.getPropertyValue('--scene-card-min-width'), 144),
        pixelValue(styles.getPropertyValue('--scene-card-gap'), 6, true)) : undefined;
      const focused = document.activeElement?.closest<HTMLElement>('[data-scene-id]');
      const focusedId = focused && row.contains(focused) ? focused.dataset.sceneId : undefined;
      setPagination((current) => {
        // Hidden rows retain measured capacity while inventory changes still update their anchor.
        const pageSize = measuredPageSize ?? Math.max(1, Math.min(sceneIds.length, current.pageSize)) as SceneCardPageSize;
        const preferredId = focusedId && sceneIds.includes(focusedId) ? focusedId : current.anchorId;
        const preferredIndex = sceneIds.indexOf(preferredId ?? '');
        const nextIndex = preferredIndex >= 0 ? preferredIndex : Math.max(0, Math.min(current.anchorIndex, sceneIds.length - 1));
        const nextId = sceneIds[nextIndex];
        return current.pageSize === pageSize && current.anchorId === nextId && current.anchorIndex === nextIndex
          ? current : { anchorId: nextId, anchorIndex: nextIndex, pageSize };
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    if (label) observer.observe(label);
    return () => observer.disconnect();
  }, [row, inventoryKey]);

  // Page changes mount distant cards before keyboard focus moves; deleted focused
  // cards recover at the same inventory position without stealing outside focus.
  useLayoutEffect(() => {
    if (!row) return;
    const removedFocus = focusedSceneId.current && !sceneIds.includes(focusedSceneId.current);
    if (!pendingFocusId.current && !removedFocus) return;
    const nextId = pendingFocusId.current ?? sceneIds[anchorIndex];
    const next = [...row.querySelectorAll<HTMLButtonElement>('[data-scene-id]')]
      .find((button) => button.dataset.sceneId === nextId);
    pendingFocusId.current = undefined;
    focusedSceneId.current = nextId;
    (next ?? row).focus({ preventScroll: true });
  }, [row, inventoryKey, page, pagination, anchorIndex]);

  /** Browse the same card surface without selecting or running a scene. */
  function goToPage(requestedPage: number) {
    const nextPage = Number.isFinite(requestedPage) ? Math.max(0, Math.min(pageCount - 1, Math.floor(requestedPage))) : 0;
    const nextIndex = nextPage * pagination.pageSize;
    setPagination({ anchorId: sceneIds[nextIndex], anchorIndex: nextIndex, pageSize: pagination.pageSize });
  }

  /** Retain focused identity before a later catalog render can move its card outside the mounted pages. */
  function onFocusCapture(event: FocusEvent<HTMLElement>) {
    const focused = event.target.closest<HTMLElement>('[data-scene-id]');
    if (!focused || !event.currentTarget.contains(focused)) return;
    const focusedIndex = sceneIds.indexOf(focused.dataset.sceneId ?? '');
    if (focusedIndex < 0) return;
    const focusedId = sceneIds[focusedIndex];
    focusedSceneId.current = focusedId;
    setPagination((current) => current.anchorId === focusedId && current.anchorIndex === focusedIndex
      ? current : { ...current, anchorId: focusedId, anchorIndex: focusedIndex });
  }

  /** Release focus ownership when the reader tabs or clicks outside the scene row. */
  function onBlurCapture(event: FocusEvent<HTMLElement>) {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
      focusedSceneId.current = undefined;
      pendingFocusId.current = undefined;
    }
  }

  /** Browse every scene without visible controls, leaving Tab and activation keys native. */
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const focused = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-scene-id]') : null;
    if (!focused || !event.currentTarget.contains(focused)) return;
    const currentIndex = sceneIds.indexOf(focused.dataset.sceneId ?? '');
    if (currentIndex < 0) return;
    const requestedIndex = event.key === 'ArrowLeft' ? currentIndex - 1 : event.key === 'ArrowRight' ? currentIndex + 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? sceneIds.length - 1 : undefined;
    if (requestedIndex === undefined) return;
    event.preventDefault();
    const nextIndex = Math.max(0, Math.min(sceneIds.length - 1, requestedIndex));
    pendingFocusId.current = sceneIds[nextIndex];
    setPagination((current) => ({ ...current, anchorId: sceneIds[nextIndex], anchorIndex: nextIndex }));
  }

  return { rowRef: setRow, page, pageCount, pageSize: pagination.pageSize, goToPage, onFocusCapture, onBlurCapture, onKeyDown };
}
