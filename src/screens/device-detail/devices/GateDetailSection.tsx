import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type GateDetailSectionProps = {
  isLandscapeSplit: boolean;
  openColumnStyle: StyleProp<ViewStyle>;
  gateHeroCard: React.ReactNode;
  gateStatusCard: React.ReactNode;
  gateActionCard: React.ReactNode;
  gateAutoCard: React.ReactNode;
};

export default function GateDetailSection({
  isLandscapeSplit,
  openColumnStyle,
  gateHeroCard,
  gateStatusCard,
  gateActionCard,
  gateAutoCard,
}: GateDetailSectionProps) {
  return isLandscapeSplit ? (
    <>
      <View style={openColumnStyle}>{gateHeroCard}</View>
      <View style={openColumnStyle}>
        {gateStatusCard}
        {gateAutoCard}
        {gateActionCard}
      </View>
    </>
  ) : (
    <>
      {gateHeroCard}
      {gateAutoCard}
    </>
  );
}
