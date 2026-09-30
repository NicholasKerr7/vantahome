import { useLayoutEffect, useState, type RefObject } from 'react';

interface ControlPageCapacity { fields: 1 | 2 | 3; actions: 2 | 4 | 6 }

/** Reserve room for context, labels and touch targets within the actual sheet body. */
export function controlPageCapacity(height: number, short: boolean): ControlPageCapacity {
  const available = Math.max(0, height - 36);
  return {
    fields: available < 170 ? 1 : available < 270 || short ? 2 : 3,
    actions: available < 132 ? 2 : available < 202 ? 4 : 6,
  };
}

/** Recompute bounded pages when the dialog body changes, including browser text/viewport resizing. */
export function useControlPageCapacity(panel: RefObject<HTMLDivElement | null>, short: boolean): ControlPageCapacity {
  const [capacity, setCapacity] = useState<ControlPageCapacity>({ fields: short ? 2 : 3, actions: 6 });
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    /** Store only meaningful capacity changes so slider updates never trigger layout renders. */
    const measure = () => {
      const next = controlPageCapacity(element.clientHeight, short);
      setCapacity((current) => current.fields === next.fields && current.actions === next.actions ? current : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [panel, short]);
  return capacity;
}
