/**
 * VantaHome v1 purple palette, shared by the current home and native controls.
 *
 * Keep this file “dumb”: no React/logic, just constants. That makes it safe to
 * import anywhere (components, store, utilities) without circular deps.
 */
export const theme = {
  colors: {
    bg0: "#2B0A73",
    bg1: "#4B1AAE",
    card: "rgba(255,255,255,0.14)",
    card2: "rgba(255,255,255,0.10)",
    stroke: "rgba(255,255,255,0.18)",
    text: "#FFFFFF",
    subtext: "rgba(255,255,255,0.80)",
    muted: "rgba(255,255,255,0.72)",
    accent: "#B46BFF",
    accent2: "#7A5CFF",
    /** Lighter violet keeps small accent labels legible on translucent cards. */
    accentText: "#DFC4FF",
    /** Readable safety-state accents shared by device cards and inspectors. */
    alarmText: "#FFB7AC",
    warningText: "#EFD391",
    electric: "#DFC4FF",
    ember: "#EBD0A6",
    glass: "rgba(53,19,127,0.96)",
    overlay: "rgba(17,5,48,0.72)",
    overlayStrong: "rgba(17,5,48,0.84)",
    glow: "rgba(180,107,255,0.55)",
  },
  radius: { xl: 28, lg: 22, md: 18, sm: 14 },
  /** 8pt spacing scale helper: `spacing(2) === 16` */
  spacing: (n: number) => n * 8,
};
