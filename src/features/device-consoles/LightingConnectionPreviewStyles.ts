import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Keep the sample console centered and navigation pinned, with contained recovery for large text. */
export const lightingConnectionPreviewStyles = StyleSheet.create({
  card: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 16, gap: 10, borderRadius: 28, borderWidth: 1, borderColor: theme.colors.stroke },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { color: theme.colors.accentText, fontSize: 9, lineHeight: 12, letterSpacing: 1.3 },
  title: { color: theme.colors.text, fontSize: 21, lineHeight: 27, fontWeight: '500' },
  iconButton: { width: 44, minHeight: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card2 },
  status: { borderRadius: 16, padding: 10, gap: 4, backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.stroke },
  statusTitle: { color: theme.colors.text, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  detail: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16 },
  body: { flex: 1, minHeight: 0 },
  footer: { color: theme.colors.subtext, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  settingsScroll: { flex: 1, minHeight: 0 },
  settingsContent: { gap: 18, paddingVertical: 10 },
  group: { gap: 9 },
  groupTitle: { color: theme.colors.accentText, fontSize: 10, lineHeight: 14, letterSpacing: 1, fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minWidth: 44, minHeight: 44, flexGrow: 1, flexBasis: '30%', alignItems: 'center', justifyContent: 'center', padding: 9, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card2 },
  choiceSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accentText },
  choiceLabel: { color: theme.colors.text, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  choiceLabelSelected: { color: theme.colors.bg0, fontWeight: '600' },
  returnButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, padding: 10, backgroundColor: theme.colors.accent },
  returnLabel: { color: theme.colors.bg0, fontWeight: '600', fontSize: 13 },
});
