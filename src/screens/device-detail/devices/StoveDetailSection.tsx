import React from "react";
import { View, Text } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Pressable from "../../../components/Pressable";
import OptionChips from "../../../components/OptionChips";

type StoveDetailSectionProps = {
  isLandscapeSplit: boolean;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  controlCardStyle: StyleProp<ViewStyle>;
  controlCardRowTopStyle: StyleProp<ViewStyle>;
  cardLabelStyle: StyleProp<TextStyle>;
  chipRowStyle: StyleProp<ViewStyle>;
  chipStyle: (active: boolean) => StyleProp<ViewStyle>;
  chipTextStyle: (active: boolean) => StyleProp<TextStyle>;
  budgetHintStyle: StyleProp<TextStyle>;
  controlPillStyle: (active: boolean) => StyleProp<ViewStyle>;
  controlPillTextStyle: (active: boolean) => StyleProp<TextStyle>;
  stoveHeroCard: React.ReactNode;
  stoveModeOptions: Array<{ label: string; value: string }>;
  stoveMode: string;
  stoveTimer: number;
  stoveLock: boolean;
  onSetMode: (value: string) => void;
  onSetTimer: (value: number) => void;
  onToggleLock: () => void;
};

export default function StoveDetailSection({
  isLandscapeSplit,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  controlCardStyle,
  controlCardRowTopStyle,
  cardLabelStyle,
  chipRowStyle,
  chipStyle,
  chipTextStyle,
  budgetHintStyle,
  controlPillStyle,
  controlPillTextStyle,
  stoveHeroCard,
  stoveModeOptions,
  stoveMode,
  stoveTimer,
  stoveLock,
  onSetMode,
  onSetTimer,
  onToggleLock,
}: StoveDetailSectionProps) {
  const timerOptions = [0, 5, 10, 20, 30];
  const modeCard = (
    <View style={controlCardStyle}>
      <Text style={cardLabelStyle}>Mode</Text>
      <OptionChips
        options={stoveModeOptions}
        value={stoveMode}
        onSelect={onSetMode}
        rowStyle={chipRowStyle}
        chipStyle={chipStyle}
        chipTextStyle={chipTextStyle}
      />
    </View>
  );
  const timerCard = (
    <View style={controlCardStyle}>
      <Text style={cardLabelStyle}>Timer</Text>
      <OptionChips
        options={timerOptions.map((value) => ({
          value,
          label: value === 0 ? "Off" : `${value} min`,
        }))}
        value={stoveTimer}
        onSelect={onSetTimer}
        rowStyle={chipRowStyle}
        chipStyle={chipStyle}
        chipTextStyle={chipTextStyle}
      />
      <Text style={budgetHintStyle}>
        {stoveTimer ? `Auto-off in ${stoveTimer} min` : "No timer set"}
      </Text>
    </View>
  );
  const safetyCard = (
    <View style={controlCardStyle}>
      <Text style={cardLabelStyle}>Safety</Text>
      <View style={controlCardRowTopStyle}>
        <Pressable style={controlPillStyle(stoveLock)} onPress={onToggleLock}>
          <Text style={controlPillTextStyle(stoveLock)}>
            {stoveLock ? "Child Lock" : "Lock Off"}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>{stoveHeroCard}</View>
      <View style={landscapeColumnSecondaryStyle}>
        {modeCard}
        {timerCard}
        {safetyCard}
      </View>
    </View>
  ) : (
    <>
      {stoveHeroCard}
      {modeCard}
      {timerCard}
      {safetyCard}
    </>
  );
}
