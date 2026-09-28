import React, { type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { HomeStackParamList } from '../../app/HomeNavigator';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';

/** Frame home workspaces with a quiet masthead and a permanent route to the property. */
export default function FeatureScreenFrame({ title, children }: PropsWithChildren<{ title: string }>) {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  return <SafeAreaView style={styles.root}>
    <View style={styles.header}>
      <Pressable style={styles.back} accessibilityLabel="Back to 3D home" onPress={() => navigation.popTo('Home')}>
        <Ionicons name="arrow-back" size={20} color={theme.colors.accent} /><Text style={styles.backText}>Home</Text>
      </Pressable>
      <View style={styles.identity}>
        <Text style={styles.eyebrow}>VANTAHOME</Text>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text>
      </View>
    </View>
    <View style={styles.content}>{children}</View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg0 },
  header: { minHeight: 66, paddingHorizontal: 18, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.stroke, gap: 18 },
  back: { minHeight: 44, minWidth: 58, flexDirection: 'row', alignItems: 'center', gap: 5 },
  backText: { color: theme.colors.accent, fontSize: 12, fontWeight: '500' },
  identity: { flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: theme.colors.stroke, paddingLeft: 18 },
  eyebrow: { color: theme.colors.muted, fontSize: 8, fontWeight: '600', letterSpacing: 1.5, marginBottom: 5 },
  title: { color: theme.colors.text, fontSize: 16, letterSpacing: -0.3, fontWeight: '500' },
  content: { flex: 1, minHeight: 0, overflow: 'hidden' },
});
