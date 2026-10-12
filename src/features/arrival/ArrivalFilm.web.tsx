import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import './arrival-film.css';

const SOURCES = {
  enter: Asset.fromModule(require('../../../assets/brand/motion/vantahome-arrival-enter.mp4')).uri,
  hold: Asset.fromModule(require('../../../assets/brand/motion/vantahome-arrival-hold.mp4')).uri,
} as const;
const HOLD_POSTER = Asset.fromModule(require('../../../assets/brand/motion/vantahome-arrival-hold.png')).uri;
type Segment = keyof typeof SOURCES;
type Props = { motionAllowed: boolean };

/** Use the browser's media lifecycle directly so source changes cannot replay stale pause events. */
export default function ArrivalFilm({ motionAllowed }: Props) {
  const [segment, setSegment] = useState<Segment>('enter');
  const [frameSource, setFrameSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const source = SOURCES[segment];
  const playback = useRef({ motionAllowed, source });
  const playbackFailed = useRef(false);
  const mounted = useRef(true);

  useLayoutEffect(() => { playback.current = { motionAllowed, source }; }, [motionAllowed, source]);

  /** Autoplay rejection falls back to the still; superseded loads are expected interruptions. */
  const playCurrent = useCallback(() => {
    const element = video.current;
    const requestedSource = playback.current.source;
    if (!element || !playback.current.motionAllowed || playbackFailed.current || element.readyState < 2) return;
    const attempt = element.play();
    if (!attempt) return;
    void attempt.catch((error: unknown) => {
      if (!mounted.current || requestedSource !== playback.current.source || !playback.current.motionAllowed) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      playbackFailed.current = true;
      setFailed(true);
    });
  }, []);

  useEffect(() => {
    if (motionAllowed && !failed) playCurrent();
    else video.current?.pause();
  }, [failed, motionAllowed, playCurrent, source]);

  useEffect(() => {
    mounted.current = true;
    const element = video.current;
    return () => { mounted.current = false; element?.pause(); };
  }, []);

  /** Associate visibility with the current source so its old image never masquerades as a new first frame. */
  const showFrame = useCallback(() => {
    setFrameSource(playback.current.source);
    playCurrent();
  }, [playCurrent]);

  const showCompletedPoster = segment === 'hold' || failed || !motionAllowed;
  return <div className="arrival-film" data-testid="arrival-film" aria-hidden="true">
    {/* Decode this while entrance plays so the still is ready before the video source changes. */}
    <img className={`arrival-film__poster ${showCompletedPoster ? 'arrival-film__poster--visible' : ''}`} src={HOLD_POSTER} alt="" draggable={false} />
    <video
      ref={video}
      data-testid="arrival-video"
      className={`arrival-film__video ${frameSource === source && motionAllowed && !failed ? 'arrival-film__video--visible' : ''}`}
      src={source}
      muted
      playsInline
      preload="auto"
      loop={segment === 'hold'}
      controls={false}
      disablePictureInPicture
      disableRemotePlayback
      tabIndex={-1}
      onLoadedData={showFrame}
      onCanPlay={playCurrent}
      onEnded={() => { if (segment === 'enter') setSegment('hold'); }}
      onError={() => { playbackFailed.current = true; setFailed(true); }}
    />
  </div>;
}
