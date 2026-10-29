import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

export const irrigationControllerMaterials = {
  edge: ['#C6A9E2', '#635072', '#190E24'] as const,
  body: ['#33283F', '#17121F', '#271B33'] as const,
};

/** Scale decorative equipment before touch controls; large type retains contained, accessible scrolling. */
export const irrigationControllerStyles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  shell: { width: '100%', maxWidth: 370, padding: 2, borderRadius: 30, shadowColor: '#000000', shadowOpacity: .35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  body: { borderRadius: 28, padding: 12, gap: 8, borderWidth: 1, borderColor: '#74647F' },
  bodyCompact: { padding: 10, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  identity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  brand: { color: theme.colors.accentText, fontSize: 8, letterSpacing: 1.6, textAlign: 'center' },
  title: { color: theme.colors.text, fontSize: 12, fontWeight: '600', letterSpacing: 2.2, textAlign: 'center' },
  hero: { alignItems: 'center', gap: 2 },
  artwork: { height: 190, width: '100%', maxWidth: 280, alignSelf: 'center' },
  artworkCompact: { height: 120 },
  layer: { ...StyleSheet.absoluteFillObject },
  status: { color: theme.colors.accentText, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 7 },
  rowLarge: { flexWrap: 'wrap' },
  section: { gap: 6 },
  key: { minWidth: 44, minHeight: 44, borderRadius: 14, borderWidth: 1, borderBottomWidth: 3, borderColor: '#675674', backgroundColor: '#342A42', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 7 },
  keyCircle: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, borderRadius: 22 },
  keyWide: { flex: 1 },
  keyLarge: { flexBasis: '100%' },
  keyActive: { backgroundColor: '#573474', borderColor: theme.colors.accent },
  keyPrimary: { flexDirection: 'row', backgroundColor: '#573474', borderColor: '#B087CA', gap: 8 },
  keyPressed: { backgroundColor: '#654480', borderBottomWidth: 1, opacity: .82 },
  keyDisabled: { opacity: .38 },
  keyLabel: { color: theme.colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  duration: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 26, borderWidth: 1, borderColor: '#493750', backgroundColor: '#120D1B' },
  durationLarge: { flexWrap: 'wrap', justifyContent: 'center' },
  reading: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  readingLarge: { flexBasis: '100%' },
  value: { color: theme.colors.text, fontSize: 29, lineHeight: 34, fontWeight: '300', fontVariant: ['tabular-nums'], textAlign: 'center' },
  caption: { color: theme.colors.accentText, fontSize: 8, letterSpacing: .8, fontWeight: '600' },
  feedback: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
