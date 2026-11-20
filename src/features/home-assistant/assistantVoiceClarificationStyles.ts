import { Platform, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Keep clarification compact, with native touch momentum and contained horizontal overflow. */
export const assistantVoiceClarificationStyles = StyleSheet.create({
  card: { minWidth: 0, gap: theme.spacing(1), padding: theme.spacing(1.5), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.surfaceRaised },
  heading: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1) },
  headingCopy: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  status: { color: theme.colors.subtext, fontSize: 11, lineHeight: 15 },
  cancel: { minHeight: 44, minWidth: 60, paddingHorizontal: theme.spacing(1), justifyContent: 'center', alignItems: 'center', borderRadius: theme.radius.sm, backgroundColor: theme.colors.card2 },
  cancelText: { color: theme.colors.accentText, fontSize: 12, fontWeight: '600' },
  question: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  choicesViewport: { minWidth: 0, flexGrow: 0, ...Platform.select({ web: { overscrollBehavior: 'contain' as const } }) },
  choices: { gap: theme.spacing(1), paddingVertical: 2 },
  choice: { minHeight: 44, minWidth: 44, maxWidth: 240, paddingHorizontal: theme.spacing(1.5), justifyContent: 'center', borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.accent, backgroundColor: theme.colors.overlay },
  choiceText: { color: theme.colors.accentText, fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
