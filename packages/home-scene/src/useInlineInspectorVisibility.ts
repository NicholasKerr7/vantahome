import { useEffect, useState } from 'react';
import type { DeviceId } from './data';

/** Prefer the dashboard only when its actions are beside the house and on screen. */
export function useInlineInspectorVisibility(selectedDevice: DeviceId | null): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const inspector = document.getElementById('room-controls');
    const scene = document.getElementById('house-preview');
    if (!inspector || !scene) return;
    let frame = 0;

    /** Measure actionable controls, falling back to the empty inspector heading. */
    function measure() {
      const actions = inspector!.querySelector('[data-inline-device-actions]') ?? inspector!.querySelector('h2');
      const bounds = actions?.getBoundingClientRect();
      const sceneBounds = scene!.getBoundingClientRect();
      const panelBounds = inspector!.getBoundingClientRect();
      const besideScene = panelBounds.left >= sceneBounds.right && panelBounds.top < sceneBounds.bottom;
      const fullscreen = document.fullscreenElement;
      const hiddenByFullscreen = fullscreen && !fullscreen.contains(inspector);
      setVisible(Boolean(!hiddenByFullscreen && besideScene && bounds && bounds.width > 0 && bounds.top >= 0 && bounds.bottom <= window.innerHeight));
    }
    /** Coalesce scroll and resize events into one layout read per browser frame. */
    function scheduleMeasure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(inspector);
    observer.observe(scene);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    document.addEventListener('fullscreenchange', scheduleMeasure);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure);
      document.removeEventListener('fullscreenchange', scheduleMeasure);
    };
  }, [selectedDevice]);
  return visible;
}
