import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import { useAccountIdentity } from './useAccountIdentity';

/** Keep the current person visible without taking the house's space on a phone. */
export default function DashboardAccountButton({ onPress }: { onPress: () => void }) {
  const { identity } = useAccountIdentity();
  const { width, height, fontScale } = useWindowDimensions();
  const expanded = Math.min(width, height) >= 600 && fontScale <= 1.3;
  const demo = identity.mode === 'demo';
  return <Pressable style={[styles.button, expanded && styles.expandedButton]} onPress={onPress}
    accessibilityLabel={`Open account: ${identity.name}`} accessibilityHint="View your identity and household access">
    <View style={styles.avatar}>
      {demo ? <Ionicons name="person-outline" size={17} color={theme.colors.accentText} />
        : <Text style={styles.initials} numberOfLines={1}>{identity.initials}</Text>}
    </View>
    {(expanded || demo) && <View style={styles.copy}>
      <Text style={styles.name} numberOfLines={1}>{expanded && demo ? 'Demo profile' : identity.firstName}</Text>
      {expanded && <Text style={styles.detail} numberOfLines={1}>{demo ? 'Local preview' : identity.role ?? 'Your account'}</Text>}
    </View>}
    {expanded && <Ionicons name="chevron-down" size={13} color={theme.colors.subtext} />}
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 44, minWidth: 44, maxWidth: 112, paddingHorizontal: 6, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 24, backgroundColor: theme.colors.card2 },
  expandedButton: { maxWidth: 192, paddingRight: 12, gap: 9 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  initials: { fontSize: 11, fontWeight: '700', color: theme.colors.accentText },
  copy: { minWidth: 0, flexShrink: 1, gap: 2 },
  name: { fontSize: 11, fontWeight: '600', color: theme.colors.text },
  detail: { fontSize: 9, color: theme.colors.subtext },
});
