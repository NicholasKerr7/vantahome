import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Static metal and onyx materials keep entry controls consistent with the other tactile consoles. */
export const gateControllerMaterials = {
  edge: [theme.colors.accentText, '#493653', '#100C19'] as const,
  body: ['#30283B', '#17121F', '#241A30'] as const,
};

/** Preserve complete safety text, real touch targets, and contained scrolling when text or host space requires it. */
export const gateControllerStyles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  shell: { width: '100%', maxWidth: 370, padding: 2, borderRadius: 30, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  shellCompact: { borderRadius: 26 },
  body: { borderRadius: 28, padding: 12, gap: 7, borderWidth: 1, borderColor: '#74647F' },
  bodyCompact: { borderRadius: 24, padding: 10, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  header: { justifyContent: 'space-between' },
  emblem: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#21172E', borderWidth: 1, borderColor: '#675371' },
  identity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  brand: { color: theme.colors.accentText, fontSize: 8, letterSpacing: 1.6, textAlign: 'center' },
  title: { color: theme.colors.text, fontSize: 12, fontWeight: '600', letterSpacing: 1.8, textAlign: 'center' },
  preview: { alignSelf: 'center', width: 260, height: 140 },
  previewCompact: { width: 220, height: 112 },
  reading: { alignItems: 'center', gap: 2 },
  value: { color: theme.colors.text, fontSize: 38, lineHeight: 44, fontWeight: '300', letterSpacing: -1, fontVariant: ['tabular-nums'], textAlign: 'center' },
  valueCompact: { fontSize: 34, lineHeight: 40 },
  caption: { color: theme.colors.accentText, fontSize: 9, fontWeight: '600', letterSpacing: 1, textAlign: 'center' },
  status: { color: theme.colors.text, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  statusWarning: { color: '#FFD69C' },
  key: { minWidth: 44, minHeight: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: '#342A42', borderWidth: 1, borderColor: '#675674', borderBottomWidth: 3, paddingHorizontal: 7, paddingVertical: 7 },
  keyCircle: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 22 },
  keyWide: { flex: 1 },
  keyActive: { backgroundColor: '#573474', borderColor: theme.colors.accent },
  keyPressed: { backgroundColor: '#654480', borderBottomWidth: 1, opacity: 0.82 },
  keyDisabled: { opacity: 0.38 },
  keyLabel: { color: theme.colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  controlsLarge: { flexWrap: 'wrap' },
  controlLarge: { flexBasis: '100%' },
  section: { gap: 5 },
  sectionLabel: { color: theme.colors.subtext, fontSize: 9, letterSpacing: 0.6, textAlign: 'center' },
  indicators: { flexDirection: 'row', alignItems: 'stretch', gap: 6, flexWrap: 'wrap' },
  indicator: { flex: 1, minWidth: 60, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 11, backgroundColor: '#171120', borderWidth: 1, borderColor: '#493750', alignItems: 'center', justifyContent: 'center', gap: 2 },
  indicatorWarning: { borderColor: '#B78B56', backgroundColor: '#30241E' },
  indicatorLarge: { flexBasis: '100%' },
  indicatorLabel: { color: theme.colors.subtext, fontSize: 9, textAlign: 'center' },
  indicatorValue: { color: theme.colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  autoClose: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 11, borderWidth: 1, borderColor: '#554064', backgroundColor: '#22172E' },
  autoCloseText: { color: theme.colors.accentText, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  feedback: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
