import { RotateCcw } from 'lucide-react';
import { useCinematicStore } from './cinematicStore';

/** Restore the current room or property framing through a keyboard-accessible control. */
export function ResetViewControl({ unavailable }: { unavailable: boolean }) {
  const resetView = useCinematicStore((state) => state.resetView);
  return <button type="button" className="reset-view-control" aria-label="Reset view"
    disabled={unavailable} title={unavailable ? 'Reset view is available when the scene is ready.' : 'Restore the current view without changing rooms or device settings.'}
    onClick={resetView}>
    <RotateCcw size={16} aria-hidden="true" />
    <span>Reset view</span>
  </button>;
}
