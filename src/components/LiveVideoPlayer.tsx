import React, { useMemo, useRef } from "react";
import { Pressable, StyleSheet } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

type LiveVideoPlayerProps = {
  sourceUri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: "contain" | "cover" | "fill";
  onFullscreen?: () => void;
};

export default function LiveVideoPlayer({
  sourceUri,
  style,
  contentFit = "cover",
  onFullscreen,
}: LiveVideoPlayerProps) {
  const player = useVideoPlayer(sourceUri, (video) => {
    video.loop = true;
    video.muted = true;
    video.play();
  });
  const viewRef = useRef<VideoView>(null);
  const fullscreenOptions = useMemo(
    () => ({ enable: true, orientation: "default" as const }),
    [],
  );

  const handlePress = async () => {
    await viewRef.current?.enterFullscreen();
    onFullscreen?.();
  };

  const handleLongPress = async () => {
    try {
      await viewRef.current?.startPictureInPicture();
    } catch {
      // Ignore if PiP is not supported.
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={[styles.root, style]}
    >
      <VideoView
        ref={viewRef}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        nativeControls={false}
        fullscreenOptions={fullscreenOptions}
        allowsPictureInPicture
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
});
