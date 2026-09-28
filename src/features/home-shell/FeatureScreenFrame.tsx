import React, { type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { HomeStackParamList } from '../../app/HomeNavigator';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';

/** Give former dashboard features one consistent, permanent route back to the house. */
export default function FeatureScreenFrame({ title, children }: PropsWithChildren<{ title: string }>) {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  return <SafeAreaView style={styles.root}>
    <View style={styles.header}>
      <Pressable style={styles.back} accessibilityLabel="Back to 3D home" onPress={() => navigation.popTo('Home')}>
        <Ionicons name="arrow-back" size={20} color={theme.colors.accent} /><Text style={styles.backText}>Home</Text>
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text>
      <View style={styles.balance} />
    </View>
    <View style={styles.content}>{children}</View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg0 },
  header: { minHeight: 56, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.stroke, gap: 8 },
  back: { minHeight: 44, minWidth: 76, flexDirection: 'row', alignItems: 'center', gap: 5 },
  backText: { color: theme.colors.accent, fontSize: 13, fontWeight: '600' },
  title: { flex: 1, textAlign: 'center', color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  balance: { width: 76 },
  content: { flex: 1, minHeight: 0, overflow: 'hidden' },
});
