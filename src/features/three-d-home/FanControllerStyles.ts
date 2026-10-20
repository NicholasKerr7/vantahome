import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Brushed violet metal and recessed graphite retain the established tactile console materials. */
export const fanControllerMaterials = {
  edge: ['#C6A9E2', '#635072', '#190E24'] as const,
  body: ['#33283F', '#17121F', '#271B33'] as const,
};

/** Small viewports reduce the artwork, never the 44-point controls or readable saved-speed display. */
export const fanControllerStyles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  shell: { width: '100%', maxWidth: 370, padding: 2, borderRadius: 30, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  shellCompact: { borderRadius: 26 },
  body: { borderRadius: 28, padding: 14, gap: 10, borderWidth: 1, borderColor: '#74647F' },
  bodyCompact: { borderRadius: 24, padding: 10, gap: 7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  brand: { color: theme.colors.accentText, fontSize: 8, letterSpacing: 1.6, textAlign: 'center' },
  title: { color: theme.colors.text, fontSize: 12, fontWeight: '600', letterSpacing: 2.2, textAlign: 'center' },
  hero: { borderRadius: 24, borderWidth: 1, borderColor: '#4F3B61', backgroundColor: '#17101F', overflow: 'hidden', alignItems: 'center', paddingTop: 6 },
  artwork: { height: 180, width: 180 },
  artworkCompact: { height: 126, width: 126 },
  layer: { ...StyleSheet.absoluteFillObject },
  status: { paddingHorizontal: 10, paddingBottom: 9, color: theme.colors.accentText, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
  rowLarge: { flexWrap: 'wrap' },
  key: { minWidth: 44, minHeight: 44, borderRadius: 14, borderWidth: 1, borderBottomWidth: 3, borderColor: '#675674', backgroundColor: '#342A42', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 7 },
  keyCircle: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 22 },
  keyWide: { flex: 1 },
  keyLarge: { flexBasis: '100%' },
  keyActive: { backgroundColor: '#573474', borderColor: theme.colors.accent },
  keyPressed: { backgroundColor: '#654480', borderBottomWidth: 1, opacity: 0.82 },
  keyDisabled: { opacity: 0.38 },
  keyLabel: { color: theme.colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  keyDetail: { color: theme.colors.accentText, fontSize: 10, textAlign: 'center' },
  speed: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 22, borderWidth: 1, borderColor: '#493750', backgroundColor: '#120D1B' },
  speedLarge: { flexWrap: 'wrap', justifyContent: 'center' },
  reading: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  readingLarge: { flexBasis: '100%' },
  speedValue: { color: theme.colors.text, fontSize: 29, lineHeight: 34, fontWeight: '400', fontVariant: ['tabular-nums'], textAlign: 'center' },
  caption: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 0.8, textAlign: 'center', fontWeight: '600' },
  section: { gap: 6 },
  sleep: { flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  sleepLabel: { flex: 1, color: theme.colors.text, fontSize: 11, fontWeight: '600' },
  sleepValue: { color: theme.colors.accentText, fontSize: 11 },
  feedback: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
