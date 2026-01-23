import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type AcDetailSectionProps = {
  isTabletLandscape: boolean;
  landscapeColumnGapStyle: StyleProp<ViewStyle>;
  acHeroNodes: React.ReactNode;
  acControlNodes: React.ReactNode;
};

export default function AcDetailSection({
  isTabletLandscape,
  landscapeColumnGapStyle,
  acHeroNodes,
  acControlNodes,
}: AcDetailSectionProps) {
  return isTabletLandscape ? (
    <>
      <View style={landscapeColumnGapStyle}>{acHeroNodes}</View>
      <View style={landscapeColumnGapStyle}>{acControlNodes}</View>
    </>
  ) : (
    <>
      {acHeroNodes}
      {acControlNodes}
    </>
  );
}
