import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type WaterDetailSectionProps = {
  isLandscape: boolean;
  isTabletPortrait: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  portraitGridStyle?: StyleProp<ViewStyle>;
  portraitRowStyle?: StyleProp<ViewStyle>;
  portraitCellStyle?: StyleProp<ViewStyle>;
  waterHeroCard: React.ReactNode;
  waterBudgetCard: React.ReactNode;
  waterPressureCard: React.ReactNode;
  waterSafetyCard: React.ReactNode;
  waterUsageCard: React.ReactNode;
};

export default function WaterDetailSection({
  isLandscape,
  isTabletPortrait,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  portraitGridStyle,
  portraitRowStyle,
  portraitCellStyle,
  waterHeroCard,
  waterBudgetCard,
  waterPressureCard,
  waterSafetyCard,
  waterUsageCard,
}: WaterDetailSectionProps) {
  if (isLandscape) {
    return (
      <View style={landscapeGridStyle}>
        <View style={landscapeColumnPrimaryStyle}>{waterHeroCard}</View>
        <View style={landscapeColumnSecondaryStyle}>
          {waterBudgetCard}
          {waterPressureCard}
          {waterSafetyCard}
          {waterUsageCard}
        </View>
      </View>
    );
  }

  if (isTabletPortrait && portraitGridStyle && portraitRowStyle && portraitCellStyle) {
    return (
      <>
        {waterHeroCard}
        <View style={portraitGridStyle}>
          <View style={portraitRowStyle}>
            <View style={portraitCellStyle}>
              <View style={portraitGridStyle}>
                {waterBudgetCard}
                {waterUsageCard}
              </View>
            </View>
            <View style={portraitCellStyle}>{waterPressureCard}</View>
          </View>
          {waterSafetyCard}
        </View>
      </>
    );
  }

  return (
    <>
      {waterHeroCard}
      {waterBudgetCard}
      {waterUsageCard}
      {waterPressureCard}
      {waterSafetyCard}
    </>
  );
}
