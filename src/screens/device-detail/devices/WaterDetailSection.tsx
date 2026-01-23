import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type WaterDetailSectionProps = {
  isLandscape: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  waterHeroCard: React.ReactNode;
  waterBudgetCard: React.ReactNode;
  waterPressureCard: React.ReactNode;
  waterSafetyCard: React.ReactNode;
};

export default function WaterDetailSection({
  isLandscape,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  waterHeroCard,
  waterBudgetCard,
  waterPressureCard,
  waterSafetyCard,
}: WaterDetailSectionProps) {
  return isLandscape ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{waterHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>
        {waterBudgetCard}
        {waterPressureCard}
        {waterSafetyCard}
      </View>
    </View>
  ) : (
    <>
      {waterHeroCard}
      {waterBudgetCard}
      {waterPressureCard}
      {waterSafetyCard}
    </>
  );
}
