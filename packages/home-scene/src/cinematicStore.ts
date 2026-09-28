import { create } from 'zustand';

interface CinematicState {
  showcase: boolean;
  setShowcase: (value: boolean) => void;
}

/** Keep presentation playback transient and separate from saved home/device state. */
export const useCinematicStore = create<CinematicState>((set) => ({
  showcase: false,
  /** Start only on an explicit action; stopping leaves the current camera pose intact. */
  setShowcase(value) {
    set({ showcase: value });
  },
}));
