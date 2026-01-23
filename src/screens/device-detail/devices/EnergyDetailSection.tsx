import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type EnergyDetailSectionProps = {
  energyHeroCard: React.ReactNode;
  energySideColumn: React.ReactNode;
  energyBudgetCard: React.ReactNode;
  isLandscape: boolean;
  energyCardGap: number;
};

export default function EnergyDetailSection({
  energyHeroCard,
  energySideColumn,
  energyBudgetCard,
  isLandscape,
  energyCardGap,
}: EnergyDetailSectionProps) {
  return (
    <>
      {energyHeroCard}
      {energySideColumn}
      {isLandscape ? <View style={{ height: energyCardGap }} /> : null}
      {energyBudgetCard}
    </>
  );
}
