import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import BackgroundLines from "../components/BackgroundLines";
import LandscapeFrame from "../components/LandscapeFrame";
import PortraitFrame from "../components/PortraitFrame";
import ModalCard from "../components/ModalCard";
import ModalActionRow from "../components/ModalActionRow";
import { theme } from "../theme/theme";
import {
  selectActiveMember,
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
} from "../store/useHomeStore";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import { useResponsive } from "../theme/layout";

type Props = NativeStackScreenProps<RootStackParamList, "ManageRooms">;

export default function ManageRoomsScreen({ navigation }: Props) {
  const { width, contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(900);
  const isWide = isTablet && isLandscape;
  const iconSize = Math.round((isTablet ? 46 : 40) * scale);
  const iconRadius = Math.round(iconSize * 0.4);
  const titleSize = Math.round((isTablet ? 20 : 18) * scale);
  const cardPad = Math.round((isTablet ? 18 : 14) * scale);
  const cardRadius = Math.round((isTablet ? 26 : 24) * scale);
  const frameRadius = Math.round((isTablet ? 30 : 26) * scale);
  const outerGutter = isWide
    ? Math.round(gutter * 0.4)
    : Math.round(
        gutter *
          (isLandscape ? (isTablet ? 0.9 : 0.75) : isTablet ? 0.8 : 0.65),
      );
  const innerGutter = Math.round(
    gutter * (isLandscape ? (isTablet ? 1.05 : 0.95) : isTablet ? 0.95 : 0.85),
  );
  const framePad = innerGutter;
  const frameWidth = Math.max(
    0,
    (isWide ? width : contentWidth) - outerGutter * 2,
  );
  const inputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const inputRadius = Math.round(inputHeight * 0.28);
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const metaSize = Math.round((isTablet ? 13 : 12) * scale);
  const actionBtnSize = Math.round((isTablet ? 40 : 36) * scale);
  const actionBtnRadius = Math.round(actionBtnSize * 0.33);
  const rowGap = Math.round((isTablet ? 14 : 12) * scale);
  const gridGap = Math.round((isTablet ? 18 : 12) * scale);
  const primaryHeight = Math.round((isTablet ? 46 : 42) * scale);
  const primaryRadius = Math.round(primaryHeight * 0.28);
  const modalPad = Math.round((isTablet ? 20 : 18) * scale);
  const modalRadius = Math.round((isTablet ? 24 : 22) * scale);
  const modalTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const modalSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const modalInputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const modalButtonHeight = Math.round((isTablet ? 46 : 42) * scale);
  const scrollTopPad = Math.round(12 * scale);
  const scrollBottomPad = Math.round(
    (isTablet ? (isLandscape ? 120 : 140) : 120) * scale,
  );
  const rootStyle: StyleProp<ViewStyle> = [styles.root, { paddingTop: topPad }];
  const contentStyle: StyleProp<ViewStyle> = [
    styles.content,
    {
      paddingHorizontal: outerGutter,
      paddingTop: Math.round(12 * scale),
      paddingBottom: outerGutter,
    },
  ];
  const iconButtonLayout: ViewStyle = {
    width: iconSize,
    height: iconSize,
    borderRadius: iconRadius,
  };
  const iconButtonStyle: StyleProp<ViewStyle> = [
    styles.iconBtn,
    iconButtonLayout,
  ];
  const titleTextStyle: StyleProp<TextStyle> = [
    styles.title,
    { fontSize: titleSize },
  ];
  const scrollContentStyle: ViewStyle = {
    paddingTop: scrollTopPad,
    paddingBottom: scrollBottomPad,
  };
  const landscapeColumns = isWide ? (width >= 1200 ? 4 : 3) : 1;
  const portraitColumns = !isLandscape && width >= 700 ? 2 : 1;
  const columns = isWide ? landscapeColumns : portraitColumns;
  const isGridColumns = columns > 1;
  const cardsGridLayout: ViewStyle | null = isGridColumns
    ? { flexDirection: "row", flexWrap: "wrap" }
    : null;
  const cardsGridStyle: StyleProp<ViewStyle> = [
    styles.cardsGrid,
    { gap: gridGap },
    cardsGridLayout,
    isGridColumns && styles.cardsGridWide,
  ];
  const gridWidth = Math.max(0, frameWidth - framePad * 2);
  const cardWidth = isGridColumns
    ? (gridWidth - gridGap * (columns - 1)) / columns
    : "100%";
  const cardLayout: ViewStyle = {
    padding: cardPad,
    borderRadius: cardRadius,
    ...(isGridColumns
      ? {
          flexBasis: cardWidth,
          flexGrow: 1,
          minWidth: cardWidth,
        }
      : { width: "100%" }),
  };
  const roomCardStyle: StyleProp<ViewStyle> = [
    styles.card,
    cardLayout,
  ];
  const flex1Style: StyleProp<ViewStyle> = { flex: 1 };
  const rowTopStyle: StyleProp<ViewStyle> = [
    styles.rowTop,
    { gap: rowGap },
  ];
  const rowBottomStyle: StyleProp<ViewStyle> = [
    styles.rowBottom,
    { gap: rowGap },
  ];
  const labelTextStyle: StyleProp<TextStyle> = [
    styles.label,
    { fontSize: labelSize },
  ];
  const inputLayout: TextStyle = {
    height: inputHeight,
    borderRadius: inputRadius,
  };
  const inputStyle: StyleProp<TextStyle> = [styles.input, inputLayout];
  const metaTextStyle: StyleProp<TextStyle> = [
    styles.meta,
    { fontSize: metaSize },
  ];
  const actionBtnLayout: ViewStyle = {
    width: actionBtnSize,
    height: actionBtnSize,
    borderRadius: actionBtnRadius,
  };
  const actionBtnStyle: StyleProp<ViewStyle> = [
    styles.actionBtn,
    actionBtnLayout,
  ];
  const actionButtonStyle = (disabled: boolean): StyleProp<ViewStyle> => [
    actionBtnStyle,
    disabled && styles.actionBtnDisabled,
  ];
  const primaryBtnLayout: ViewStyle = {
    height: primaryHeight,
    borderRadius: primaryRadius,
  };
  const primaryBtnStyle: StyleProp<ViewStyle> = [
    styles.primaryBtn,
    primaryBtnLayout,
  ];
  const primaryButtonStyle = (disabled: boolean): StyleProp<ViewStyle> => [
    primaryBtnStyle,
    disabled && styles.primaryBtnDisabled,
  ];
  const primaryTextStyle: StyleProp<TextStyle> = [
    styles.primaryText,
    { fontSize: labelSize },
  ];
  const deleteBtnStyle: StyleProp<ViewStyle> = [
    styles.deleteBtn,
    primaryBtnLayout,
  ];
  const deleteButtonStyle = (disabled: boolean): StyleProp<ViewStyle> => [
    deleteBtnStyle,
    disabled && styles.actionBtnDisabled,
  ];
  const deleteTextStyle: StyleProp<TextStyle> = [
    styles.deleteText,
    { fontSize: labelSize },
  ];
  const modalCardLayout: ViewStyle = {
    padding: modalPad,
    borderRadius: modalRadius,
    maxWidth: isTablet ? 520 : undefined,
    width: isTablet ? Math.min(contentWidth - gutter * 2, 520) : undefined,
    alignSelf: isTablet ? "center" : "stretch",
  };
  const modalCardStyle: StyleProp<ViewStyle> = [
    styles.modalCard,
    modalCardLayout,
  ];
  const modalTitleStyle: StyleProp<TextStyle> = [
    styles.modalTitle,
    { fontSize: modalTitleSize },
  ];
  const modalSubStyle: StyleProp<TextStyle> = [
    styles.modalSub,
    { fontSize: modalSubSize },
  ];
  const modalInputLayout: TextStyle = {
    height: modalInputHeight,
    borderRadius: Math.round(modalInputHeight * 0.28),
  };
  const modalInputStyle: StyleProp<TextStyle> = [
    styles.modalInput,
    modalInputLayout,
  ];
  const modalGhostLayout: ViewStyle = {
    height: modalButtonHeight,
    borderRadius: Math.round(modalButtonHeight * 0.28),
  };
  const modalGhostStyle: StyleProp<ViewStyle> = [
    styles.modalGhost,
    modalGhostLayout,
  ];
  const modalGhostTextStyle: StyleProp<TextStyle> = [
    styles.modalGhostText,
    { fontSize: labelSize },
  ];
  const modalPrimaryStyle: StyleProp<ViewStyle> = [
    styles.modalPrimary,
    modalGhostLayout,
  ];
  const modalPrimaryButtonStyle = (disabled: boolean): StyleProp<ViewStyle> => [
    modalPrimaryStyle,
    disabled && styles.modalPrimaryDisabled,
  ];
  const modalPrimaryTextStyle: StyleProp<TextStyle> = [
    styles.modalPrimaryText,
    { fontSize: labelSize },
  ];
  const rooms = useHomeStore(selectVisibleRooms);
  const devices = useHomeStore(selectVisibleDevices);
  const activeMember = useHomeStore(selectActiveMember);
  const canManageRooms = activeMember
    ? ["Owner", "Admin"].includes(activeMember.role)
    : false;
  const addRoom = useHomeStore((s) => s.addRoom);
  const renameRoom = useHomeStore((s) => s.renameRoom);
  const moveRoom = useHomeStore((s) => s.moveRoom);
  const removeRoom = useHomeStore((s) => s.removeRoom);

  const [showAdd, setShowAdd] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const FrameComponent = isLandscape ? LandscapeFrame : PortraitFrame;
  const frameEnabled = true;

  const deviceCountByRoom = useMemo(() => {
    const map: Record<string, number> = {};
    rooms.forEach((r) => {
      map[r.id] = devices.filter((d) => d.roomId === r.id).length;
    });
    return map;
  }, [rooms, devices]);

  const handleCreate = () => {
    if (!canManageRooms) return;
    const trimmed = roomName.trim();
    if (!trimmed) return;
    addRoom(trimmed);
    setRoomName("");
    setShowAdd(false);
  };

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={rootStyle}
    >
      <BackgroundLines />

      <View style={contentStyle}>
        <View style={styles.top}>
          <Pressable
            style={iconButtonStyle}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          </Pressable>
          <Text style={titleTextStyle}>Manage Rooms</Text>
          <Pressable
            style={iconButtonStyle}
            onPress={() => setShowAdd(true)}
            disabled={!canManageRooms}
          >
            <Ionicons name="add" size={20} color={theme.colors.text} />
          </Pressable>
        </View>
        {!canManageRooms ? (
          <Text style={styles.readOnlyNote}>
            Room changes require an admin account.
          </Text>
        ) : null}

        <FrameComponent
          enabled={frameEnabled}
          pad={framePad}
          radius={frameRadius}
          width={frameWidth}
          style={styles.frameFill}
        >
          <ScrollView
            style={styles.cardsScroll}
            contentContainerStyle={scrollContentStyle}
            showsVerticalScrollIndicator={false}
          >
            <View style={cardsGridStyle}>
              {rooms.map((room, idx) => {
                const draft = drafts[room.id] ?? room.name;
                const canSave =
                  draft.trim().length > 1 && draft.trim() !== room.name;
                const isLastRoom = rooms.length <= 1;
                return (
                  <View key={room.id} style={roomCardStyle}>
                    <View style={rowTopStyle}>
                      <View style={flex1Style}>
                        <Text style={labelTextStyle}>Room name</Text>
                        <TextInput
                          value={draft}
                          onChangeText={(value) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [room.id]: value,
                            }))
                          }
                          placeholder="Room name"
                          placeholderTextColor="rgba(255,255,255,0.45)"
                          style={inputStyle}
                          editable={canManageRooms}
                        />
                        <Text style={metaTextStyle}>
                          {deviceCountByRoom[room.id] ?? 0} devices
                        </Text>
                      </View>

                      <View style={styles.actions}>
                        <Pressable
                          style={actionButtonStyle(!canManageRooms || idx === 0)}
                          onPress={() => moveRoom(room.id, -1)}
                          disabled={!canManageRooms || idx === 0}
                        >
                          <Ionicons
                            name="chevron-up"
                            size={18}
                            color={theme.colors.text}
                          />
                        </Pressable>
                        <Pressable
                          style={actionButtonStyle(
                            !canManageRooms || idx === rooms.length - 1,
                          )}
                          onPress={() => moveRoom(room.id, 1)}
                          disabled={!canManageRooms || idx === rooms.length - 1}
                        >
                          <Ionicons
                            name="chevron-down"
                            size={18}
                            color={theme.colors.text}
                          />
                        </Pressable>
                      </View>
                    </View>

                    <View style={rowBottomStyle}>
                      <Pressable
                        style={primaryButtonStyle(!canManageRooms || !canSave)}
                        onPress={() => {
                          if (!canManageRooms || !canSave) return;
                          renameRoom(room.id, draft.trim());
                        }}
                        disabled={!canManageRooms || !canSave}
                      >
                        <Text style={primaryTextStyle}>Save</Text>
                      </Pressable>
                      <Pressable
                        style={deleteButtonStyle(
                          !canManageRooms || isLastRoom,
                        )}
                        onPress={() => {
                          if (!canManageRooms || isLastRoom) return;
                          removeRoom(room.id);
                        }}
                        disabled={!canManageRooms || isLastRoom}
                      >
                        <Text style={deleteTextStyle}>
                          {isLastRoom ? "Keep at least 1 room" : "Delete"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </FrameComponent>
      </View>

      <ModalCard
        visible={showAdd}
        onRequestClose={() => setShowAdd(false)}
        onBackdropPress={() => setShowAdd(false)}
        colors={["rgba(255,255,255,0.96)", "rgba(246,238,255,0.90)"]}
        cardStyle={modalCardStyle}
      >
        <Text style={modalTitleStyle}>Add room</Text>
        <Text style={modalSubStyle}>Give the room a friendly name.</Text>

        <TextInput
          value={roomName}
          onChangeText={setRoomName}
          placeholder="Office, Patio, Studio..."
          placeholderTextColor="rgba(12,12,18,0.45)"
          style={modalInputStyle}
          autoCapitalize="words"
          returnKeyType="done"
        />

        <ModalActionRow
          style={styles.modalRow}
          actions={[
            {
              label: "Cancel",
              onPress: () => setShowAdd(false),
              style: modalGhostStyle,
              textStyle: modalGhostTextStyle,
            },
            {
              label: "Create",
              onPress: handleCreate,
              style: modalPrimaryButtonStyle(!roomName.trim()),
              textStyle: modalPrimaryTextStyle,
              disabled: !roomName.trim(),
            },
          ]}
        />
      </ModalCard>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: "center" },
  frameFill: { flex: 1 },
  cardsScroll: { flex: 1 },
  cardsGrid: { width: "100%" },
  cardsGridWide: {
    justifyContent: "space-between",
    alignContent: "stretch",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 12,
  },
  readOnlyNote: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: theme.colors.text, fontWeight: "900", fontSize: 18 },

  card: {
    borderRadius: 24,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
  },
  rowTop: { flexDirection: "row", gap: 12 },
  rowBottom: { flexDirection: "row", gap: 10, marginTop: 12 },
  label: { color: theme.colors.subtext, fontWeight: "800", marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    color: theme.colors.text,
    fontWeight: "800",
  },
  meta: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginTop: 6,
    fontSize: 12,
  },

  actions: { gap: 8, justifyContent: "center" },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnDisabled: { opacity: 0.45 },

  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(180,107,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryText: { color: "#FFFFFF", fontWeight: "900" },
  deleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255, 99, 132, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: "#ffdbe6", fontWeight: "900", fontSize: 12 },

  modalCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.40)",
  },
  modalTitle: { color: "rgba(12,12,18,0.9)", fontWeight: "900", fontSize: 18 },
  modalSub: { color: "rgba(12,12,18,0.55)", fontWeight: "700", marginTop: 6 },
  modalInput: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    paddingHorizontal: 12,
    color: "rgba(12,12,18,0.9)",
    fontWeight: "700",
  },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalGhostText: { color: "rgba(12,12,18,0.75)", fontWeight: "800" },
  modalPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#6B3CFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryDisabled: { opacity: 0.6 },
  modalPrimaryText: { color: "#FFFFFF", fontWeight: "900" },
});
