import React, { useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import CinematicSurface from '../../components/CinematicSurface';
import VantaHomeMark from '../../components/VantaHomeMark';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';

/** Share a quiet branded entry surface with readable fields when the keyboard is open. */
export function AuthEntryFrame({ title, subtitle, preview, onClose, children }: PropsWithChildren<{
  title: string; subtitle: string; preview?: boolean; onClose?: () => void;
}>) {
  const compact = useWindowDimensions().height < 700;
  return <CinematicSurface style={styles.root}>
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.page, compact && styles.pageCompact]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bounces={false} overScrollMode="never" decelerationRate="normal" showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.brandRow}>
              <VantaHomeMark size={44} decorative />
              <Text style={styles.brand}>VANTA<Text style={styles.brandTail}>HOME</Text></Text>
              {onClose && <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close account access"><Ionicons name="close" size={22} color={theme.colors.text} /></Pressable>}
            </View>
            <View style={[styles.intro, compact && styles.introCompact]}>
              <Text style={styles.eyebrow}>{preview ? 'ACCOUNT ACCESS PREVIEW' : 'YOUR HOME. YOUR PEOPLE.'}</Text>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <View style={styles.card}>{children}</View>
            {preview && <Text style={styles.preview}>Explore the screens. Account creation, email delivery and sign-in are disabled in this preview.</Text>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </CinematicSurface>;
}

/** Keep field labels visible and let password users review what they typed. */
export function AuthField({ label, secureTextEntry, ...props }: TextInputProps & { label: string }) {
  const [revealed, setRevealed] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputRow}>
      <TextInput {...props} accessibilityLabel={label} secureTextEntry={Boolean(secureTextEntry && !revealed)} placeholderTextColor={theme.colors.muted} style={styles.input} />
      {secureTextEntry && <Pressable style={styles.reveal} onPress={() => setRevealed((value) => !value)} accessibilityLabel={`${revealed ? 'Hide' : 'Show'} ${label.toLowerCase()}`}><Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={19} color={theme.colors.accentText} /></Pressable>}
    </View>
  </View>;
}

/** Give every account mutation one consistent, clearly disabled submission control. */
export function AuthAction({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return <Pressable style={[styles.action, (disabled || busy) && styles.disabled]} disabled={disabled || busy} onPress={onPress} accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}>
    {busy ? <ActivityIndicator color={theme.colors.bg0} /> : <Text style={styles.actionText}>{label}</Text>}
  </Pressable>;
}

/** Announce validation and delivery feedback without replacing the current form. */
export function AuthMessage({ message, error }: { message: string; error?: boolean }) {
  return <View style={styles.message} accessibilityLiveRegion="polite" accessibilityRole={error ? 'alert' : undefined}><Text style={styles.messageText}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  pageCompact: { padding: 16 },
  content: { width: '100%', maxWidth: 460 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { flex: 1, color: theme.colors.text, fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  brandTail: { color: theme.colors.accentText, fontWeight: '300' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: theme.colors.card2 },
  intro: { gap: 10, marginTop: 30, marginBottom: 22 },
  introCompact: { gap: 6, marginTop: 16, marginBottom: 16 },
  eyebrow: { color: theme.colors.accentText, fontSize: 9, fontWeight: '600', letterSpacing: 2 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '500', letterSpacing: -0.8 },
  subtitle: { color: theme.colors.subtext, fontSize: 13, lineHeight: 20 },
  card: { borderRadius: theme.radius.xl, backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.stroke, padding: 18, gap: 14 },
  preview: { color: theme.colors.subtext, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 16 },
  field: { gap: 7 },
  label: { color: theme.colors.accentText, fontSize: 11, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: theme.radius.sm, backgroundColor: theme.colors.overlay, borderWidth: 1, borderColor: theme.colors.stroke },
  input: { flex: 1, minWidth: 0, minHeight: 46, paddingHorizontal: 14, paddingVertical: 10, color: theme.colors.text, fontSize: 14 },
  reveal: { width: 44, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center' },
  action: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.accent, borderRadius: theme.radius.sm },
  actionText: { color: theme.colors.bg0, fontWeight: '600', fontSize: 14 },
  disabled: { opacity: 0.45 },
  message: { padding: 12, borderRadius: theme.radius.sm, backgroundColor: theme.colors.overlay },
  messageText: { color: theme.colors.text, fontSize: 12, lineHeight: 18 },
});
