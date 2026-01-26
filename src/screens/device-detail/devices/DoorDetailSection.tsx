import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type DoorDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  doorHeroCard: React.ReactNode;
  doorStatusCard: React.ReactNode;
  doorActionCard: React.ReactNode;
};

export default function DoorDetailSection({
  isLandscapeSplit,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  doorHeroCard,
  doorStatusCard,
  doorActionCard,
}: DoorDetailSectionProps) {
  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{doorHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>
        {doorStatusCard}
        {doorActionCard}
      </View>
    </View>
  ) : (
    <>{doorHeroCard}</>
  );
}
