import React, { type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CinematicSurface from '../../components/CinematicSurface';
import { theme } from '../../theme/theme';
import HomeWorkspace from './HomeWorkspace';
import type { HomeSection } from './HomeNavigation';

/** Frame home workspaces with a quiet masthead and a permanent route to the property. */
export default function FeatureScreenFrame({ title, section, children }: PropsWithChildren<{ title: string; section: HomeSection }>) {
  return <SafeAreaView style={styles.root}>
    <HomeWorkspace section={section}>
    <View style={styles.header}>
      <View style={styles.identity}>
        <Text style={styles.eyebrow}>VANTAHOME</Text>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text>
      </View>
    </View>
    <CinematicSurface style={styles.content}>{children}</CinematicSurface>
    </HomeWorkspace>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg0 },
  header: { minHeight: 54, paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.stroke },
  identity: { flex: 1, minWidth: 0 },
  eyebrow: { color: theme.colors.muted, fontSize: 8, fontWeight: '600', letterSpacing: 1.5, marginBottom: 5 },
  title: { color: theme.colors.text, fontSize: 16, letterSpacing: -0.3, fontWeight: '500' },
  content: { flex: 1, minHeight: 0, overflow: 'hidden' },
});
