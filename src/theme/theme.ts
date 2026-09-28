/**
 * Shared olive and charcoal tokens align native controls with the 3D home.
 *
 * Keep this file “dumb”: no React/logic, just constants. That makes it safe to
 * import anywhere (components, store, utilities) without circular deps.
 */
export const theme = {
  colors: {
    bg0: "#141713",
    bg1: "#222B1E",
    card: "#22271F",
    card2: "#1A1E19",
    stroke: "#3C4635",
    text: "#E9E9DF",
    subtext: "#B3BBAA",
    muted: "#99A18F",
    accent: "#D5E7A4",
    accent2: "#536736",
    glow: "rgba(181,207,141,0.3)",
  },
  radius: { xl: 28, lg: 22, md: 18, sm: 14 },
  /** 8pt spacing scale helper: `spacing(2) === 16` */
  spacing: (n: number) => n * 8,
};
