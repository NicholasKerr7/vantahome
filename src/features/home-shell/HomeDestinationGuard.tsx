import React, { type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { openHomeFeature } from '../../app/homeNavigation';
import Pressable from '../../components/Pressable';
import { useHomeStore } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import type { HomeDestination } from './homeDestinations';
import { selectHomeNavigationAccess } from './homeNavigationAccess';

/** Block direct links and unmount private content immediately when a role or membership changes. */
export default function HomeDestinationGuard({ destination, children }: PropsWithChildren<{ destination: HomeDestination }>) {
  const navigation = useNavigation();
  const allowed = useHomeStore((state) => selectHomeNavigationAccess(state)[destination]);
  if (allowed) return <>{children}</>;
  return <View style={styles.root} accessibilityLiveRegion="polite">
    <Text accessibilityRole="header" style={styles.title}>This area is unavailable</Text>
    <Text style={styles.detail}>Your current home access does not include this area.</Text>
    <Pressable accessibilityLabel="Return to your home" onPress={() => openHomeFeature(navigation.dispatch, 'Home')} style={styles.action}>
      <Text style={styles.actionLabel}>Return home</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: theme.colors.bg0 },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: '500', textAlign: 'center' },
  detail: { color: theme.colors.subtext, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 360 },
  action: { minHeight: 48, paddingHorizontal: 20, justifyContent: 'center', borderRadius: 18, backgroundColor: theme.colors.accent },
  actionLabel: { color: theme.colors.bg0, fontSize: 14, fontWeight: '600' },
});
