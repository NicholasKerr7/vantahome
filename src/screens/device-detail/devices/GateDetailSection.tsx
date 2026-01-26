import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type GateDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  gateHeroCard: React.ReactNode;
  gateStatusCard: React.ReactNode;
  gateActionCard: React.ReactNode;
  gateAutoCard: React.ReactNode;
};

export default function GateDetailSection({
  isLandscapeSplit,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  gateHeroCard,
  gateStatusCard,
  gateActionCard,
  gateAutoCard,
}: GateDetailSectionProps) {
  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{gateHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>
        {gateStatusCard}
        {gateAutoCard}
        {gateActionCard}
      </View>
    </View>
  ) : (
    <>
      {gateHeroCard}
      {gateAutoCard}
    </>
  );
}
