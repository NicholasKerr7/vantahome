import React from 'react';
import { StyleSheet, Text } from 'react-native';
import ModalCard from '../../components/ModalCard';
import ModalActionRow from '../../components/ModalActionRow';
import { theme } from '../../theme/theme';

/** Review deletion explicitly on both native and web without altering device state. */
export function SceneDeleteConfirmation({ name, routineCount, error, onCancel, onDelete }: {
  name: string; routineCount: number; error: string | null; onCancel: () => void; onDelete: () => void;
}) {
  return <ModalCard visible animationType="none" colors={[theme.colors.bg0, theme.colors.glass]} onRequestClose={onCancel} backdropAccessibilityLabel="Cancel scene deletion" backdropStyle={styles.backdrop} cardStyle={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>Delete this scene?</Text>
    <Text style={styles.name} numberOfLines={2}>{name}</Text>
    <Text style={styles.copy}>Your device settings stay as they are. This removes the saved scene and its dashboard shortcut.</Text>
    {routineCount > 0 && <Text style={styles.copy}>{routineCount} {routineCount === 1 ? 'routine that uses' : 'routines that use'} this scene will be paused for review.</Text>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <ModalActionRow actions={[{ label: 'Keep scene', onPress: onCancel, style: styles.cancel }, { label: 'Delete scene', onPress: onDelete, style: styles.delete }]} />
  </ModalCard>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(7,2,20,0.8)' },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 22, gap: 16, borderRadius: 26, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.stroke },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: '700' }, name: { color: theme.colors.accent, fontSize: 17, fontWeight: '600' },
  copy: { color: theme.colors.subtext, fontSize: 13, lineHeight: 20 }, error: { color: theme.colors.text, fontSize: 13, lineHeight: 18 },
  cancel: { flex: 1, backgroundColor: theme.colors.bg1 }, delete: { flex: 1, backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.alarmText },
});
