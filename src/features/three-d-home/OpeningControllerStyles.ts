import { StyleSheet, type Animated } from 'react-native';
import { theme } from '../../theme/theme';

/** Shared tactile metal surrounds three distinct architectural opening models. */
export const openingControllerMaterials = {
  edge: ['#C6A9E2', '#635072', '#190E24'] as const,
  body: ['#33283F', '#17121F', '#271B33'] as const,
};

/** Animated transforms retain real hinge axes and the roller shutter's existing compressed endpoint. */
export function createOpeningPositionStyles(position: Animated.Value) {
  return {
    door: { transform: [{ perspective: 600 }, { rotateY: position.interpolate({ inputRange: [0, 100], outputRange: ['0deg', '-90deg'] }) }] },
    window: { transform: [{ perspective: 600 }, { rotateX: position.interpolate({ inputRange: [0, 100], outputRange: ['0deg', '60deg'] }) }] },
    garage: { transform: [{ scaleY: position.interpolate({ inputRange: [0, 100], outputRange: [1, 0.018] }) }] },
  };
}

/** Constrained artwork preserves 44-point controls and a contained fallback for small/large-text views. */
export const openingControllerStyles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  shell: { width: '100%', maxWidth: 370, padding: 2, borderRadius: 30, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  shellCompact: { borderRadius: 26 },
  body: { borderRadius: 28, padding: 14, gap: 10, borderWidth: 1, borderColor: '#74647F' },
  bodyCompact: { borderRadius: 24, padding: 10, gap: 7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  emblem: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#675674', backgroundColor: '#21172D' },
  brand: { color: theme.colors.accentText, fontSize: 8, letterSpacing: 1.6, textAlign: 'center' },
  title: { color: theme.colors.text, fontSize: 12, fontWeight: '600', letterSpacing: 2.2, textAlign: 'center' },
  hero: { borderRadius: 24, borderWidth: 1, borderColor: '#4F3B61', backgroundColor: '#17101F', overflow: 'hidden', paddingTop: 6, alignItems: 'center' },
  artwork: { height: 184, width: 228 },
  artworkCompact: { height: 146, width: 180 },
  layer: { ...StyleSheet.absoluteFillObject },
  doorLeaf: { position: 'absolute', top: '8%', left: '28%', width: '44%', height: '82%', transformOrigin: 'left center', backfaceVisibility: 'hidden' },
  windowLeaf: { position: 'absolute', top: '22%', left: '16%', width: '68%', height: '55%', transformOrigin: 'center top', backfaceVisibility: 'hidden' },
  shutterLeaf: { position: 'absolute', top: '15%', left: '11%', width: '78%', height: '68%', transformOrigin: 'center top' },
  unknown: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  unknownLabel: { color: theme.colors.subtext, fontSize: 36, fontWeight: '300' },
  status: { paddingHorizontal: 10, paddingBottom: 10, color: theme.colors.accentText, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
  rowLarge: { flexWrap: 'wrap' },
  key: { minWidth: 44, minHeight: 44, borderRadius: 14, borderWidth: 1, borderBottomWidth: 3, borderColor: '#675674', backgroundColor: '#342A42', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 7 },
  keyCircle: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 22 },
  keyWide: { flex: 1 },
  keyLarge: { flexBasis: '100%' },
  keyHorizontal: { flexDirection: 'row', gap: 8 },
  keyActive: { backgroundColor: '#573474', borderColor: theme.colors.accent },
  keyPressed: { backgroundColor: '#654480', borderBottomWidth: 1, opacity: 0.82 },
  keyDisabled: { opacity: 0.38 },
  keyLabel: { color: theme.colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  positionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  positionLarge: { flexWrap: 'wrap', justifyContent: 'center' },
  reading: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  readingLarge: { flexBasis: '100%' },
  positionValue: { color: theme.colors.text, fontSize: 37, lineHeight: 42, fontWeight: '300', fontVariant: ['tabular-nums'], textAlign: 'center' },
  caption: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 0.8, textAlign: 'center', fontWeight: '600' },
  feedback: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
