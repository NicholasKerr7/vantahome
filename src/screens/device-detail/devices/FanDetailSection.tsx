import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type FanDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  fanHeroCard: React.ReactNode;
  fanOscillationCard: React.ReactNode;
  fanTimerCard: React.ReactNode;
};

export default function FanDetailSection({
  isLandscapeSplit,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  fanHeroCard,
  fanOscillationCard,
  fanTimerCard,
}: FanDetailSectionProps) {
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
