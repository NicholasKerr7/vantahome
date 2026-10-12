import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Pressable from '../../components/Pressable';
import { useDecorativeMotion } from '../../components/useDecorativeMotion';
import ArrivalFilm from './ArrivalFilm';
import { arrivalStyles as styles } from './arrivalStyles';

const POSTER = require('../../../assets/brand/motion/vantahome-arrival-poster.png');
export const ARRIVAL_SLOW_MS = 8_000;
export const ARRIVAL_FADE_MS = 300;
const POSTER_FALLBACK_MS = 1_500;

export type ArrivalStatus = 'preparing' | 'checking' | 'rendering' | 'ready' | 'inactive' | 'unavailable';
export type CinematicArrivalProps = {
  status: ArrivalStatus;
  returning?: boolean;
  onRetry?: () => void;
  onSignOut?: () => void;
  signingOut?: boolean;
  retrying?: boolean;
  signOutError?: string | null;
  statusMessage?: string;
  statusDescription?: string;
  onShowControls?: () => void;
  onCoveredChange?: (covered: boolean) => void;
  onPosterReady?: () => void;
};

const COPY = {
  preparing: { quiet: 'A moment from home.', title: 'Preparing your account…', description: 'This device is preparing your account before checking home access.' },
  checking: { quiet: 'Opening your home.', title: 'Verifying home access…', description: 'Checking your current household permissions. Your home will open once access is verified.' },
  rendering: { quiet: 'Your home, coming into focus.', title: 'The 3D view is still preparing.', description: 'Your device controls are available while the property view opens.' },
  unavailable: { quiet: 'Let’s reconnect.', title: 'Unable to verify home access.', description: 'Check your connection, then retry. Your controls will return once access is verified.' },
  ready: { quiet: 'Welcome home.', title: '', description: '' },
  inactive: { quiet: '', title: '', description: '' },
} as const;

/** Carry launch, verification, and rendering through one interruptible cinematic surface. */
export default function CinematicArrival({
  status, returning = false, onRetry, onSignOut, signingOut = false, retrying = false,
  signOutError, statusMessage, statusDescription, onShowControls, onCoveredChange, onPosterReady,
}: CinematicArrivalProps) {
  const blocking = status !== 'ready' && status !== 'inactive';
  const unavailable = status === 'unavailable';
  const [retained, setRetained] = useState(blocking);
  const [slow, setSlow] = useState(false);
  const [stillArrival, setStillArrival] = useState(returning);
  const [filmStarted, setFilmStarted] = useState(false);
  const previouslyBlocking = useRef(blocking);
  const staticArrival = returning || stillArrival;
  const visible = status !== 'inactive' && (blocking || retained);
  const motionAllowed = useDecorativeMotion(visible && status !== 'unavailable' && !signingOut);
  const opacity = useSharedValue(1);
  const revealRevision = useRef(0);
  const coveredCallback = useRef(onCoveredChange);
  const posterCallback = useRef(onPosterReady);
  const posterSettled = useRef(false);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height - insets.top - insets.bottom < 680;
  const largeText = fontScale >= 1.35;
  const wide = width >= 900 && width > height;
  const fadingStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Keep the return policy for this entire arrival, even when verification
  // clears the host's returning flag before the final ready render.
  useLayoutEffect(() => {
    if (blocking && (!previouslyBlocking.current || returning)) setStillArrival(returning);
    previouslyBlocking.current = blocking;
  }, [blocking, returning]);
  useEffect(() => {
    if (!visible) setFilmStarted(false);
    else if (motionAllowed && !staticArrival) setFilmStarted(true);
  }, [motionAllowed, staticArrival, visible]);

  /** A completed or superseded reveal can never dismiss a newly required access check. */
  const finishReveal = useCallback((revision: number) => {
    if (revision === revealRevision.current) setRetained(false);
  }, []);

  useLayoutEffect(() => {
    const revision = ++revealRevision.current;
    cancelAnimation(opacity);
    if (blocking) {
      opacity.value = 1;
      setRetained(true);
    } else if (status === 'inactive' || staticArrival || !motionAllowed) {
      opacity.value = 0;
      setRetained(false);
    } else {
      opacity.value = withTiming(0, {
        duration: ARRIVAL_FADE_MS, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never,
      }, (finished) => { if (finished) runOnJS(finishReveal)(revision); });
    }
    return () => { revealRevision.current += 1; cancelAnimation(opacity); };
  }, [blocking, finishReveal, motionAllowed, opacity, staticArrival, status === 'inactive']);

  useLayoutEffect(() => {
    coveredCallback.current = onCoveredChange;
    posterCallback.current = onPosterReady;
    onCoveredChange?.(visible);
  }, [onCoveredChange, onPosterReady, visible]);
  useEffect(() => () => { coveredCallback.current?.(false); }, []);

  /** Hide the native splash once local artwork settles; media is never a startup dependency. */
  const acknowledgePoster = useCallback(() => {
    if (posterSettled.current) return;
    posterSettled.current = true;
    posterCallback.current?.();
  }, []);
  useEffect(() => {
    if (!visible) { acknowledgePoster(); return; }
    const timeout = setTimeout(acknowledgePoster, POSTER_FALLBACK_MS);
    return () => clearTimeout(timeout);
  }, [acknowledgePoster, visible]);

  useEffect(() => {
    setSlow(false);
    if (!blocking || unavailable) return;
    const timeout = setTimeout(() => setSlow(true), ARRIVAL_SLOW_MS);
    return () => clearTimeout(timeout);
  }, [blocking, unavailable]);

  if (!visible) return null;
  const detailed = blocking && (unavailable || slow || Boolean(signOutError));
  const canShowControls = status === 'rendering' && slow && Boolean(onShowControls);
  const disabled = signingOut || retrying;
  const copy = COPY[status];

  return <Animated.View
    testID="cinematic-arrival"
    style={[styles.root, fadingStyle, blocking && styles.opaque]}
    accessibilityViewIsModal
    importantForAccessibility="yes"
  >
    <View style={[styles.media, detailed && styles.mediaDimmed]} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image testID="arrival-poster" source={POSTER} style={styles.media} resizeMode="contain" accessible={false} onLoad={acknowledgePoster} onError={acknowledgePoster} />
      {!staticArrival && (motionAllowed || filmStarted) && <ArrivalFilm motionAllowed={motionAllowed} resolving={status === 'ready'} />}
    </View>
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.fill} contentContainerStyle={[styles.content, compact && styles.contentCompact, largeText && styles.contentLargeText]} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" decelerationRate="normal">
        <View style={styles.header}>
          <Text accessibilityRole="header" accessibilityLabel="VantaHome" style={styles.wordmark}>VANTA<Text style={styles.wordmarkAccent}>HOME</Text></Text>
          {!largeText && <Text style={styles.signature}>YOUR WORLD. CONNECTED.</Text>}
        </View>
        <View style={[styles.footer, compact && styles.footerCompact, wide && styles.footerWide]}>
          {detailed ? <View style={[styles.recovery, compact && styles.recoveryCompact]}>
            <View accessibilityLiveRegion="polite">
              <Text style={styles.statusLabel}>{unavailable ? 'OPENING PAUSED' : 'A LITTLE MORE TIME'}</Text>
              <Text style={[styles.title, compact && styles.titleCompact]}>{statusMessage ?? copy.title}</Text>
            </View>
            <Text style={styles.description}>{statusDescription ?? copy.description}</Text>
            {(onRetry || onSignOut || canShowControls) && <View style={[styles.actions, largeText && styles.actionsLargeText]}>
              {canShowControls && <Pressable onPress={onShowControls} disabled={disabled} style={[styles.button, styles.buttonPrimary, largeText && styles.buttonLargeText, disabled && styles.disabled]}>
                <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Open device controls</Text>
              </Pressable>}
              {onRetry && <Pressable accessibilityLabel="Retry" onPress={onRetry} disabled={disabled} style={[styles.button, canShowControls ? styles.buttonSecondary : styles.buttonPrimary, largeText && styles.buttonLargeText, disabled && styles.disabled]}>
                <Text style={[styles.buttonText, !canShowControls && styles.buttonTextPrimary]}>{retrying ? 'Retrying…' : 'Retry'}</Text>
              </Pressable>}
              {onSignOut && <Pressable onPress={onSignOut} disabled={disabled} style={[styles.button, styles.buttonSecondary, largeText && styles.buttonLargeText, disabled && styles.disabled]}>
                <Text style={styles.buttonText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
              </Pressable>}
            </View>}
            {signOutError && <Text accessibilityRole="alert" style={styles.actionError}>{signOutError}</Text>}
          </View> : <View style={[styles.quietStatus, compact && styles.quietStatusCompact]} accessibilityLiveRegion="polite">
            <View style={styles.statusAccent} accessible={false} />
            <Text style={[styles.title, compact && styles.titleCompact]}>{staticArrival ? 'Welcome back.' : copy.quiet}</Text>
            {!largeText && <Text style={styles.subtitle}>{staticArrival ? 'A moment to reconnect with your home.' : 'Every detail, coming together.'}</Text>}
          </View>}
        </View>
      </ScrollView>
    </SafeAreaView>
  </Animated.View>;
}
