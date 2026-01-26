import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type FridgeDetailSectionProps = {
  isLandscapeSplit: boolean;
  usePortraitGrid: boolean;
  portraitGridStyle: StyleProp<ViewStyle>;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  fridgeHeroCard: React.ReactNode;
  fridgeFreezerCard: React.ReactNode;
  fridgeModesCard: React.ReactNode;
  fridgeQuickActionsCard: React.ReactNode;
  fridgeHardwareCard: React.ReactNode;
  fridgeHumidityCard: React.ReactNode;
};

export default function FridgeDetailSection({
  isLandscapeSplit,
  usePortraitGrid,
  portraitGridStyle,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  fridgeHeroCard,
  fridgeFreezerCard,
  fridgeModesCard,
  fridgeQuickActionsCard,
  fridgeHardwareCard,
  fridgeHumidityCard,
}: FridgeDetailSectionProps) {
  if (usePortraitGrid && !isLandscapeSplit) {
    return (
      <>
        {fridgeHeroCard}
        <View style={portraitGridStyle}>
          {fridgeFreezerCard}
          {fridgeModesCard}
          {fridgeQuickActionsCard}
          {fridgeHardwareCard}
          {fridgeHumidityCard}
        </View>
      </>
    );
  }

  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{fridgeHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>
        {fridgeFreezerCard}
        {fridgeModesCard}
        {fridgeQuickActionsCard}
        {fridgeHardwareCard}
        {fridgeHumidityCard}
      </View>
    </View>
  ) : (
    <>
      {fridgeHeroCard}
      {fridgeFreezerCard}
      {fridgeModesCard}
      {fridgeQuickActionsCard}
      {fridgeHardwareCard}
      {fridgeHumidityCard}
    </>
  );
}
