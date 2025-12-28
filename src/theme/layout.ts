import { useWindowDimensions } from 'react-native';

export const TABLET_MIN_SIZE = 768;
export const DEFAULT_MAX_WIDTH = 860;

export function useResponsive(maxWidth = DEFAULT_MAX_WIDTH) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= TABLET_MIN_SIZE;
  // Keep tablet layouts roomy but cap content width so elements stay reachable.
  const targetWidth = isTablet && isLandscape ? Math.max(maxWidth, 980) : maxWidth;
  const contentWidth = Math.min(width, targetWidth);
  const gutter = isTablet ? (isLandscape ? 36 : 28) : 22;
  const topPad = isTablet ? (isLandscape ? 56 : 70) : 56;
  const blockGap = isTablet ? (isLandscape ? 20 : 16) : 14;
  const scale = isTablet ? (isLandscape ? 1.08 : 1.14) : 1;

  return {
    width,
    height,
    isLandscape,
    isTablet,
    contentWidth,
    gutter,
    topPad,
    blockGap,
    scale,
  };
}
