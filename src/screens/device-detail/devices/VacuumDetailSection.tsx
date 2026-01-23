import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type VacuumDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeColumnGapStyle: StyleProp<ViewStyle>;
  vacuumHeroCard: React.ReactNode;
  vacuumControlCards: React.ReactNode;
};

export default function VacuumDetailSection({
  isLandscapeSplit,
  landscapeColumnGapStyle,
  vacuumHeroCard,
  vacuumControlCards,
}: VacuumDetailSectionProps) {
  return isLandscapeSplit ? (
    <>
      <View style={landscapeColumnGapStyle}>{vacuumHeroCard}</View>
      <View style={landscapeColumnGapStyle}>{vacuumControlCards}</View>
    </>
  ) : (
    <>
      {vacuumHeroCard}
      {vacuumControlCards}
    </>
  );
}
