import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type DoorDetailSectionProps = {
  isLandscapeSplit: boolean;
  openColumnStyle: StyleProp<ViewStyle>;
  doorHeroCard: React.ReactNode;
  doorStatusCard: React.ReactNode;
  doorActionCard: React.ReactNode;
};

export default function DoorDetailSection({
  isLandscapeSplit,
  openColumnStyle,
  doorHeroCard,
  doorStatusCard,
  doorActionCard,
}: DoorDetailSectionProps) {
  return isLandscapeSplit ? (
    <>
      <View style={openColumnStyle}>{doorHeroCard}</View>
      <View style={openColumnStyle}>
        {doorStatusCard}
        {doorActionCard}
      </View>
    </>
  ) : (
    <>{doorHeroCard}</>
  );
}
