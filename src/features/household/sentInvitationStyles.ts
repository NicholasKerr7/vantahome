import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Bound invitation content within the existing purple workspace and fixed touch actions. */
export const sentInvitationStyles = StyleSheet.create({
  page: { flex: 1, minHeight: 0, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: theme.colors.text, fontSize: 21, lineHeight: 27, fontWeight: '500' },
  content: { flex: 1, minHeight: 0 },
  contentBody: { gap: 14, paddingBottom: 6 },
  details: { gap: 16 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  badge: { borderRadius: 10, backgroundColor: theme.colors.card2, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { color: theme.colors.accentText, fontSize: 12, fontWeight: '600' },
  status: { color: theme.colors.subtext, fontSize: 12 },
  email: { color: theme.colors.text, fontSize: 20, lineHeight: 27, fontWeight: '500', flexShrink: 1 },
  detailGroup: { gap: 5 },
  label: { color: theme.colors.subtext, fontSize: 11, fontWeight: '500' },
  value: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  detail: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  notice: { color: theme.colors.accentText, fontSize: 13, lineHeight: 20 },
  error: { color: theme.colors.alarmText, fontSize: 13, lineHeight: 20 },
  empty: { gap: 12, paddingVertical: 20, alignItems: 'flex-start' },
  emptyTitle: { color: theme.colors.text, fontSize: 19, lineHeight: 25, fontWeight: '500' },
  footer: { gap: 10, flexShrink: 0 },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 22, borderWidth: 1, borderColor: theme.colors.stroke },
  confirmActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 },
});
