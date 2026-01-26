import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type AcDetailSectionProps = {
  isLandscapeSplit: boolean;
  usePortraitGrid: boolean;
  portraitGridStyle: StyleProp<ViewStyle>;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  acHeroNodes: React.ReactNode;
  acControlNodes: React.ReactNode;
};

export default function AcDetailSection({
  isLandscapeSplit,
  usePortraitGrid,
  portraitGridStyle,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  acHeroNodes,
  acControlNodes,
}: AcDetailSectionProps) {
  if (usePortraitGrid && !isLandscapeSplit) {
    return (
      <>
        {acHeroNodes}
        <View style={portraitGridStyle}>{acControlNodes}</View>
      </>
    );
  }

  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{acHeroNodes}</View>
      <View style={landscapeColumnSecondaryStyle}>{acControlNodes}</View>
    </View>
  ) : (
    <>
      {acHeroNodes}
      {acControlNodes}
    </>
  );
}
