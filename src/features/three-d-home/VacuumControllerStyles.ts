import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Brushed violet edges and recessed controls match the existing tactile consoles. */
export const vacuumControllerMaterials = {
  edge: ['#C6A9E2', '#635072', '#190E24'] as const,
  body: ['#33283F', '#17121F', '#271B33'] as const,
};

/** Regular viewports stay still; large text can use the contained scroll fallback. */
export const vacuumControllerStyles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  shell: { width: '100%', maxWidth: 370, padding: 2, borderRadius: 30, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  shellCompact: { borderRadius: 26 },
  body: { borderRadius: 28, padding: 14, gap: 9, borderWidth: 1, borderColor: '#74647F' },
  bodyCompact: { borderRadius: 24, padding: 10, gap: 7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emblem: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#6A537F', backgroundColor: '#24182F', alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  brand: { color: theme.colors.accentText, fontSize: 8, letterSpacing: 1.6, textAlign: 'center' },
  title: { color: theme.colors.text, fontSize: 12, fontWeight: '600', letterSpacing: 2.2, textAlign: 'center' },
  hero: { borderRadius: 22, borderWidth: 1, borderColor: '#4F3B61', backgroundColor: '#17101F', overflow: 'hidden' },
  artwork: { width: '100%', height: 146 },
  artworkCompact: { height: 112 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  statusRowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  status: { color: theme.colors.text, fontSize: 13, lineHeight: 18, fontWeight: '500', flexShrink: 1 },
  battery: { color: theme.colors.accentText, fontSize: 10, lineHeight: 15, textAlign: 'right', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
  rowLarge: { flexWrap: 'wrap' },
  key: { minWidth: 44, minHeight: 44, borderRadius: 14, borderWidth: 1, borderBottomWidth: 3, borderColor: '#675674', backgroundColor: '#342A42', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 7, paddingVertical: 7 },
  keyCircle: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 22 },
  keyWide: { flex: 1 },
  keyLarge: { flexBasis: '100%' },
  keyHorizontal: { flexDirection: 'row' },
  keyActive: { backgroundColor: '#573474', borderColor: theme.colors.accent },
  keyPressed: { backgroundColor: '#654480', borderBottomWidth: 1, opacity: 0.82 },
  keyDisabled: { opacity: 0.38 },
  keyLabel: { color: theme.colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  section: { gap: 6 },
  caption: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 0.9, textAlign: 'center', fontWeight: '600' },
  suction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 22, borderWidth: 1, borderColor: '#493750', backgroundColor: '#120D1B' },
  suctionReading: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  suctionValue: { color: theme.colors.text, fontSize: 21, lineHeight: 25, fontWeight: '400', fontVariant: ['tabular-nums'], textAlign: 'center' },
  preference: { flexDirection: 'row', gap: 6 },
  preferenceLabel: { flex: 1, minWidth: 0, color: theme.colors.text, fontSize: 11, fontWeight: '500', textAlign: 'left' },
  preferenceValue: { color: theme.colors.accentText, fontSize: 10, fontWeight: '600' },
  care: { color: theme.colors.warningText, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  feedback: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
