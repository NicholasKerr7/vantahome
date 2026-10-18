import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Quiet onyx surfaces keep the saved-position preview in the same family as TV and climate controls. */
export const blindsControllerMaterials = {
  edge: [theme.colors.accentText, '#45334F', '#100C19'] as const,
  body: ['#2A2436', '#14101F', '#21172E'] as const,
  window: ['#171220', '#372741', '#191321'] as const,
};

/** Reflow for larger text while retaining native momentum and full-sized control targets. */
export const blindsControllerStyles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  shell: { width: '100%', maxWidth: 370, padding: 2, borderRadius: 38, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  shellCompact: { borderRadius: 30 },
  body: { borderRadius: 36, padding: 14, gap: 10, borderWidth: 1, borderColor: '#706078' },
  bodyCompact: { borderRadius: 28, padding: 10, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  header: { justifyContent: 'space-between' },
  emblem: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#63536F', backgroundColor: '#191221' },
  identity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  title: { color: theme.colors.text, fontSize: 12, fontWeight: '600', letterSpacing: 2, textAlign: 'center' },
  subtitle: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 1, textAlign: 'center' },
  key: { minWidth: 44, minHeight: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#30273D', borderWidth: 1, borderColor: '#63536F', borderBottomWidth: 3, paddingHorizontal: 6, paddingVertical: 6 },
  keyCircle: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 22 },
  keyWide: { flex: 1, minWidth: 44, flexDirection: 'row', gap: 6 },
  keyActive: { backgroundColor: '#50316A', borderColor: theme.colors.accent },
  keyPressed: { backgroundColor: '#62417D', borderBottomWidth: 1, opacity: 0.82 },
  keyDisabled: { opacity: 0.38 },
  keyLabel: { color: theme.colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  keyHint: { color: theme.colors.subtext, fontSize: 10, textAlign: 'center' },
  window: { width: '100%', height: 190, borderRadius: 22, borderWidth: 1, borderColor: '#5E486E', overflow: 'hidden', shadowColor: '#08050D', shadowOpacity: 0.65, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  windowCompact: { height: 142, borderRadius: 18 },
  positionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  positionLarge: { flexWrap: 'wrap' },
  reading: { flex: 1, minWidth: 0, alignItems: 'center' },
  readingLarge: { flexBasis: '100%' },
  value: { color: theme.colors.text, fontSize: 52, lineHeight: 58, fontWeight: '300', letterSpacing: -1.5, fontVariant: ['tabular-nums'], textAlign: 'center' },
  valueCompact: { fontSize: 40, lineHeight: 46 },
  caption: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 1.5, fontWeight: '600', textAlign: 'center' },
  adjustersLarge: { flexDirection: 'row', justifyContent: 'space-evenly', gap: 12, width: '100%' },
  optionsLarge: { flexWrap: 'wrap' },
  optionLarge: { flexBasis: '44%', flexGrow: 1 },
  preset: { flex: 1, gap: 2, minWidth: 44 },
  feedback: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
