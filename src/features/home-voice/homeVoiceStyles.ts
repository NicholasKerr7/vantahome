import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** A bounded sheet stays readable above the property without introducing another scroll surface. */
export const homeVoiceStyles = StyleSheet.create({
  card: { width: '100%', maxWidth: 520, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.bg0, padding: 20, gap: 16 },
  compact: { padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  eyebrow: { color: theme.colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '600', marginTop: 4 },
  detail: { color: theme.colors.subtext, fontSize: 13, lineHeight: 19 },
  button: { minWidth: 44, minHeight: 44, paddingHorizontal: 16, borderRadius: theme.radius.sm, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center' },
  microphone: { minHeight: 56, borderRadius: theme.radius.md, backgroundColor: theme.colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  microphoneText: { color: theme.colors.bg0, fontSize: 15, fontWeight: '700' },
  label: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },
  input: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 12, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.stroke, color: theme.colors.text, backgroundColor: theme.colors.card2, fontSize: 14 },
  feedback: { minHeight: 44, justifyContent: 'center', padding: 12, borderRadius: theme.radius.sm, backgroundColor: theme.colors.card2 },
  feedbackText: { color: theme.colors.text, fontSize: 13, lineHeight: 18 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.76 },
});
