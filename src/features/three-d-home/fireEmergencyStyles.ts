import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Keep emergency simulation controls readable without flashing or moving the house. */
export const fireEmergencyStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.overlayStrong, padding: 12 },
  card: { width: '100%', maxWidth: 540, maxHeight: '100%', minHeight: 0, backgroundColor: theme.colors.bg0, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.ember, overflow: 'hidden' },
  content: { padding: 20, gap: 16 },
  scroll: { flexGrow: 0, minHeight: 0 },
  heading: { gap: 6 },
  eyebrow: { color: theme.colors.ember, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: '600', lineHeight: 32 },
  detail: { color: theme.colors.subtext, fontSize: 14, lineHeight: 21 },
  disclaimer: { color: theme.colors.ember, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  status: { padding: 14, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card2, gap: 6 },
  statusHeading: { color: theme.colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  sourceList: { gap: 10 },
  source: { gap: 3 },
  sourceRoom: { color: theme.colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  sourceDetail: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  actions: { gap: 10 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card2 },
  primary: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  buttonText: { color: theme.colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  primaryText: { color: theme.colors.bg0 },
  disabled: { opacity: 0.45 },
  bannerLayer: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 20, alignItems: 'center', justifyContent: 'flex-start' },
  banner: { width: '100%', maxWidth: 560, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.ember, backgroundColor: theme.colors.bg0, gap: 8 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerCopy: { flex: 1, minWidth: 0, gap: 3 },
  bannerTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  bannerDetail: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17 },
  reviewButton: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card2 },
});
