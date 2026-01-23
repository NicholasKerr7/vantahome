export type LayoutTokens = {
  spacing: {
    gutter: number;
    topPad: number;
    blockGap: number;
  };
  radii: {
    sm: number;
    md: number;
    lg: number;
    pill: number;
  };
  text: {
    sm: number;
    md: number;
    lg: number;
  };
  controls: {
    buttonHeight: number;
    inputHeight: number;
    chipHeight: number;
  };
};

type LayoutTokenParams = {
  isTablet: boolean;
  scale: number;
  gutter: number;
  topPad: number;
  blockGap: number;
};

export function getLayoutTokens({
  isTablet,
  scale,
  gutter,
  topPad,
  blockGap,
}: LayoutTokenParams): LayoutTokens {
  const baseText = isTablet ? 14 : 12;
  const baseRadius = isTablet ? 18 : 16;
  const baseControl = isTablet ? 44 : 40;

  return {
    spacing: {
      gutter,
      topPad,
      blockGap,
    },
    radii: {
      sm: Math.round(baseRadius * 0.6 * scale),
      md: Math.round(baseRadius * 0.85 * scale),
      lg: Math.round(baseRadius * 1.1 * scale),
      pill: Math.round(baseRadius * 2.2 * scale),
    },
    text: {
      sm: Math.round((baseText - 1) * scale),
      md: Math.round(baseText * scale),
      lg: Math.round((baseText + 2) * scale),
    },
    controls: {
      buttonHeight: Math.round(baseControl * scale),
      inputHeight: Math.round((baseControl + 4) * scale),
      chipHeight: Math.round((baseControl - 6) * scale),
    },
  };
}
