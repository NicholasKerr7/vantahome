import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type LaundryDetailSectionProps = {
  isTabletLandscape: boolean;
  landscapeColumnGapStyle: StyleProp<ViewStyle>;
  laundryControlGridStyle: StyleProp<ViewStyle>;
  laundryHeroCard: React.ReactNode;
  laundryActionRow: React.ReactNode;
  laundryCycleCard: React.ReactNode;
  laundryLoadSizeCard: React.ReactNode;
  laundryControlCards: React.ReactNode;
};

export default function LaundryDetailSection({
  isTabletLandscape,
  landscapeColumnGapStyle,
  laundryControlGridStyle,
  laundryHeroCard,
  laundryActionRow,
  laundryCycleCard,
  laundryLoadSizeCard,
  laundryControlCards,
}: LaundryDetailSectionProps) {
  return isTabletLandscape ? (
    <>
      <View style={landscapeColumnGapStyle}>
        {laundryHeroCard}
        {laundryActionRow}
        {laundryCycleCard}
        {laundryLoadSizeCard}
      </View>
      <View style={laundryControlGridStyle}>{laundryControlCards}</View>
    </>
  ) : (
    <>
      {laundryHeroCard}
      {laundryControlCards}
      {laundryActionRow}
    </>
  );
}
