import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type CoffeeDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  coffeeHeroCard: React.ReactNode;
  coffeeControlCards: React.ReactNode;
  coffeeDescaleNotice?: React.ReactNode | null;
};

export default function CoffeeDetailSection({
  isLandscapeSplit,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  coffeeHeroCard,
  coffeeControlCards,
  coffeeDescaleNotice,
}: CoffeeDetailSectionProps) {
  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>
        {coffeeHeroCard}
        {coffeeDescaleNotice}
      </View>
      <View style={landscapeColumnSecondaryStyle}>{coffeeControlCards}</View>
    </View>
  ) : (
    <>
      {coffeeHeroCard}
      {coffeeDescaleNotice}
      {coffeeControlCards}
    </>
  );
}
