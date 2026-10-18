import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Brushed purple edges and recessed onyx panels match the primary device consoles. */
export const energyControllerMaterials = {
  edge: [theme.colors.accentText, '#493754', '#100C19'] as const,
  body: ['#30283C', '#171220', '#241A30'] as const,
};

/** Compact artwork leaves every primary control reachable, with contained scrolling for larger text. */
export const energyControllerStyles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  shell: { width: '100%', maxWidth: 370, padding: 2, borderRadius: 30, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  shellCompact: { borderRadius: 26 },
  body: { borderRadius: 28, padding: 14, gap: 9, borderWidth: 1, borderColor: '#74647F' },
  bodyCompact: { borderRadius: 24, padding: 10, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  header: { justifyContent: 'space-between' },
  emblem: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#675371', backgroundColor: '#21172E' },
  identity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  brand: { color: theme.colors.accentText, fontSize: 8, letterSpacing: 1.6, textAlign: 'center' },
  title: { color: theme.colors.text, fontSize: 12, fontWeight: '600', letterSpacing: 1.8, textAlign: 'center' },
  preview: { alignSelf: 'center', width: 240, height: 156 },
  previewCompact: { width: 190, height: 116 },
  reading: { alignItems: 'center', gap: 1 },
  value: { color: theme.colors.text, fontSize: 42, lineHeight: 48, fontWeight: '300', letterSpacing: -1.2, fontVariant: ['tabular-nums'], textAlign: 'center' },
  valueCompact: { fontSize: 34, lineHeight: 40 },
  caption: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 1, fontWeight: '600', textAlign: 'center' },
  status: { color: theme.colors.subtext, fontSize: 11, textAlign: 'center' },
  metrics: { flexDirection: 'row', alignItems: 'stretch', gap: 6, flexWrap: 'wrap' },
  metric: { flex: 1, minWidth: 70, paddingHorizontal: 5, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: '#171120', borderRadius: 12, borderWidth: 1, borderColor: '#493750' },
  metricHalf: { flexBasis: '44%' },
  metricLarge: { flexBasis: '100%' },
  metricValue: { color: theme.colors.text, fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'], textAlign: 'center' },
  metricLabel: { color: theme.colors.subtext, fontSize: 9, textAlign: 'center' },
  key: { minWidth: 44, minHeight: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#342A42', borderWidth: 1, borderColor: '#675674', borderBottomWidth: 3, paddingHorizontal: 7, paddingVertical: 7 },
  keyCircle: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 22 },
  keyWide: { flex: 1 },
  keyActive: { backgroundColor: '#573474', borderColor: theme.colors.accent },
  keyPressed: { backgroundColor: '#654480', borderBottomWidth: 1, opacity: 0.82 },
  keyDisabled: { opacity: 0.38 },
  keyLabel: { color: theme.colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  choices: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  choicesLarge: { flexWrap: 'wrap' },
  choiceLarge: { flexBasis: '100%' },
  section: { gap: 6 },
  sectionLabel: { color: theme.colors.accentText, fontSize: 10, textAlign: 'center' },
  feedback: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
