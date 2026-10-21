import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Restrained violet metal surrounds a sample monitor rather than a connected video player. */
export const cameraControllerMaterials = {
  edge: ['#C6A9E2', '#635072', '#190E24'] as const,
  body: ['#33283F', '#17121F', '#271B33'] as const,
};

/** Regular screens fit without scrolling; small screens and Dynamic Type retain contained access. */
export const cameraControllerStyles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  shell: { width: '100%', maxWidth: 380, padding: 2, borderRadius: 30, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  shellCompact: { borderRadius: 26 },
  body: { borderRadius: 28, padding: 14, gap: 10, borderWidth: 1, borderColor: '#74647F' },
  bodyCompact: { borderRadius: 24, padding: 10, gap: 7 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  emblem: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#675674', backgroundColor: '#21172D' },
  brand: { color: theme.colors.accentText, fontSize: 8, letterSpacing: 1.6, textAlign: 'center' },
  title: { color: theme.colors.text, fontSize: 12, fontWeight: '600', letterSpacing: 2.2, textAlign: 'center' },
  monitor: { borderRadius: 20, borderWidth: 1, borderColor: '#685579', backgroundColor: '#0C0914', overflow: 'hidden' },
  monitorHeader: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  monitorHeaderLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  sampleCaption: { color: theme.colors.accentText, fontSize: 9, fontWeight: '600', letterSpacing: 1.1 },
  sampleDetail: { color: theme.colors.subtext, fontSize: 9 },
  artwork: { width: '100%', height: 174 },
  artworkCompact: { height: 136 },
  monitorFooter: { paddingHorizontal: 12, paddingVertical: 9, gap: 4 },
  status: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },
  event: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15 },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
  rowLarge: { flexWrap: 'wrap' },
  key: { minWidth: 44, minHeight: 44, borderRadius: 14, borderWidth: 1, borderBottomWidth: 3, borderColor: '#675674', backgroundColor: '#342A42', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 8 },
  keyCircle: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 22 },
  keyWide: { flex: 1 },
  keyLarge: { flexBasis: '100%' },
  keyHorizontal: { flexDirection: 'row', gap: 7 },
  keyActive: { backgroundColor: '#573474', borderColor: theme.colors.accent },
  keyPressed: { backgroundColor: '#654480', borderBottomWidth: 1, opacity: 0.82 },
  keyDisabled: { opacity: 0.38 },
  keyLabel: { color: theme.colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  preference: { minHeight: 54 },
  preferenceValue: { color: theme.colors.accentText, fontSize: 10, textAlign: 'center' },
  feedback: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
