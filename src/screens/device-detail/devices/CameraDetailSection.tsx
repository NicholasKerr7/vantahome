import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type CameraDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeColumnGapStyle: StyleProp<ViewStyle>;
  cameraHeroCard: React.ReactNode;
  cameraRecognizeCard: React.ReactNode;
  cameraControlCardsLandscapeRight: React.ReactNode;
  cameraControlCardsPortrait: React.ReactNode;
};

export default function CameraDetailSection({
  isLandscapeSplit,
  landscapeColumnGapStyle,
  cameraHeroCard,
  cameraRecognizeCard,
  cameraControlCardsLandscapeRight,
  cameraControlCardsPortrait,
}: CameraDetailSectionProps) {
  return isLandscapeSplit ? (
    <>
      <View style={landscapeColumnGapStyle}>
        {cameraHeroCard}
        {cameraRecognizeCard}
      </View>
      <View style={landscapeColumnGapStyle}>{cameraControlCardsLandscapeRight}</View>
    </>
  ) : (
    <>
      {cameraHeroCard}
      {cameraControlCardsPortrait}
    </>
  );
}
