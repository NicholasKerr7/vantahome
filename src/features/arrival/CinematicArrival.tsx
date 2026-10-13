import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import Pressable from '../../components/Pressable';
import { useDecorativeMotionState } from '../../components/useDecorativeMotion';
import { theme } from '../../theme/theme';
import ArrivalFilm from './ArrivalFilm';
import { ARRIVAL_BACKGROUND, arrivalStyles as styles } from './arrivalStyles';

const POSTER = require('../../../assets/brand/motion/vantahome-arrival-poster.png');
const COMPLETED_POSTER = require('../../../assets/brand/motion/vantahome-arrival-hold.png');
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
  onOpenSecurity?: () => void;
  onCoveredChange?: (covered: boolean) => void;
  onPosterReady?: () => void;
};

const COPY = {
  preparing: { title: 'Preparing your account…', description: 'This device is preparing your account before checking home access.' },
  checking: { title: 'Verifying home access…', description: 'Checking your current household permissions. Your home will open once access is verified.' },
  rendering: { title: 'The 3D view is still preparing.', description: 'Your device controls are available while the property view opens.' },
  unavailable: { title: 'Unable to verify home access.', description: 'Check your connection, then retry. Your controls will return once access is verified.' },
  ready: { title: 'Your home is ready.', description: '' },
  inactive: { title: '', description: '' },
} as const;

/** Blend decoder-dependent black levels into the stage without altering the central artwork. */
function ArrivalStageBlend() {
  const gradientId = `arrival-stage-${useId().replace(/:/g, '')}`;
  return <View testID="arrival-stage-blend" style={styles.media} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 1024 768" preserveAspectRatio="xMidYMid meet">
      <Defs>
        <RadialGradient id={gradientId} cx="50%" cy="50%" r="48%">
          <Stop offset="0.83" stopColor={ARRIVAL_BACKGROUND} stopOpacity="0" />
          <Stop offset="0.88" stopColor={ARRIVAL_BACKGROUND} stopOpacity="0.28" />
          <Stop offset="0.95" stopColor={ARRIVAL_BACKGROUND} stopOpacity="0.85" />
          <Stop offset="0.98" stopColor={ARRIVAL_BACKGROUND} stopOpacity="1" />
        </RadialGradient>
      </Defs>
      <Rect width="1024" height="768" fill={`url(#${gradientId})`} />
    </Svg>
  </View>;
}

/** Carry launch, verification, and rendering through one interruptible cinematic surface. */
export default function CinematicArrival({
  status, returning = false, onRetry, onSignOut, signingOut = false, retrying = false,
  signOutError, statusMessage, statusDescription, onShowControls, onOpenSecurity, onCoveredChange, onPosterReady,
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
  const motion = useDecorativeMotionState(visible && status !== 'unavailable' && !signingOut);
  const motionAllowed = motion.allowed;
  // Initial launch matches the stationary shell. A known still presentation
  // shows the completed mark without briefly reversing the assembly first.
  const poster = staticArrival || unavailable || motion.reducedMotion === true ? COMPLETED_POSTER : POSTER;
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
  const fitArtworkByHeight = width / height > 4 / 3;
  const glowId = `arrival-reveal-${useId().replace(/:/g, '')}`;
  const fadingStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  // The same readiness progress produces a soft violet release; no timer,
  // source replacement, or additional wait is introduced by the decoration.
  const glowStyle = useAnimatedStyle(() => ({
    opacity: Math.sin((1 - opacity.value) * Math.PI) * 0.34,
    transform: [{ scale: 1 + (1 - opacity.value) * 0.035 }],
  }));

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
      <Image testID="arrival-poster" source={poster} style={styles.media} resizeMode="contain" accessible={false} onLoad={acknowledgePoster} onError={acknowledgePoster} />
      {!staticArrival && (motionAllowed || filmStarted) && <ArrivalFilm motionAllowed={motionAllowed} />}
      <ArrivalStageBlend />
    </View>
    {status === 'ready' && motionAllowed && !staticArrival && <Animated.View testID="arrival-reveal-glow" style={[styles.media, glowStyle]} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 1024 768" preserveAspectRatio="xMidYMid meet">
        <Defs><RadialGradient id={glowId}><Stop offset="0" stopColor={theme.colors.accent} stopOpacity="0.6" /><Stop offset="0.48" stopColor={theme.colors.accent2} stopOpacity="0.2" /><Stop offset="1" stopColor={theme.colors.accent2} stopOpacity="0" /></RadialGradient></Defs>
        <Ellipse cx="512" cy="361" rx="330" ry="270" fill={`url(#${glowId})`} />
      </Svg>
    </Animated.View>}
    {!detailed ? <>
      <View style={styles.brandStage} pointerEvents="none">
        <View testID="arrival-artwork-frame" style={fitArtworkByHeight ? styles.artworkFrameByHeight : styles.artworkFrameByWidth}>
          <View style={styles.wordmarkDock}>
            <Text accessibilityRole="header" accessibilityLabel={`VantaHome. ${statusMessage ?? copy.title}`} maxFontSizeMultiplier={1.5} style={styles.wordmark}>VANTAHOME</Text>
          </View>
        </View>
      </View>
      <Text testID="arrival-accessible-status" style={styles.screenReaderStatus} accessibilityLiveRegion="polite">{statusMessage ?? copy.title}</Text>
    </> : <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.fill} contentContainerStyle={[styles.content, compact && styles.contentCompact, wide && styles.contentWide]} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never" decelerationRate="normal">
        <View style={[styles.footer, wide && styles.footerWide]}>
          <View style={[styles.recovery, compact && styles.recoveryCompact]}>
            <View accessibilityLiveRegion="polite">
              <Text style={styles.statusLabel}>{unavailable ? 'OPENING PAUSED' : 'A LITTLE MORE TIME'}</Text>
              <Text style={[styles.title, compact && styles.titleCompact]}>{statusMessage ?? copy.title}</Text>
            </View>
            <Text style={styles.description}>{statusDescription ?? copy.description}</Text>
            {(onRetry || onSignOut || canShowControls || onOpenSecurity) && <View style={[styles.actions, largeText && styles.actionsLargeText]}>
              {canShowControls && <Pressable onPress={onShowControls} disabled={disabled} style={[styles.button, styles.buttonPrimary, largeText && styles.buttonLargeText, disabled && styles.disabled]}>
                <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Open device controls</Text>
              </Pressable>}
              {onRetry && <Pressable accessibilityLabel="Retry" onPress={onRetry} disabled={disabled} style={[styles.button, canShowControls ? styles.buttonSecondary : styles.buttonPrimary, largeText && styles.buttonLargeText, disabled && styles.disabled]}>
                <Text style={[styles.buttonText, !canShowControls && styles.buttonTextPrimary]}>{retrying ? 'Retrying…' : 'Retry'}</Text>
              </Pressable>}
              {onSignOut && <Pressable onPress={onSignOut} disabled={disabled} style={[styles.button, styles.buttonSecondary, largeText && styles.buttonLargeText, disabled && styles.disabled]}>
                <Text style={styles.buttonText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
              </Pressable>}
              {onOpenSecurity && <Pressable onPress={onOpenSecurity} disabled={disabled} style={[styles.button, styles.buttonSecondary, largeText && styles.buttonLargeText, disabled && styles.disabled]}>
                <Text style={styles.buttonText}>Security & sessions</Text>
              </Pressable>}
            </View>}
            {signOutError && <Text accessibilityRole="alert" style={styles.actionError}>{signOutError}</Text>}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>}
  </Animated.View>;
}
