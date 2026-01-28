import React, { useMemo, useRef } from "react";
import { Pressable, StyleSheet } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

type LiveVideoPlayerProps = {
  sourceUri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: "contain" | "cover" | "fill";
  onFullscreen?: () => void;
  enableFullscreen?: boolean;
  enablePiP?: boolean;
};

function LiveVideoPlayer({
  sourceUri,
  style,
  contentFit = "cover",
  onFullscreen,
  enableFullscreen = true,
  enablePiP = true,
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
    if (enableFullscreen) {
      await viewRef.current?.enterFullscreen();
    }
    onFullscreen?.();
  };

  const handleLongPress = async () => {
    if (!enablePiP) return;
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

export default React.memo(LiveVideoPlayer);

const styles = StyleSheet.create({
  root: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
});
