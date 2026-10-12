import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { arrivalStyles as styles } from './arrivalStyles';

const SOURCES = {
  enter: require('../../../assets/brand/motion/vantahome-arrival-enter.mp4'),
  hold: require('../../../assets/brand/motion/vantahome-arrival-hold.mp4'),
  resolve: require('../../../assets/brand/motion/vantahome-arrival-resolve.mp4'),
} as const;
const HOLD_POSTER = require('../../../assets/brand/motion/vantahome-arrival-hold.png');
const NO_FULLSCREEN = { enable: false } as const;
type Segment = keyof typeof SOURCES;

type Props = { motionAllowed: boolean; resolving: boolean };

/** Play one local silent film across all loading phases; a media failure remains decorative. */
export default function ArrivalFilm({ motionAllowed, resolving }: Props) {
  const [segment, setSegment] = useState<Segment>('enter');
  const [firstFrame, setFirstFrame] = useState(false);
  const [failed, setFailed] = useState(false);
  const desiredSegment = resolving ? 'resolve' : segment;
  const playback = useRef({ motionAllowed, desiredSegment });
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

  useLayoutEffect(() => { playback.current = { motionAllowed, desiredSegment }; }, [motionAllowed, desiredSegment]);

  useEffect(() => {
    const ended = player.addListener('playToEnd', () => {
      if (loadedSegment.current === 'enter' && playback.current.desiredSegment === 'enter') setSegment('hold');
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
    setFirstFrame(false);
    // Serialize native replacement requests so an older async asset cannot
    // replace the resolve film after readiness has already changed the phase.
    loadQueue.current = loadQueue.current.then(async () => {
      if (!current || revision !== loadRevision.current) return;
      requestedSegment.current = desiredSegment;
      await player.replaceAsync(SOURCES[desiredSegment]);
      if (!current || revision !== loadRevision.current) return;
      loadedSegment.current = desiredSegment;
      player.loop = desiredSegment === 'hold';
      if (playback.current.motionAllowed) player.play();
      else player.pause();
    }).catch(() => {
      if (current && revision === loadRevision.current) { playbackFailed.current = true; setFailed(true); }
    });
    return () => { current = false; };
  }, [desiredSegment, failed, player]);

  useEffect(() => {
    if (motionAllowed && !failed && loadedSegment.current === desiredSegment) player.play();
    else player.pause();
  }, [desiredSegment, failed, motionAllowed, player]);

  const showVideo = firstFrame && motionAllowed && !failed;
  return <View style={styles.media} testID="arrival-film" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {desiredSegment !== 'enter' && <Image source={HOLD_POSTER} style={styles.media} resizeMode="contain" accessible={false} />}
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
        if (requestedSegment.current !== playback.current.desiredSegment) return;
        setFirstFrame(true);
        if (playback.current.motionAllowed && !playbackFailed.current) player.play();
      }}
    />
  </View>;
}
