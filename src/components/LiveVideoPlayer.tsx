import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer, type VideoPlayerStatus } from 'expo-video';
import Pressable from './Pressable';
import { theme } from '../theme/theme';

type LiveVideoPlayerProps = {
  sourceUri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'contain' | 'cover' | 'fill';
  onFullscreen?: () => void;
  enableFullscreen?: boolean;
  enablePiP?: boolean;
};
const FULLSCREEN_OPTIONS = { enable: true, orientation: 'default' as const };
const CONNECTION_TIMEOUT_MS = 20_000;

/** Remount on explicit retry and release private playback whenever the app backgrounds. */
function LiveVideoPlayer(props: LiveVideoPlayerProps) {
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'inactive') setActive(state === 'active');
    });
    return () => subscription?.remove();
  }, []);
  return active ? <CameraPlayback key={`${props.sourceUri}:${attempt}`} {...props} onRetry={() => setAttempt((value) => value + 1)} /> : null;
}

/** Show actual player readiness and errors instead of labelling a configured URL as live. */
function CameraPlayback({ sourceUri, style, contentFit = 'cover', onFullscreen,
  enableFullscreen = true, enablePiP = true, onRetry,
}: LiveVideoPlayerProps & { onRetry: () => void }) {
  const player = useVideoPlayer(sourceUri, (video) => {
    video.loop = true;
    video.muted = true;
  });
  const viewRef = useRef<VideoView>(null);
  const [status, setStatus] = useState<VideoPlayerStatus>(player.status);
  const [playing, setPlaying] = useState(player.playing);
  const [firstFrame, setFirstFrame] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [presentationError, setPresentationError] = useState('');
  const showingVideo = status === 'readyToPlay' && playing && firstFrame && !timedOut;
  const failed = status === 'error' || timedOut;
  const canExpand = enableFullscreen || Boolean(onFullscreen);

  // Stop before native shared-object release and before the web view detaches its media element.
  useLayoutEffect(() => () => { player.pause(); }, [player]);

  useEffect(() => {
    const statusSubscription = player.addListener('statusChange', (event) => setStatus(event.status));
    const playingSubscription = player.addListener('playingChange', (event) => setPlaying(event.isPlaying));
    // Web setup runs before a media element is attached; playback must begin after view effects mount it.
    player.play();
    setStatus(player.status);
    setPlaying(player.playing);
    return () => { statusSubscription.remove(); playingSubscription.remove(); };
  }, [player]);
  useEffect(() => {
    if (showingVideo || failed) return;
    const timer = setTimeout(() => { player.pause(); setTimedOut(true); }, CONNECTION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [failed, player, showingVideo]);

  /** A denied full-screen request must not become an unhandled native promise. */
  const expand = async () => {
    try {
      if (enableFullscreen) await viewRef.current?.enterFullscreen();
      onFullscreen?.();
    } catch { setPresentationError('Full screen is unavailable. Continue watching here.'); }
  };
  /** Keep unsupported picture-in-picture failures visible without exposing a private stream URL. */
  const enterPictureInPicture = async () => {
    if (!enablePiP) return;
    try { await viewRef.current?.startPictureInPicture(); }
    catch { setPresentationError('Picture in picture is unavailable on this device.'); }
  };

  const video = <VideoView ref={viewRef} player={player} style={StyleSheet.absoluteFill} contentFit={contentFit}
    nativeControls={false} fullscreenOptions={FULLSCREEN_OPTIONS} allowsPictureInPicture={enablePiP}
    onFirstFrameRender={() => setFirstFrame(true)} />;

  return (
    <View style={[styles.root, style]}>
      {canExpand || enablePiP ? <Pressable accessibilityLabel={canExpand ? 'Expand camera feed' : 'Open picture in picture'}
        onPress={() => { void (canExpand ? expand() : enterPictureInPicture()); }}
        onLongPress={canExpand && enablePiP ? () => void enterPictureInPicture() : undefined} style={StyleSheet.absoluteFill}>
        {video}
      </Pressable> : video}
      {showingVideo ? <View pointerEvents="none" style={styles.badge}><Text style={styles.badgeText}>Playing feed</Text></View> : (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <Text style={styles.title}>{failed ? 'Live feed unavailable' : 'Connecting to camera'}</Text>
          <Text style={styles.description}>{failed ? 'Check the camera connection and try again.' : 'Waiting for video from this camera.'}</Text>
          {failed ? <Pressable accessibilityLabel="Retry camera feed" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable> : null}
        </View>
      )}
      {presentationError ? <View style={styles.notice}><Text accessibilityLiveRegion="polite" style={styles.description}>{presentationError}</Text></View> : null}
    </View>
  );
}

export default React.memo(LiveVideoPlayer);

const styles = StyleSheet.create({
  root: { width: '100%', height: '100%', overflow: 'hidden', backgroundColor: theme.colors.surface },
  status: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 10 },
  title: { color: theme.colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  description: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 14, backgroundColor: theme.colors.card },
  retryText: { color: theme.colors.accentText, fontWeight: '600' },
  badge: { position: 'absolute', top: 12, left: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: theme.colors.overlayStrong },
  badgeText: { color: theme.colors.text, fontSize: 11 },
  notice: { position: 'absolute', bottom: 12, left: 12, right: 12, padding: 12, borderRadius: 12, backgroundColor: theme.colors.overlayStrong },
});
