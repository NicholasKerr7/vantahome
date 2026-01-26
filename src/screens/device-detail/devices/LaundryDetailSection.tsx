import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type LaundryDetailSectionProps = {
  isLandscapeSplit: boolean;
  usePortraitGrid: boolean;
  portraitGridStyle: StyleProp<ViewStyle>;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  laundryControlGridStyle: StyleProp<ViewStyle>;
  laundryHeroCard: React.ReactNode;
  laundryActionRow: React.ReactNode;
  laundryCycleCard: React.ReactNode;
  laundryLoadSizeCard: React.ReactNode;
  laundryControlCards: React.ReactNode;
};

export default function LaundryDetailSection({
  isLandscapeSplit,
  usePortraitGrid,
  portraitGridStyle,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  laundryControlGridStyle,
  laundryHeroCard,
  laundryActionRow,
  laundryCycleCard,
  laundryLoadSizeCard,
  laundryControlCards,
}: LaundryDetailSectionProps) {
  const leftColumn = (
    <>
      {laundryHeroCard}
      {laundryActionRow}
      {laundryCycleCard}
      {laundryLoadSizeCard}
    </>
  );

  if (usePortraitGrid && !isLandscapeSplit) {
    return (
      <>
        {laundryHeroCard}
        <View style={portraitGridStyle}>{laundryControlCards}</View>
      </>
    );
  }

  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{leftColumn}</View>
      <View style={landscapeColumnSecondaryStyle}>
        <View style={laundryControlGridStyle}>{laundryControlCards}</View>
      </View>
    </View>
  ) : (
    <>
      {laundryHeroCard}
      {laundryControlCards}
      {laundryActionRow}
    </>
  );
}
