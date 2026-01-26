import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type EnergyDetailSectionProps = {
  energyHeroCard: React.ReactNode;
  energySideColumn: React.ReactNode;
  energyBudgetCard: React.ReactNode;
  isLandscape: boolean;
  energyCardGap: number;
  isTabletPortrait: boolean;
  portraitGridStyle?: StyleProp<ViewStyle>;
  portraitRowStyle?: StyleProp<ViewStyle>;
  portraitCellStyle?: StyleProp<ViewStyle>;
  landscapeGridStyle?: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle?: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle?: StyleProp<ViewStyle>;
};

export default function EnergyDetailSection({
  energyHeroCard,
  energySideColumn,
  energyBudgetCard,
  isLandscape,
  energyCardGap,
  isTabletPortrait,
  portraitGridStyle,
  portraitRowStyle,
  portraitCellStyle,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
}: EnergyDetailSectionProps) {
  if (isTabletPortrait && portraitGridStyle && portraitRowStyle && portraitCellStyle) {
    return (
      <>
        {energyHeroCard}
        <View style={portraitGridStyle}>
          <View style={portraitRowStyle}>
            <View style={portraitCellStyle}>{energySideColumn}</View>
            <View style={portraitCellStyle}>{energyBudgetCard}</View>
          </View>
        </View>
      </>
    );
  }

  if (
    isLandscape &&
    landscapeGridStyle &&
    landscapeColumnPrimaryStyle &&
    landscapeColumnSecondaryStyle
  ) {
    return (
      <View style={landscapeGridStyle}>
        <View style={landscapeColumnPrimaryStyle}>{energyHeroCard}</View>
        <View style={landscapeColumnSecondaryStyle}>
          <View style={{ gap: energyCardGap }}>
            {energySideColumn}
            {energyBudgetCard}
          </View>
        </View>
      </View>
    );
  }

  return (
    <>
      {energyHeroCard}
      {energySideColumn}
      {isLandscape ? <View style={{ height: energyCardGap }} /> : null}
      {energyBudgetCard}
    </>
  );
}
