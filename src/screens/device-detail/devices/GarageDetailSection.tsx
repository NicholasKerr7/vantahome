import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type GarageDetailSectionProps = {
  isLandscapeSplit: boolean;
  openColumnStyle: StyleProp<ViewStyle>;
  garageHeroCard: React.ReactNode;
  garageStatusCard: React.ReactNode;
  garageActionCard: React.ReactNode;
};

export default function GarageDetailSection({
  isLandscapeSplit,
  openColumnStyle,
  garageHeroCard,
  garageStatusCard,
  garageActionCard,
}: GarageDetailSectionProps) {
  return isLandscapeSplit ? (
    <>
      <View style={openColumnStyle}>{garageHeroCard}</View>
      <View style={openColumnStyle}>
        {garageStatusCard}
        {garageActionCard}
      </View>
    </>
  ) : (
    <>{garageHeroCard}</>
  );
}
