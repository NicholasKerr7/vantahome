import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Static onyx materials match the other primary device controllers without adding a rendering loop. */
export const lightingControllerMaterials = {
  edge: [theme.colors.accentText, '#45334F', '#100C19'] as const,
  body: ['#2A2436', '#14101F', '#21172E'] as const,
};

/** Keep common lighting controls together, with real touch targets and large-text scroll recovery. */
export const lightingControllerStyles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  shell: { width: '100%', maxWidth: 370, padding: 2, borderRadius: 38, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  shellCompact: { borderRadius: 30 },
  body: { borderRadius: 36, padding: 14, gap: 10, borderWidth: 1, borderColor: '#706078' },
  bodyCompact: { borderRadius: 28, padding: 10, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  header: { justifyContent: 'space-between' },
  identity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  title: { color: theme.colors.text, fontSize: 12, fontWeight: '600', letterSpacing: 2, textAlign: 'center' },
  brand: { color: theme.colors.accentText, fontSize: 8, letterSpacing: 1.6, textAlign: 'center' },
  key: { minWidth: 44, minHeight: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#30273D', borderWidth: 1, borderColor: '#63536F', borderBottomWidth: 3, paddingHorizontal: 5, paddingVertical: 5 },
  keyCircle: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 22 },
  keyWide: { flex: 1, minWidth: 44 },
  keyActive: { backgroundColor: '#50316A', borderColor: theme.colors.accent },
  keyPressed: { backgroundColor: '#62417D', borderBottomWidth: 1, opacity: 0.82 },
  keyDisabled: { opacity: 0.38 },
  keyLabel: { color: theme.colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  keyHint: { color: theme.colors.subtext, fontSize: 9, textAlign: 'center' },
  orb: { alignSelf: 'center', width: 190, height: 190 },
  orbCompact: { width: 130, height: 130 },
  brightnessRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brightnessLarge: { flexWrap: 'wrap' },
  reading: { flex: 1, minWidth: 0, alignItems: 'center' },
  readingLarge: { flexBasis: '100%' },
  value: { color: theme.colors.text, fontSize: 48, lineHeight: 54, fontWeight: '300', letterSpacing: -1.4, fontVariant: ['tabular-nums'], textAlign: 'center' },
  valueCompact: { fontSize: 38, lineHeight: 44 },
  caption: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 1.1, fontWeight: '600', textAlign: 'center' },
  adjustersLarge: { flexDirection: 'row', justifyContent: 'space-evenly', gap: 12, width: '100%' },
  presets: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  palette: { flexWrap: 'wrap' },
  preset: { flex: 1, minWidth: 44, gap: 2 },
  colorPreset: { flexBasis: '30%', flexGrow: 1 },
  optionsLarge: { flexWrap: 'wrap' },
  optionLarge: { flexBasis: '44%', flexGrow: 1 },
  feedback: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
