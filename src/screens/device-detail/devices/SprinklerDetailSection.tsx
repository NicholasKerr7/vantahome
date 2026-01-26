import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type SprinklerDetailSectionProps = {
  isLandscapeSplit: boolean;
  usePortraitGrid: boolean;
  portraitGridStyle: StyleProp<ViewStyle>;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  sprinklerHeroCard: React.ReactNode;
  sprinklerZoneCard: React.ReactNode;
  sprinklerScheduleCard: React.ReactNode;
};

export default function SprinklerDetailSection({
  isLandscapeSplit,
  usePortraitGrid,
  portraitGridStyle,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  sprinklerHeroCard,
  sprinklerZoneCard,
  sprinklerScheduleCard,
}: SprinklerDetailSectionProps) {
  if (usePortraitGrid && !isLandscapeSplit) {
    return (
      <>
        {sprinklerHeroCard}
        <View style={portraitGridStyle}>
          {sprinklerZoneCard}
          {sprinklerScheduleCard}
        </View>
      </>
    );
  }

  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{sprinklerHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>
        {sprinklerZoneCard}
        {sprinklerScheduleCard}
      </View>
    </View>
  ) : (
    <>
      {sprinklerHeroCard}
      {sprinklerZoneCard}
      {sprinklerScheduleCard}
    </>
  );
}
