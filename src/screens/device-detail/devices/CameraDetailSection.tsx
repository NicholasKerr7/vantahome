import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type CameraDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  cameraHeroCard: React.ReactNode;
  cameraRecognizeCard: React.ReactNode;
  cameraControlCardsLandscapeRight: React.ReactNode;
  cameraControlCardsPortrait: React.ReactNode;
};

export default function CameraDetailSection({
  isLandscapeSplit,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  cameraHeroCard,
  cameraRecognizeCard,
  cameraControlCardsLandscapeRight,
  cameraControlCardsPortrait,
}: CameraDetailSectionProps) {
  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>
        {cameraHeroCard}
        {cameraRecognizeCard}
      </View>
      <View style={landscapeColumnSecondaryStyle}>
        {cameraControlCardsLandscapeRight}
      </View>
    </View>
  ) : (
    <>
      {cameraHeroCard}
      {cameraControlCardsPortrait}
    </>
  );
}
