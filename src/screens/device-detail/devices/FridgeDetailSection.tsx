import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type FridgeDetailSectionProps = {
  isLandscapeSplit: boolean;
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
