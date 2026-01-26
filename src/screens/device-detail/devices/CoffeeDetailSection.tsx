import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type CoffeeDetailSectionProps = {
  isLandscapeSplit: boolean;
  usePortraitGrid: boolean;
  portraitGridStyle: StyleProp<ViewStyle>;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  coffeeHeroCard: React.ReactNode;
  coffeeControlCards: React.ReactNode;
  coffeeDescaleNotice?: React.ReactNode | null;
};

export default function CoffeeDetailSection({
  isLandscapeSplit,
  usePortraitGrid,
  portraitGridStyle,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  coffeeHeroCard,
  coffeeControlCards,
  coffeeDescaleNotice,
}: CoffeeDetailSectionProps) {
  if (usePortraitGrid && !isLandscapeSplit) {
    return (
      <>
        {coffeeHeroCard}
        {coffeeDescaleNotice}
        <View style={portraitGridStyle}>{coffeeControlCards}</View>
      </>
    );
  }

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
