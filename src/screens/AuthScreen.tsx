import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Pressable from '../components/Pressable';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../app/AppNavigator';
import { useHomeStore } from '../store/useHomeStore';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useResponsive } from '../theme/layout';
import BackgroundLines from '../components/BackgroundLines';
import { theme } from '../theme/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

export default function AuthScreen({ navigation }: Props) {
  const { contentWidth, gutter, isTablet, isLandscape, scale } = useResponsive(640);
  const cardWidth = Math.min(contentWidth - gutter * 2, isTablet ? (isLandscape ? 640 : 560) : 420);
  const cardPad = Math.round((isTablet ? 22 : 18) * scale);
  const cardRadius = Math.round((isTablet ? 30 : 28) * scale);
  const titleSize = Math.round((isTablet ? 28 : 24) * scale);
  const subSize = Math.round((isTablet ? 14 : 12) * scale);
  const segmentHeight = Math.round((isTablet ? 40 : 36) * scale);
  const segmentText = Math.round((isTablet ? 13 : 12) * scale);
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const inputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const inputRadius = Math.round(inputHeight * 0.32);
  const eyeBtnSize = inputHeight;
  const hintSize = Math.round((isTablet ? 13 : 12) * scale);
  const ctaHeight = Math.round((isTablet ? 58 : 54) * scale);
  const ctaText = Math.round((isTablet ? 14 : 13) * scale);
  const socialHeight = Math.round((isTablet ? 50 : 46) * scale);
  const setProfile = useHomeStore((s) => s.setProfile);
  const profile = useHomeStore((s) => s.profile);
  const [mode, setMode] = useState<'create' | 'login'>('create');
  const [name, setName] = useState(profile.name ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const emailValid = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);
  const passwordOk = password.trim().length >= 6;
  const confirmOk = mode === 'create' ? confirm.trim().length >= 6 && confirm.trim() === password.trim() : true;
  const canContinue =
    mode === 'login'
      ? emailValid && passwordOk
      : name.trim().length > 1 && emailValid && passwordOk && confirmOk;

  const handleContinue = () => {
    const safeEmail = email.trim();
    const fallbackName = safeEmail.split('@')[0]?.replace(/[._-]+/g, ' ') ?? 'Home';
    setProfile({
      name: mode === 'login' ? (profile.name || fallbackName) : name.trim(),
      email: safeEmail,
    });
    navigation.replace('Onboarding');
  };

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.outer, { padding: gutter }]}
    >
      <BackgroundLines />
      <LinearGradient
        colors={['rgba(180,107,255,0.42)', 'rgba(180,107,255,0.0)']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.auroraTop}
      />
      <LinearGradient
        colors={['rgba(122,92,255,0.35)', 'rgba(122,92,255,0.0)']}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.auroraBottom}
      />
      <View style={styles.orbitRing} />
      <View style={styles.orbitRingSmall} />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { width: cardWidth, padding: cardPad, borderRadius: cardRadius }]}>
            <Text style={[styles.h1, { fontSize: titleSize }]}>Welcome to VantaHome</Text>
            <Text style={[styles.sub, { fontSize: subSize }]}>
              Create an account or sign in to sync devices across every ecosystem.
            </Text>

            <View style={styles.segment}>
              {(['create', 'login'] as const).map((k) => (
                <Pressable
                  key={k}
                  style={[styles.segmentBtn, { height: segmentHeight }, mode === k && styles.segmentBtnActive]}
                  onPress={() => setMode(k)}
                >
                  <Text style={[styles.segmentText, { fontSize: segmentText }, mode === k && styles.segmentTextActive]}>
                    {k === 'create' ? 'Create' : 'Login'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {mode === 'create' && (
              <View style={styles.field}>
                <Text style={[styles.label, { fontSize: labelSize }]}>Full name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Alex Carter"
                  placeholderTextColor="rgba(12,12,18,0.35)"
                  style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={[styles.label, { fontSize: labelSize }]}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="rgba(12,12,18,0.35)"
                style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { fontSize: labelSize }]}>Password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(12,12,18,0.35)"
                  style={[styles.input, styles.inputInline, { height: inputHeight, borderRadius: inputRadius }]}
                  secureTextEntry={!showPassword}
                  returnKeyType={mode === 'create' ? 'next' : 'done'}
                />
                <Pressable
                  style={[styles.eyeBtn, { width: eyeBtnSize, height: eyeBtnSize, borderRadius: inputRadius }]}
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={Math.round(18 * scale)}
                    color="rgba(12,12,18,0.55)"
                  />
                </Pressable>
              </View>
            </View>

            {mode === 'create' && (
              <View style={styles.field}>
                <Text style={[styles.label, { fontSize: labelSize }]}>Confirm password</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(12,12,18,0.35)"
                    style={[styles.input, styles.inputInline, { height: inputHeight, borderRadius: inputRadius }]}
                    secureTextEntry={!showConfirm}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={[styles.eyeBtn, { width: eyeBtnSize, height: eyeBtnSize, borderRadius: inputRadius }]}
                    onPress={() => setShowConfirm((v) => !v)}
                  >
                    <Ionicons
                      name={showConfirm ? 'eye-off' : 'eye'}
                      size={Math.round(18 * scale)}
                      color="rgba(12,12,18,0.55)"
                    />
                  </Pressable>
                </View>
              </View>
            )}

            <View style={styles.hintRow}>
              <Text style={[styles.hintText, { fontSize: hintSize }]}>
                {mode === 'create'
                  ? 'Password must be at least 6 characters.'
                  : 'Forgot password?'}
              </Text>
              {mode === 'login' && (
                <Pressable onPress={() => {}}>
                  <Text style={[styles.hintLink, { fontSize: hintSize }]}>Reset</Text>
                </Pressable>
              )}
            </View>

            <Pressable style={[styles.cta, !canContinue && styles.ctaDisabled]} onPress={handleContinue} disabled={!canContinue}>
              <LinearGradient
                colors={['#B08CFF', '#6B3CFF']}
                start={{ x: 0.1, y: 0.2 }}
                end={{ x: 0.9, y: 0.9 }}
                style={[styles.ctaInner, { height: ctaHeight }, !canContinue && { opacity: 0.6 }]}
              >
                <Text style={[styles.ctaText, { fontSize: ctaText }]}>
                  {mode === 'create' ? 'Create account' : 'Sign in'}
                </Text>
                <Ionicons name="arrow-forward" size={Math.round(16 * scale)} color="#FFFFFF" style={{ marginLeft: 8 }} />
              </LinearGradient>
            </Pressable>

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.orLine} />
            </View>

            <View style={styles.socialRow}>
              <Pressable style={[styles.socialBtn, { height: socialHeight, borderRadius: Math.round(socialHeight * 0.3) }]}>
                <Ionicons name="logo-apple" size={Math.round(18 * scale)} color="#0C0C12" />
                <Text style={[styles.socialText, { fontSize: segmentText }]}>Apple</Text>
              </Pressable>
              <Pressable style={[styles.socialBtn, { height: socialHeight, borderRadius: Math.round(socialHeight * 0.3) }]}>
                <Ionicons name="logo-google" size={Math.round(18 * scale)} color="#0C0C12" />
                <Text style={[styles.socialText, { fontSize: segmentText }]}>Google</Text>
              </Pressable>
            </View>

            <Pressable onPress={() => navigation.replace('Onboarding')} style={styles.skip}>
              <Text style={[styles.skipText, { fontSize: hintSize }]}>Skip for now</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, justifyContent: 'center' },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  auroraTop: {
    position: 'absolute',
    top: -220,
    right: -180,
    width: 520,
    height: 520,
    borderRadius: 260,
    transform: [{ rotate: '16deg' }],
  },
  auroraBottom: {
    position: 'absolute',
    bottom: -240,
    left: -180,
    width: 520,
    height: 520,
    borderRadius: 260,
    transform: [{ rotate: '-12deg' }],
  },
  orbitRing: {
    position: 'absolute',
    top: -240,
    left: -140,
    width: 520,
    height: 520,
    borderRadius: 260,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  orbitRingSmall: {
    position: 'absolute',
    bottom: -140,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    borderWidth: 1,
    borderColor: 'rgba(180,107,255,0.22)',
  },
  glowTop: {
    position: 'absolute',
    top: -160,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(180,107,255,0.28)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -200,
    left: -140,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(122,92,255,0.26)',
  },
  card: {
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.94)',
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    shadowColor: '#6B3CFF',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  h1: { fontSize: 24, fontWeight: '900', color: '#0C0C12' },
  sub: { marginTop: 6, color: 'rgba(12,12,18,0.55)', fontWeight: '700' },
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(12,12,18,0.08)',
    borderRadius: 999,
    marginTop: 16,
    padding: 4,
  },
  segmentBtn: { flex: 1, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segmentBtnActive: { backgroundColor: '#FFFFFF' },
  segmentText: { fontWeight: '800', color: 'rgba(12,12,18,0.55)' },
  segmentTextActive: { color: '#0C0C12' },
  field: { marginTop: 12 },
  label: { color: 'rgba(12,12,18,0.75)', fontWeight: '800', marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    paddingHorizontal: 12,
    color: '#0C0C12',
    fontWeight: '700',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputInline: { flex: 1 },
  eyeBtn: {
    marginLeft: 8,
    width: 40,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(12,12,18,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  hintText: { color: 'rgba(12,12,18,0.45)', fontWeight: '700', fontSize: 12 },
  hintLink: { color: '#6B3CFF', fontWeight: '800', fontSize: 12 },
  cta: { marginTop: 22, borderRadius: 999, overflow: 'hidden' },
  ctaInner: {
    height: 54,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6B3CFF',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  ctaText: { color: '#FFFFFF', fontWeight: '800' },
  ctaDisabled: { opacity: 0.65 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  orLine: { flex: 1, height: 1, backgroundColor: 'rgba(12,12,18,0.12)' },
  orText: { color: 'rgba(12,12,18,0.45)', fontWeight: '800', fontSize: 12 },
  socialRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  socialBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(12,12,18,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  socialText: { color: '#0C0C12', fontWeight: '800' },
  skip: { marginTop: 14, alignSelf: 'center' },
  skipText: { color: 'rgba(12,12,18,0.55)', fontWeight: '800' },
});
