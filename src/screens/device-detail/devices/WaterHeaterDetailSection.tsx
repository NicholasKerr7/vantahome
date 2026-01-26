import React from "react";
import { View, Text } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Pressable from "../../../components/Pressable";
import RadialDial from "../../../components/RadialDial";
import OptionChips from "../../../components/OptionChips";

type WaterHeaterDetailSectionProps = {
  isLandscapeSplit: boolean;
  usePortraitGrid: boolean;
  portraitGridStyle: StyleProp<ViewStyle>;
  portraitCardStyle: StyleProp<ViewStyle>;
  landscapeGridStyle: StyleProp<ViewStyle>;
  landscapeColumnPrimaryStyle: StyleProp<ViewStyle>;
  landscapeColumnSecondaryStyle: StyleProp<ViewStyle>;
  waterHeaterHeroCard?: React.ReactNode;
  isOn: boolean;
  compactDialSize: number;
  heaterTemp: number;
  heaterStatus: string;
  heaterMode: string;
  heaterType: string;
  heaterModeOptions: Array<{ label: string; value: string }>;
  heaterTypeOptions: Array<{ label: string; value: string }>;
  heaterVacationDays: number;
  heaterScheduleEnabled: boolean;
  heaterSanitize: boolean;
  heaterRecirculation: boolean;
  showRecirculation: boolean;
  controlCardStyle: StyleProp<ViewStyle>;
  controlCardRowTopStyle: StyleProp<ViewStyle>;
  controlCardRowTightStyle: StyleProp<ViewStyle>;
  cardLabelStyle: StyleProp<TextStyle>;
  chipRowStyle: StyleProp<ViewStyle>;
  chipStyle: (active: boolean) => StyleProp<ViewStyle>;
  chipTextStyle: (active: boolean) => StyleProp<TextStyle>;
  controlPillStyle: (active: boolean) => StyleProp<ViewStyle>;
  controlPillTextStyle: (active: boolean) => StyleProp<TextStyle>;
  heaterStatusTextStyle: StyleProp<TextStyle>;
  budgetHintStyle: StyleProp<TextStyle>;
  onSetTemp: (value: number) => void;
  onSetType: (value: string) => void;
  onSetMode: (value: string) => void;
  onToggleSchedule: () => void;
  onToggleSanitize: () => void;
  onToggleRecirculation: () => void;
  onSetVacation: (value: number) => void;
  marginBottom6Style: StyleProp<ViewStyle>;
  iconColor: string;
};

export default function WaterHeaterDetailSection({
  isLandscapeSplit,
  usePortraitGrid,
  portraitGridStyle,
  portraitCardStyle,
  landscapeGridStyle,
  landscapeColumnPrimaryStyle,
  landscapeColumnSecondaryStyle,
  waterHeaterHeroCard,
  isOn,
  compactDialSize,
  heaterTemp,
  heaterStatus,
  heaterMode,
  heaterType,
  heaterModeOptions,
  heaterTypeOptions,
  heaterVacationDays,
  heaterScheduleEnabled,
  heaterSanitize,
  heaterRecirculation,
  showRecirculation,
  controlCardStyle,
  controlCardRowTopStyle,
  controlCardRowTightStyle,
  cardLabelStyle,
  chipRowStyle,
  chipStyle,
  chipTextStyle,
  controlPillStyle,
  controlPillTextStyle,
  heaterStatusTextStyle,
  budgetHintStyle,
  onSetTemp,
  onSetType,
  onSetMode,
  onToggleSchedule,
  onToggleSanitize,
  onToggleRecirculation,
  onSetVacation,
  marginBottom6Style,
  iconColor,
}: WaterHeaterDetailSectionProps) {
  const cardStyle = usePortraitGrid
    ? [controlCardStyle, portraitCardStyle]
    : controlCardStyle;
  const heroTop = waterHeaterHeroCard ?? (
    <>
      <RadialDial
        size={compactDialSize}
        value={heaterTemp}
        min={40}
        max={70}
        tickValues={[40, 45, 50, 55, 60, 65, 70]}
        centerLabel="Setpoint"
        centerIcon={
          <View style={marginBottom6Style}>
            <Ionicons name="thermometer" size={28} color={iconColor} />
          </View>
        }
        formatTick={(v) => `${v}`}
        formatValue={(v) => `${v}°C`}
        formatCenterValue={(v) => `${v}°C`}
        dimmed={!isOn}
        onChange={(v) => onSetTemp(v)}
      />
      <Text style={heaterStatusTextStyle}>{heaterStatus}</Text>
    </>
  );
  const typeCard = (
    <View style={cardStyle}>
      <Text style={cardLabelStyle}>Heater type</Text>
      <OptionChips
        options={heaterTypeOptions}
          value={heaterType}
          onSelect={onSetType}
          rowStyle={chipRowStyle}
        chipStyle={chipStyle}
        chipTextStyle={chipTextStyle}
      />
    </View>
  );
  const modeCard = (
    <View style={cardStyle}>
      <Text style={cardLabelStyle}>Mode</Text>
      <OptionChips
        options={heaterModeOptions}
          value={heaterMode}
          onSelect={onSetMode}
          rowStyle={chipRowStyle}
        chipStyle={chipStyle}
        chipTextStyle={chipTextStyle}
      />
    </View>
  );

  const detailColumn = (
    <>
      <View style={cardStyle}>
        <Text style={cardLabelStyle}>Smart features</Text>
        <View style={controlCardRowTopStyle}>
          <Pressable
            style={controlPillStyle(heaterScheduleEnabled)}
            onPress={onToggleSchedule}
          >
            <Text style={controlPillTextStyle(heaterScheduleEnabled)}>
              {heaterScheduleEnabled ? "Schedule" : "Schedule Off"}
            </Text>
          </Pressable>
          <Pressable
            style={controlPillStyle(heaterSanitize)}
            onPress={onToggleSanitize}
          >
            <Text style={controlPillTextStyle(heaterSanitize)}>
              {heaterSanitize ? "Sanitize" : "Sanitize Off"}
            </Text>
          </Pressable>
        </View>
        {showRecirculation && (
          <View style={controlCardRowTightStyle}>
            <Pressable
              style={controlPillStyle(heaterRecirculation)}
              onPress={onToggleRecirculation}
            >
              <Text style={controlPillTextStyle(heaterRecirculation)}>
                {heaterRecirculation ? "Recirculation" : "Recirc Off"}
              </Text>
            </Pressable>
          </View>
        )}
        <Text style={budgetHintStyle}>
          {heaterType === "tankless"
            ? "Recirculation keeps hot water ready."
            : "Schedules reduce standby heat loss."}
        </Text>
      </View>

      <View style={cardStyle}>
        <Text style={cardLabelStyle}>Vacation</Text>
        <OptionChips
          options={[0, 3, 7, 14, 30].map((value) => ({
            value,
            label: value === 0 ? "Off" : `${value}d`,
          }))}
          value={heaterVacationDays}
          onSelect={onSetVacation}
          rowStyle={chipRowStyle}
          chipStyle={chipStyle}
          chipTextStyle={chipTextStyle}
        />
        <Text style={budgetHintStyle}>
          {heaterMode === "vacation"
            ? heaterVacationDays > 0
              ? `Vacation mode set for ${heaterVacationDays} days.`
              : "Vacation mode active."
            : "Set days, then enable Vacation mode."}
        </Text>
      </View>
    </>
  );

  return isLandscapeSplit ? (
    <View style={landscapeGridStyle}>
      <View style={landscapeColumnPrimaryStyle}>
        {heroTop}
        {typeCard}
        {modeCard}
      </View>
      <View style={landscapeColumnSecondaryStyle}>{detailColumn}</View>
    </View>
  ) : usePortraitGrid ? (
    <>
      {heroTop}
      <View style={portraitGridStyle}>
        {typeCard}
        {modeCard}
        {detailColumn}
      </View>
    </>
  ) : (
    <>
      {heroTop}
      {typeCard}
      {modeCard}
      {detailColumn}
    </>
  );
}
