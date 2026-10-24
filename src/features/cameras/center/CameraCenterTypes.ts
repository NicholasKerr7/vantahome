import type { CameraCenterCamera, CameraCenterEvent } from '../cameraCenterModel';

// Re-export the authorized model contract so display components never diverge from its validation.
export type { CameraCenterCamera, CameraCenterEvent } from '../cameraCenterModel';

export type CameraCenterSection = 'cameras' | 'activity';
export type CameraCenterLayout = 'focus' | 'wall';

/** Presentation contract keeps navigation, persistence, permissions and media out of the view. */
export type CameraCenterViewProps = {
  cameras: readonly CameraCenterCamera[];
  selectedCameraId: string | null;
  section: CameraCenterSection;
  layout: CameraCenterLayout;
  events: readonly CameraCenterEvent[];
  focused?: boolean;
  loading?: boolean;
  canViewActivity?: boolean;
  onSelectCamera: (id: string) => void;
  onSectionChange: (section: CameraCenterSection) => void;
  onLayoutChange: (layout: CameraCenterLayout) => void;
  onOpenCamera?: (id: string) => void;
  onControls: (id: string) => void;
  onLocate?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  onAllCameras?: () => void;
};
