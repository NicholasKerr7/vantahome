import React from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type TvDetailSectionProps = {
  isLandscapeSplit: boolean;
  isPortrait: boolean;
  tvStackedPortrait: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  tvPortraitFrameStyle: StyleProp<ViewStyle>;
  tvPortraitRowStyle: StyleProp<ViewStyle>;
  tvPortraitColumnStyle: StyleProp<ViewStyle>;
  tvPortraitStackStyle: StyleProp<ViewStyle>;
  tvHeroCard: React.ReactNode;
  tvVolumeCard: React.ReactNode;
  tvRemoteCard: React.ReactNode;
};

export default function TvDetailSection({
  isLandscapeSplit,
  isPortrait,
  tvStackedPortrait,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  tvPortraitFrameStyle,
  tvPortraitRowStyle,
  tvPortraitColumnStyle,
  tvPortraitStackStyle,
  tvHeroCard,
  tvVolumeCard,
  tvRemoteCard,
}: TvDetailSectionProps) {
  if (isLandscapeSplit) {
    return (
      <View style={landscapeGridStyle}>
        <View style={landscapeColumnPrimaryStyle}>
          {tvHeroCard}
          {tvVolumeCard}
        </View>
        <View style={landscapeColumnSecondaryStyle}>{tvRemoteCard}</View>
      </View>
    );
  }

  if (isPortrait) {
    return (
      <>
        {tvStackedPortrait ? (
          <View style={[tvPortraitFrameStyle, tvPortraitStackStyle]}>
            {tvHeroCard}
            {tvVolumeCard}
          </View>
        ) : (
          <View style={tvPortraitFrameStyle}>
            <View style={tvPortraitRowStyle}>
              <View style={tvPortraitColumnStyle}>{tvHeroCard}</View>
              <View style={tvPortraitColumnStyle}>{tvVolumeCard}</View>
            </View>
          </View>
        )}
        {tvRemoteCard}
      </>
    );
  }

  return (
    <>
      {tvHeroCard}
      {tvVolumeCard}
      {tvRemoteCard}
    </>
  );
}
