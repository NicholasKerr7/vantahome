import { create } from 'zustand';

interface CinematicState {
  showcase: boolean;
  resetViewVersion: number;
  setShowcase: (value: boolean) => void;
  resetView: () => void;
}

/** Keep presentation playback transient and separate from saved home/device state. */
export const useCinematicStore = create<CinematicState>((set) => ({
  showcase: false,
  resetViewVersion: 0,
  /** Start only on an explicit action; stopping leaves the current camera pose intact. */
  setShowcase(value) {
    set({ showcase: value });
  },
  /** Restore the current framing without changing saved navigation or device state. */
  resetView() {
    set((state) => ({ showcase: false, resetViewVersion: state.resetViewVersion + 1 }));
  },
}));
