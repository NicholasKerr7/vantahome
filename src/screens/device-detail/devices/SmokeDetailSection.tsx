import React from "react";
import { View, Text } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

type SmokeDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeColumnGapStyle: StyleProp<ViewStyle>;
  smokeHeroCard: React.ReactNode;
  smokeStatusCard: React.ReactNode;
  smokeMetricsRow: React.ReactNode;
  smokeActionRow: React.ReactNode;
  smokeSilenced: boolean;
  alertRowStyle: StyleProp<ViewStyle>;
  alertTextWarnStyle: StyleProp<TextStyle>;
};

export default function SmokeDetailSection({
  isLandscapeSplit,
  landscapeColumnGapStyle,
  smokeHeroCard,
  smokeStatusCard,
  smokeMetricsRow,
  smokeActionRow,
  smokeSilenced,
  alertRowStyle,
  alertTextWarnStyle,
}: SmokeDetailSectionProps) {
  const alertNode = smokeSilenced ? (
    <View style={alertRowStyle}>
      <Ionicons name="alert" size={14} color="#B7791F" />
      <Text style={alertTextWarnStyle}>Alarm silenced</Text>
    </View>
  ) : null;

  return isLandscapeSplit ? (
    <>
      <View style={landscapeColumnGapStyle}>{smokeHeroCard}</View>
      <View style={landscapeColumnGapStyle}>
        {smokeStatusCard}
        {smokeMetricsRow}
        {smokeActionRow}
        {alertNode}
      </View>
    </>
  ) : (
    <>
      {smokeHeroCard}
      {smokeStatusCard}
      {alertNode}
    </>
  );
}
