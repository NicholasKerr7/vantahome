import React from "react";
import { View, Text, TextInput } from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import ModalCard from "../../components/ModalCard";
import ModalActionRow from "../../components/ModalActionRow";
import ModalField from "../../components/ModalField";
import Pressable from "../../components/Pressable";
import type { Device } from "../../store/useHomeStore";

const MODAL_COLORS = [
  "rgba(255,255,255,0.96)",
  "rgba(255,255,255,0.96)",
] as const;

type RoomRef = { id: string; name: string };

type DeviceEditModalProps = {
  visible: boolean;
  onClose: () => void;
  cardStyle?: StyleProp<ViewStyle>;
  titleStyle: StyleProp<TextStyle>;
  subtitleStyle: StyleProp<TextStyle>;
  labelStyle: StyleProp<TextStyle>;
  inputStyle: StyleProp<ViewStyle>;
  draftName: string;
  onChangeDraftName: (value: string) => void;
  rooms: RoomRef[];
  draftRoomId: string;
  onChangeDraftRoomId: (id: string) => void;
  roomRowStyle: StyleProp<ViewStyle>;
  roomPillStyle: (active: boolean) => StyleProp<ViewStyle>;
  roomPillTextStyle: (active: boolean) => StyleProp<TextStyle>;
  isLaundry: boolean;
  stackEnabled: boolean;
  onToggleStack: (enabled: boolean) => void;
  stackPartnerKind: string | null;
  stackRowStyle: StyleProp<ViewStyle>;
  stackPillStyle: (active: boolean) => StyleProp<ViewStyle>;
  stackPillTextStyle: (active: boolean) => StyleProp<TextStyle>;
  stackTargetsRowStyle: StyleProp<ViewStyle>;
  stackCandidates: Device[];
  stackTargetId: string | null;
  onChangeStackTargetId: (id: string) => void;
  stackTargetPillStyle: (active: boolean) => StyleProp<ViewStyle>;
  stackTargetTextStyle: (active: boolean) => StyleProp<TextStyle>;
  stackHintStyle: StyleProp<TextStyle>;
  actionsStyle: StyleProp<ViewStyle>;
  ghostButtonStyle: StyleProp<ViewStyle>;
  ghostTextStyle: StyleProp<TextStyle>;
  primaryButtonStyle: (disabled: boolean) => StyleProp<ViewStyle>;
  primaryTextStyle: StyleProp<TextStyle>;
  deleteButtonStyle: StyleProp<ViewStyle>;
  deleteTextStyle: StyleProp<TextStyle>;
  canSave: boolean;
  onSave: () => void;
  onDelete: () => void;
};

export default function DeviceEditModal({
  visible,
  onClose,
  cardStyle,
  titleStyle,
  subtitleStyle,
  labelStyle,
  inputStyle,
  draftName,
  onChangeDraftName,
  rooms,
  draftRoomId,
  onChangeDraftRoomId,
  roomRowStyle,
  roomPillStyle,
  roomPillTextStyle,
  isLaundry,
  stackEnabled,
  onToggleStack,
  stackPartnerKind,
  stackRowStyle,
  stackPillStyle,
  stackPillTextStyle,
  stackTargetsRowStyle,
  stackCandidates,
  stackTargetId,
  onChangeStackTargetId,
  stackTargetPillStyle,
  stackTargetTextStyle,
  stackHintStyle,
  actionsStyle,
  ghostButtonStyle,
  ghostTextStyle,
  primaryButtonStyle,
  primaryTextStyle,
  deleteButtonStyle,
  deleteTextStyle,
  canSave,
  onSave,
  onDelete,
}: DeviceEditModalProps) {
  const partnerLabel = stackPartnerKind ?? "pair";

  return (
    <ModalCard
      visible={visible}
      onRequestClose={onClose}
      onBackdropPress={onClose}
      colors={MODAL_COLORS}
      cardStyle={cardStyle}
    >
      <View testID="device-edit-card">
        <Text style={titleStyle}>Edit device</Text>
        <Text style={subtitleStyle}>
          Rename or move this device to another room.
        </Text>

        <ModalField label="Device name" labelStyle={labelStyle}>
          <TextInput
            accessibilityLabel="Device name"
            value={draftName}
            onChangeText={onChangeDraftName}
            placeholder="Device name"
            placeholderTextColor="rgba(12,12,18,0.45)"
            style={inputStyle}
            autoCapitalize="words"
          />
        </ModalField>

        <ModalField label="Room" labelStyle={labelStyle}>
          <View style={roomRowStyle}>
            {rooms.map((room) => {
              const active = room.id === draftRoomId;
              return (
                <Pressable
                  key={room.id}
                  style={roomPillStyle(active)}
                  onPress={() => onChangeDraftRoomId(room.id)}
                >
                  <Text style={roomPillTextStyle(active)}>{room.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </ModalField>

        {isLaundry && (
          <>
            <ModalField label="Laundry stack" labelStyle={labelStyle}>
              <View style={stackRowStyle}>
                <Pressable
                  style={stackPillStyle(!stackEnabled)}
                  onPress={() => onToggleStack(false)}
                >
                  <Text style={stackPillTextStyle(!stackEnabled)}>
                    Single
                  </Text>
                </Pressable>
                <Pressable
                  style={stackPillStyle(stackEnabled)}
                  onPress={() => onToggleStack(true)}
                >
                  <Text style={stackPillTextStyle(stackEnabled)}>
                    Stacked
                  </Text>
                </Pressable>
              </View>
            </ModalField>
            {stackEnabled && (
              <ModalField
                label={`Pair with ${partnerLabel}`}
                labelStyle={labelStyle}
              >
                <View style={stackTargetsRowStyle}>
                  {stackCandidates.length ? (
                    stackCandidates.map((candidate) => {
                      const active = candidate.id === stackTargetId;
                      return (
                        <Pressable
                          key={candidate.id}
                          style={stackTargetPillStyle(active)}
                          onPress={() => onChangeStackTargetId(candidate.id)}
                        >
                          <Text style={stackTargetTextStyle(active)}>
                            {candidate.name}
                          </Text>
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text style={stackHintStyle}>
                      No {partnerLabel} in this room yet.
                    </Text>
                  )}
                </View>
              </ModalField>
            )}
            <Text style={stackHintStyle}>
              {stackEnabled
                ? "Link this unit to show as a stacked pair."
                : "Keep this unit independent."}
            </Text>
          </>
        )}

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

        <Pressable style={deleteButtonStyle} onPress={onDelete}>
          <Text style={deleteTextStyle}>Delete device</Text>
        </Pressable>
      </View>
    </ModalCard>
  );
}
