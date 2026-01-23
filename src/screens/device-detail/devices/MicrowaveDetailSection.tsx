import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type MicrowaveDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  microwaveHeroCard: React.ReactNode;
  microwaveModeCard: React.ReactNode;
  microwavePowerCard: React.ReactNode;
};

export default function MicrowaveDetailSection({
  isLandscapeSplit,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  microwaveHeroCard,
  microwaveModeCard,
  microwavePowerCard,
}: MicrowaveDetailSectionProps) {
  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{microwaveHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>
        {microwaveModeCard}
        {microwavePowerCard}
      </View>
    </View>
  ) : (
    <>
      {microwaveHeroCard}
      {microwaveModeCard}
      {microwavePowerCard}
    </>
  );
}
