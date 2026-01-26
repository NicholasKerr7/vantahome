import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type GarageDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  garageHeroCard: React.ReactNode;
  garageStatusCard: React.ReactNode;
  garageActionCard: React.ReactNode;
};

export default function GarageDetailSection({
  isLandscapeSplit,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  garageHeroCard,
  garageStatusCard,
  garageActionCard,
}: GarageDetailSectionProps) {
  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{garageHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>
        {garageStatusCard}
        {garageActionCard}
      </View>
    </View>
  ) : (
    <>{garageHeroCard}</>
  );
}
