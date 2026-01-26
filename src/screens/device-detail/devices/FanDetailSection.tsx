import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type FanDetailSectionProps = {
  isLandscapeSplit: boolean;
  usePortraitGrid: boolean;
  portraitGridStyle: StyleProp<ViewStyle>;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  fanHeroCard: React.ReactNode;
  fanOscillationCard: React.ReactNode;
  fanTimerCard: React.ReactNode;
};

export default function FanDetailSection({
  isLandscapeSplit,
  usePortraitGrid,
  portraitGridStyle,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  fanHeroCard,
  fanOscillationCard,
  fanTimerCard,
}: FanDetailSectionProps) {
  if (usePortraitGrid && !isLandscapeSplit) {
    return (
      <>
        {fanHeroCard}
        <View style={portraitGridStyle}>
          {fanOscillationCard}
          {fanTimerCard}
        </View>
      </>
    );
  }

  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{fanHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>
        {fanOscillationCard}
        {fanTimerCard}
      </View>
    </View>
  ) : (
    <>
      {fanHeroCard}
      {fanOscillationCard}
      {fanTimerCard}
    </>
  );
}
