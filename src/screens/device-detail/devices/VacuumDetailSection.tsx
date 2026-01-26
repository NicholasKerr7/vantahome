import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type VacuumDetailSectionProps = {
  isLandscapeSplit: boolean;
  usePortraitGrid: boolean;
  portraitGridStyle: StyleProp<ViewStyle>;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  vacuumHeroCard: React.ReactNode;
  vacuumControlCards: React.ReactNode;
};

export default function VacuumDetailSection({
  isLandscapeSplit,
  usePortraitGrid,
  portraitGridStyle,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  vacuumHeroCard,
  vacuumControlCards,
}: VacuumDetailSectionProps) {
  if (usePortraitGrid && !isLandscapeSplit) {
    return (
      <>
        {vacuumHeroCard}
        <View style={portraitGridStyle}>{vacuumControlCards}</View>
      </>
    );
  }

  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{vacuumHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>{vacuumControlCards}</View>
    </View>
  ) : (
    <>
      {vacuumHeroCard}
      {vacuumControlCards}
    </>
  );
}
