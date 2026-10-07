import React, { useId } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Pressable from '../../components/Pressable';
import VantaHomeMark from '../../components/VantaHomeMark';
import { theme } from '../../theme/theme';
import VerificationArchitecture from './VerificationArchitecture';
import { verificationStyles as styles } from './homeVerificationStyles';

type Props = {
  status: 'checking' | 'unavailable';
  onRetry: () => void;
  onSignOut: () => void;
  signingOut?: boolean;
  signOutError?: string | null;
};

/** A static, inexpensive violet atmosphere behind the live verification state. */
function VerificationBackdrop() {
  const id = useId().replace(/:/g, '');
  return <View style={styles.backdrop} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 600 1000" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={`${id}-shade`} x1="0" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor={theme.colors.bg0} /><Stop offset="1" stopColor={theme.colors.overlayStrong} />
        </LinearGradient>
        <RadialGradient id={`${id}-light`}>
          <Stop offset="0" stopColor={theme.colors.accent2} stopOpacity="0.38" /><Stop offset="1" stopColor={theme.colors.accent2} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="600" height="1000" fill={`url(#${id}-shade)`} />
      <Ellipse cx="490" cy="240" rx="370" ry="420" fill={`url(#${id}-light)`} />
      <Ellipse cx="40" cy="870" rx="360" ry="250" fill={`url(#${id}-light)`} opacity="0.45" />
      <Path d="M-120 800 L600 80 M-120 818 L620 78 M0 1140 L720 420" stroke={theme.colors.accentText} strokeOpacity="0.035" fill="none" />
    </Svg>
  </View>;
}

/** Explain the real permission check without exposing a home or inventing loading progress. */
export default function HomeVerificationScreen({ status, onRetry, onSignOut, signingOut = false, signOutError }: Props) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = height - insets.top - insets.bottom;
  const compact = availableHeight < 760;
  const largeText = fontScale >= 1.35;
  const wide = width >= 900 && width > height && !largeText;
  const checking = status === 'checking';
  return <View style={styles.root} testID="home-verification-screen" accessibilityViewIsModal>
    <VerificationBackdrop />
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        decelerationRate="normal"
      >
        <View style={styles.shell}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <VantaHomeMark size={30} decorative />
              <Text style={styles.wordmark}>VANTAHOME</Text>
            </View>
            {!largeText && <Text style={styles.headerLabel}>HOME ACCESS</Text>}
          </View>
          <View style={[styles.main, compact && styles.mainCompact, wide && styles.mainWide]}>
            {!largeText && <View style={[styles.visual, compact && styles.visualCompact, availableHeight < 620 && styles.visualSmall, wide && styles.visualWide]}>
              <VerificationArchitecture active={checking && !signingOut} />
            </View>}
            <View style={[styles.narrative, wide && styles.narrativeWide]}>
              {!largeText && <Text style={styles.eyebrow}>{checking ? 'A MOMENT FROM HOME' : 'YOUR CONNECTION, PAUSED'}</Text>}
              <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact, wide && styles.titleWide, largeText && styles.titleAccessible]}>
                {checking ? 'Your world.\nWithin reach.' : 'Let’s reconnect.'}
              </Text>
              <View style={[styles.statusCard, compact && styles.statusCardCompact]}>
                <View style={styles.statusRow}>
                  <View style={styles.statusIcon} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Ionicons name={checking ? 'scan-outline' : 'cloud-offline-outline'} size={19} color={checking ? theme.colors.accentText : theme.colors.ember} />
                  </View>
                  <View style={styles.statusText} accessibilityLiveRegion="polite">
                    <Text style={[styles.statusLabel, !checking && styles.statusLabelPaused]}>{checking ? 'VERIFYING ACCESS' : 'ACCESS UNCONFIRMED'}</Text>
                    <Text style={styles.statusTitle}>{checking ? 'Verifying your home…' : 'Unable to verify home access.'}</Text>
                  </View>
                </View>
                <View style={styles.hairline} />
                <Text style={styles.statusDescription}>{checking
                  ? 'Checking your current household permissions before opening your home.'
                  : 'Check your connection, then retry. Your controls will return once access is verified.'}</Text>
              </View>
              <View style={[styles.actions, largeText && styles.actionsAccessible]}>
                <Pressable accessibilityLabel="Retry" onPress={onRetry} disabled={signingOut} style={[styles.button, styles.buttonPrimary, signingOut && styles.disabled]}>
                  <Ionicons name="refresh-outline" size={17} color={theme.colors.bg0} accessible={false} />
                  <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Retry</Text>
                </Pressable>
                <Pressable onPress={onSignOut} disabled={signingOut} style={[styles.button, styles.buttonSecondary, signingOut && styles.disabled]}>
                  <Text style={styles.buttonText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
                </Pressable>
              </View>
              {signOutError && <Text accessibilityRole="alert" style={styles.actionError}>{signOutError}</Text>}
            </View>
          </View>
          {!largeText && availableHeight >= 600 && <View style={styles.footer}>
            <View style={styles.footerRule} />
            <Text style={styles.footerText}>Your spaces. Your permissions.</Text>
          </View>}
        </View>
      </ScrollView>
    </SafeAreaView>
  </View>;
}
