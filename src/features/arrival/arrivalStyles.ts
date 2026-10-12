import { StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

/** Match the baked film and native splash exactly, including letterboxed space. */
export const ARRIVAL_BACKGROUND = '#050612';

export const arrivalStyles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 1000, backgroundColor: ARRIVAL_BACKGROUND },
  opaque: { opacity: 1 },
  fill: { flex: 1 },
  media: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  mediaHidden: { opacity: 0 },
  mediaDimmed: { opacity: 0.32 },
  safeArea: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 28, paddingVertical: 28 },
  contentCompact: { paddingHorizontal: 20, paddingVertical: 16 },
  contentWide: { paddingBottom: 16 },
  // Match the full-viewport 4:3 contain frame instead of moving the native splash artwork.
  brandStage: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  artworkFrameByWidth: { width: '100%', aspectRatio: 4 / 3 },
  artworkFrameByHeight: { height: '100%', aspectRatio: 4 / 3 },
  wordmarkDock: { position: 'absolute', top: '92%', left: 0, right: 0, alignItems: 'center' },
  wordmark: { color: '#DBD4EF', fontSize: 12, lineHeight: 18, fontWeight: '500', letterSpacing: 4, textAlign: 'center' },
  screenReaderStatus: { position: 'absolute', width: 1, height: 1, margin: -1, overflow: 'hidden' },
  footer: { width: '100%', maxWidth: 540, alignSelf: 'center' },
  footerWide: { maxWidth: 600 },
  title: { color: '#F5F1FF', fontSize: 20, lineHeight: 28, fontWeight: '400', letterSpacing: -0.3, textAlign: 'center' },
  titleCompact: { fontSize: 17, lineHeight: 24 },
  recovery: { backgroundColor: '#0D0D20', borderColor: '#343047', borderWidth: 1, borderRadius: 24, padding: 23, gap: 12 },
  recoveryCompact: { padding: 18, borderRadius: 20 },
  statusLabel: { color: theme.colors.accentText, fontSize: 10, lineHeight: 16, fontWeight: '600', letterSpacing: 1.8, textAlign: 'center' },
  description: { color: '#C1BDCF', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 7 },
  actionsLargeText: { flexDirection: 'column' },
  button: { minHeight: 48, flexGrow: 1, flexBasis: 120, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 18, borderRadius: 15, borderWidth: 1, borderColor: '#474057' },
  buttonLargeText: { flexBasis: 'auto', width: '100%' },
  buttonPrimary: { backgroundColor: '#D9C0FF', borderColor: '#D9C0FF' },
  buttonSecondary: { backgroundColor: '#191627' },
  buttonText: { color: '#F5F1FF', fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  buttonTextPrimary: { color: '#180D29' },
  disabled: { opacity: 0.5 },
  actionError: { color: theme.colors.alarmText, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
