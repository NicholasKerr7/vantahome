/**
 * Shared obsidian, jade and pearl tokens connect the cinematic home and native controls.
 *
 * Keep this file “dumb”: no React/logic, just constants. That makes it safe to
 * import anywhere (components, store, utilities) without circular deps.
 */
export const theme = {
  colors: {
    bg0: "#080D12",
    bg1: "#102027",
    card: "#13212B",
    card2: "#0E1820",
    stroke: "#263E49",
    text: "#EFF7F3",
    subtext: "#A4BAC4",
    muted: "#819AA6",
    accent: "#BDFFE1",
    accent2: "#315A50",
    electric: "#A3C9FF",
    ember: "#EBD0A6",
    glass: "rgba(18,35,44,0.86)",
    glow: "rgba(127,235,196,0.25)",
  },
  radius: { xl: 28, lg: 22, md: 18, sm: 14 },
  /** 8pt spacing scale helper: `spacing(2) === 16` */
  spacing: (n: number) => n * 8,
};
