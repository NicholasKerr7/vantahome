import { createContext, useContext } from "react";

/** Navigation-independent access to the current home's delivery activity. */
export const CommandActivityContext = createContext<{
  open: () => void;
  count: number;
} | null>(null);

/** Unavailable on authentication screens and outside the private app shell. */
export function useCommandActivityLauncher() {
  return useContext(CommandActivityContext);
}
