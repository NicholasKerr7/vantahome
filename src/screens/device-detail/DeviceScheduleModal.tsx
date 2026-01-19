import React from "react";
import { View, Text, TextInput } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import ModalCard from "../../components/ModalCard";
import ModalActionRow from "../../components/ModalActionRow";
import ModalField from "../../components/ModalField";
import Pressable from "../../components/Pressable";

const MODAL_COLORS = [
  "rgba(255,255,255,0.96)",
  "rgba(255,255,255,0.96)",
] as const;

type ScheduleDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

type DeviceScheduleModalProps = {
  visible: boolean;
  onClose: () => void;
  cardStyle?: StyleProp<ViewStyle>;
  titleStyle: StyleProp<TextStyle>;
  subtitleStyle: StyleProp<TextStyle>;
  labelStyle: StyleProp<TextStyle>;
  timeRowStyle: StyleProp<ViewStyle>;
  timeInputStyle: StyleProp<ViewStyle>;
  timeColonStyle: StyleProp<TextStyle>;
  dayRowStyle: StyleProp<ViewStyle>;
  dayChipStyle: (active: boolean) => StyleProp<ViewStyle>;
  dayChipTextStyle: (active: boolean) => StyleProp<TextStyle>;
  schedHour: string;
  onChangeSchedHour: (value: string) => void;
  schedMinute: string;
  onChangeSchedMinute: (value: string) => void;
  schedDays: ScheduleDay[];
  onToggleDay: (day: ScheduleDay) => void;
  actionsStyle: StyleProp<ViewStyle>;
  ghostButtonStyle: StyleProp<ViewStyle>;
  ghostTextStyle: StyleProp<TextStyle>;
  primaryButtonStyle: (disabled: boolean) => StyleProp<ViewStyle>;
  primaryTextStyle: StyleProp<TextStyle>;
  canSave: boolean;
  onSave: () => void;
};

export default function DeviceScheduleModal({
  visible,
  onClose,
  cardStyle,
  titleStyle,
  subtitleStyle,
  labelStyle,
  timeRowStyle,
  timeInputStyle,
  timeColonStyle,
  dayRowStyle,
  dayChipStyle,
  dayChipTextStyle,
  schedHour,
  onChangeSchedHour,
  schedMinute,
  onChangeSchedMinute,
  schedDays,
  onToggleDay,
  actionsStyle,
  ghostButtonStyle,
  ghostTextStyle,
  primaryButtonStyle,
  primaryTextStyle,
  canSave,
  onSave,
}: DeviceScheduleModalProps) {
  return (
    <ModalCard
      visible={visible}
      onRequestClose={onClose}
      onBackdropPress={onClose}
      colors={MODAL_COLORS}
      cardStyle={cardStyle}
    >
      <Text style={titleStyle}>New schedule</Text>
      <Text style={subtitleStyle}>Pick a time and days to water.</Text>

      <ModalField label="Time" labelStyle={labelStyle}>
        <View style={timeRowStyle}>
          <TextInput
            value={schedHour}
            onChangeText={onChangeSchedHour}
            placeholder="06"
            keyboardType="number-pad"
            style={timeInputStyle}
            maxLength={2}
          />
          <Text style={timeColonStyle}>:</Text>
          <TextInput
            value={schedMinute}
            onChangeText={onChangeSchedMinute}
            placeholder="00"
            keyboardType="number-pad"
            style={timeInputStyle}
            maxLength={2}
          />
        </View>
      </ModalField>

      <ModalField label="Days" labelStyle={labelStyle}>
        <View style={dayRowStyle}>
          {(
            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
          ).map((day) => {
            const active = schedDays.includes(day);
            return (
              <Pressable
                key={day}
                style={dayChipStyle(active)}
                onPress={() => onToggleDay(day)}
              >
                <Text style={dayChipTextStyle(active)}>{day}</Text>
              </Pressable>
            );
          })}
        </View>
      </ModalField>

      <ModalActionRow
        style={actionsStyle}
        actions={[
          {
            label: "Cancel",
            onPress: onClose,
            style: ghostButtonStyle,
            textStyle: ghostTextStyle,
          },
          {
            label: "Save",
            onPress: onSave,
            style: primaryButtonStyle(!canSave),
            textStyle: primaryTextStyle,
            disabled: !canSave,
          },
        ]}
      />
    </ModalCard>
  );
}
