import React from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Pressable from '../../components/Pressable';
import VantaHomeMark from '../../components/VantaHomeMark';
import { theme } from '../../theme/theme';
import VerificationArchitecture from './VerificationArchitecture';
import ArrivalBackdrop from './ArrivalBackdrop';
import { verificationStyles as styles } from './homeVerificationStyles';

type Props = {
  status: 'preparing' | 'checking' | 'unavailable';
  variant?: 'arrival' | 'returning';
  statusMessage?: string;
  statusDescription?: string;
  onRetry?: () => void;
  onSignOut?: () => void;
  signingOut?: boolean;
  retrying?: boolean;
  signOutError?: string | null;
};

const phaseCopy = {
  preparing: {
    label: 'PREPARING YOUR HOME',
    message: 'Preparing your account…',
    description: 'Preparing this device before checking your home access.',
  },
  checking: {
    label: 'VERIFYING ACCESS',
    message: 'Verifying your home…',
    description: 'Checking your current household permissions before opening your home.',
  },
  unavailable: {
    label: 'ACCESS UNCONFIRMED',
    message: 'Unable to verify home access.',
    description: 'Check your connection, then retry. Your controls will return once access is verified.',
  },
} as const;

/** Share one truthful arrival surface across account preparation, verification, and return checks. */
export default function HomeVerificationScreen({
  status, variant = 'arrival', statusMessage, statusDescription, onRetry, onSignOut,
  signingOut = false, retrying = false, signOutError,
}: Props) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = height - insets.top - insets.bottom;
  const compact = availableHeight < 760;
  const largeText = fontScale >= 1.35;
  const returning = variant === 'returning';
  const wide = width >= 900 && width > height && !largeText && !returning;
  const unavailable = status === 'unavailable';
  const copy = phaseCopy[status];
  return <View style={styles.root} testID="home-verification-screen" accessibilityViewIsModal>
    <ArrivalBackdrop />
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact, largeText && styles.scrollContentAccessible]}
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
          <View style={[styles.main, compact && styles.mainCompact, wide && styles.mainWide, largeText && styles.mainAccessible]}>
            {!largeText && <View style={[styles.visual, compact && styles.visualCompact, availableHeight < 620 && styles.visualSmall, wide && styles.visualWide, returning && styles.visualReturning]}>
              <VerificationArchitecture active={!unavailable && !signingOut} />
            </View>}
            <View style={[styles.narrative, wide && styles.narrativeWide]}>
              {!largeText && !returning && <Text style={styles.eyebrow}>{unavailable ? 'YOUR CONNECTION, PAUSED' : 'A MOMENT FROM HOME'}</Text>}
              <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact, wide && styles.titleWide, largeText && styles.titleAccessible, returning && styles.titleReturning]}>
                {unavailable ? 'Let’s reconnect.' : returning ? 'Returning to your home…' : 'Your world.\nWithin reach.'}
              </Text>
              <View style={[styles.statusCard, compact && styles.statusCardCompact]}>
                <View style={styles.statusRow}>
                  <View style={styles.statusIcon} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Ionicons name={unavailable ? 'cloud-offline-outline' : 'scan-outline'} size={19} color={unavailable ? theme.colors.ember : theme.colors.accentText} />
                  </View>
                  <View style={styles.statusText} accessibilityLiveRegion="polite">
                    <Text style={[styles.statusLabel, unavailable && styles.statusLabelPaused]}>{copy.label}</Text>
                    <Text style={styles.statusTitle}>{statusMessage ?? copy.message}</Text>
                  </View>
                </View>
                <View style={styles.hairline} />
                <Text style={styles.statusDescription}>{statusDescription ?? copy.description}</Text>
              </View>
              {(onRetry || onSignOut) && <View style={[styles.actions, largeText && styles.actionsAccessible]}>
                {onRetry && <Pressable accessibilityLabel="Retry" onPress={onRetry} disabled={signingOut || retrying} style={[styles.button, styles.buttonPrimary, (signingOut || retrying) && styles.disabled]}>
                  <Ionicons name="refresh-outline" size={17} color={theme.colors.bg0} accessible={false} />
                  <Text style={[styles.buttonText, styles.buttonTextPrimary]}>{retrying ? 'Retrying…' : 'Retry'}</Text>
                </Pressable>}
                {onSignOut && <Pressable onPress={onSignOut} disabled={signingOut || retrying} style={[styles.button, styles.buttonSecondary, (signingOut || retrying) && styles.disabled]}>
                  <Text style={styles.buttonText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
                </Pressable>}
              </View>}
              {signOutError && <Text accessibilityRole="alert" style={styles.actionError}>{signOutError}</Text>}
            </View>
          </View>
          {!largeText && !returning && availableHeight >= 600 && <View style={styles.footer}>
            <View style={styles.footerRule} />
            <Text style={styles.footerText}>Your spaces. Your permissions.</Text>
          </View>}
        </View>
      </ScrollView>
    </SafeAreaView>
  </View>;
}
