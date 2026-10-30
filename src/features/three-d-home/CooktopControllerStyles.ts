import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

export const cooktopControllerMaterials = {
  edge: ['#BCB4CD', '#695C7D', '#21172D'] as const,
  body: ['#2C2737', '#15111E', '#241C30'] as const,
};

/** Use lightweight glass and metal finishes while protecting every control's touch target. */
export const cooktopControllerStyles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  shell: { width: '100%', maxWidth: 390, borderRadius: 30, padding: 2, shadowColor: '#000000', shadowOpacity: .35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  body: { borderRadius: 28, borderWidth: 1, borderColor: '#74647F', padding: 12, gap: 8 },
  bodyCompact: { padding: 10, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identity: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  brand: { color: theme.colors.accentText, fontSize: 8, letterSpacing: 1.6, textAlign: 'center' },
  title: { color: theme.colors.text, fontSize: 12, fontWeight: '600', letterSpacing: 1.6, textAlign: 'center' },
  artwork: { width: 270, height: 173, alignSelf: 'center' },
  artworkCompact: { width: 176, height: 113 },
  status: { color: theme.colors.accentText, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  key: { minWidth: 44, minHeight: 44, borderWidth: 1, borderBottomWidth: 3, borderColor: '#675674', borderRadius: 14, backgroundColor: '#342A42', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, paddingVertical: 7 },
  keyCircle: { width: 44, height: 44, borderRadius: 22, paddingHorizontal: 0, paddingVertical: 0 },
  keyStep: { width: 44, borderRadius: 11, paddingVertical: 0 },
  keyWide: { flex: 1 },
  keyLarge: { flexBasis: '45%' },
  keyActive: { backgroundColor: '#573474', borderColor: theme.colors.accent },
  keyPressed: { backgroundColor: '#654480', borderBottomWidth: 1, opacity: .82 },
  keyDisabled: { opacity: .38 },
  keyLabel: { color: theme.colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  rowLarge: { flexWrap: 'wrap' },
  section: { gap: 5 },
  caption: { color: theme.colors.accentText, fontSize: 8, lineHeight: 12, letterSpacing: .6, fontWeight: '600' },
  note: { color: theme.colors.subtext, fontSize: 10, lineHeight: 14 },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 6, paddingLeft: 12, borderRadius: 17, borderWidth: 1, borderColor: '#675374', backgroundColor: '#100C19' },
  settingLarge: { flexDirection: 'column', alignItems: 'stretch' },
  settingLabel: { gap: 3, flexShrink: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  value: { color: theme.colors.text, minWidth: 54, fontSize: 28, lineHeight: 34, fontWeight: '300', fontVariant: ['tabular-nums'], textAlign: 'center' },
  unit: { color: theme.colors.subtext, fontSize: 10 },
  preference: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, justifyContent: 'space-between' },
  preferenceCopy: { flex: 1, gap: 3 },
  preferenceLabel: { color: theme.colors.text, fontSize: 11, fontWeight: '600' },
  preferenceValue: { color: theme.colors.accentText, fontSize: 11, fontWeight: '600' },
  feedback: { color: theme.colors.subtext, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
