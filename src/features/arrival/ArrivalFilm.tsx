import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { arrivalStyles as styles } from './arrivalStyles';

const SOURCES = {
  enter: require('../../../assets/brand/motion/vantahome-arrival-enter.mp4'),
  hold: require('../../../assets/brand/motion/vantahome-arrival-hold.mp4'),
} as const;
const HOLD_POSTER = require('../../../assets/brand/motion/vantahome-arrival-hold.png');
const NO_FULLSCREEN = { enable: false } as const;
type Segment = keyof typeof SOURCES;

type Props = { motionAllowed: boolean };

/** Play one local silent film across all loading phases; a media failure remains decorative. */
export default function ArrivalFilm({ motionAllowed }: Props) {
  const [segment, setSegment] = useState<Segment>('enter');
  const [frameSegment, setFrameSegment] = useState<Segment | null>(null);
  const [failed, setFailed] = useState(false);
  const playback = useRef({ motionAllowed, segment });
  const loadedSegment = useRef<Segment | null>(null);
  const requestedSegment = useRef<Segment | null>(null);
  const playbackFailed = useRef(false);
  const loadQueue = useRef(Promise.resolve());
  const loadRevision = useRef(0);
  const player = useVideoPlayer(null, (video) => {
    video.muted = true;
    video.volume = 0;
    video.allowsExternalPlayback = false;
    video.staysActiveInBackground = false;
    video.showNowPlayingNotification = false;
    video.keepScreenOnWhilePlaying = false;
    video.audioMixingMode = 'mixWithOthers';
  });

  useLayoutEffect(() => { playback.current = { motionAllowed, segment }; }, [motionAllowed, segment]);

  useEffect(() => {
    const ended = player.addListener('playToEnd', () => {
      if (loadedSegment.current === 'enter' && playback.current.segment === 'enter') setSegment('hold');
    });
    const status = player.addListener('statusChange', (event) => {
      if (event.status === 'error') { playbackFailed.current = true; setFailed(true); }
      if (event.status === 'readyToPlay' && playback.current.motionAllowed && !playbackFailed.current) player.play();
    });
    return () => { ended.remove(); status.remove(); };
  }, [player]);

  useEffect(() => {
    if (failed) return;
    const revision = ++loadRevision.current;
    let current = true;
    // Serialize native replacements and cancel stale continuations on unmount.
    // Readiness fades the current frame; it never loads a separate closing clip.
    loadQueue.current = loadQueue.current.then(async () => {
      if (!current || revision !== loadRevision.current) return;
      requestedSegment.current = segment;
      await player.replaceAsync(SOURCES[segment]);
      if (!current || revision !== loadRevision.current) return;
      loadedSegment.current = segment;
      player.loop = segment === 'hold';
      if (playback.current.motionAllowed) player.play();
      else player.pause();
    }).catch(() => {
      if (current && revision === loadRevision.current) { playbackFailed.current = true; setFailed(true); }
    });
    return () => { current = false; };
  }, [segment, failed, player]);

  useEffect(() => {
    if (motionAllowed && !failed && loadedSegment.current === segment) player.play();
    else player.pause();
  }, [segment, failed, motionAllowed, player]);

  const showVideo = frameSegment === segment && motionAllowed && !failed;
  const showCompletedPoster = segment === 'hold' || failed || !motionAllowed;
  return <View style={styles.media} testID="arrival-film" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {/* Decode the matching still during entrance so source replacement cannot reveal the opening pose. */}
    <Image testID="arrival-completed-poster" source={HOLD_POSTER} style={[styles.media, !showCompletedPoster && styles.mediaHidden]} resizeMode="contain" accessible={false} />
    <VideoView
      testID="arrival-video"
      player={player}
      style={[styles.media, !showVideo && styles.mediaHidden]}
      contentFit="contain"
      nativeControls={false}
      fullscreenOptions={NO_FULLSCREEN}
      allowsPictureInPicture={false}
      startsPictureInPictureAutomatically={false}
      allowsVideoFrameAnalysis={false}
      playsInline
      surfaceType="textureView"
      useExoShutter={false}
      onFirstFrameRender={() => {
        // Native first-frame notification may precede replaceAsync's resolution.
        if (requestedSegment.current !== playback.current.segment) return;
        setFrameSegment(playback.current.segment);
        if (playback.current.motionAllowed && !playbackFailed.current) player.play();
      }}
    />
  </View>;
}
