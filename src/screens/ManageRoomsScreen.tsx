import React, { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import Pressable from "../components/Pressable";
import ModalCard from "../components/ModalCard";
import ModalForm, { useModalViewportStyle } from "../components/ModalForm";
import {
  DeepAction,
  DeepCard,
  DeepPager,
  DeepScreen,
} from "../components/deep/DeepScreen";
import {
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
} from "../store/useHomeStore";
import { roomWorkspaceStyles as styles } from "../features/rooms/roomWorkspaceStyles";
import { theme } from "../theme/theme";
import { ROOMS } from "../../packages/home-scene/src/data";
import { isModelHome } from "../features/three-d-home/modelHomeScope";
import { useCollectionPagination } from "./components/collectionPagination";
import { selectHomeNavigationAccess } from "../features/home-shell/homeNavigationAccess";
import ModelRoomConnection from "../features/rooms/ModelRoomConnection";
import CinematicCardArtwork from "../features/cinematic-artwork/CinematicCardArtwork";
import { roomArtwork } from "../features/cinematic-artwork/artwork";

type Props = NativeStackScreenProps<RootStackParamList, "ManageRooms">;

/** Open a room directly from the paged index, with explicit management beside each room. */
export default function ManageRoomsScreen({ navigation }: Props) {
  const { width, height, fontScale } = useWindowDimensions();
  const modalViewportStyle = useModalViewportStyle();
  const wide = width >= 700;
  const compact = height < 700;
  const rowHeight = wide ? 148 : 100;
  // Use the same scaled row height as pagination so complete cards fit above its fixed footer.
  const cardSizing = useMemo(
    () =>
      StyleSheet.create({
        card: { height: rowHeight * Math.max(1, fontScale) },
      }),
    [rowHeight, fontScale],
  );
  const rooms = useHomeStore(useShallow(selectVisibleRooms));
  const modelHome = useHomeStore(isModelHome);
  const devices = useHomeStore(useShallow(selectVisibleDevices));
  const canManageRooms = useHomeStore((state) => selectHomeNavigationAccess(state).admin);
  const canConnectModel = useHomeStore((state) => selectHomeNavigationAccess(state).admin && Boolean(state.authenticatedUserId));
  const canAddRooms = canManageRooms && !modelHome;
  const addRoom = useHomeStore((state) => state.addRoom);
  const renameRoom = useHomeStore((state) => state.renameRoom);
  const moveRoom = useHomeStore((state) => state.moveRoom);
  const removeRoom = useHomeStore((state) => state.removeRoom);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectingRoomId, setConnectingRoomId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const countByRoom = useMemo(() => {
    const counts: Record<string, number> = {};
    devices.forEach((device) => {
      counts[device.roomId] = (counts[device.roomId] ?? 0) + 1;
    });
    return counts;
  }, [devices]);
  const matchingRooms = rooms.filter((room) =>
    room.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const pagination = useCollectionPagination(
    matchingRooms.length,
    rowHeight,
    wide,
  );
  const selectedRoom = rooms.find((room) => room.id === selectedId);
  const modeledRoom = modelHome
    ? ROOMS.find((room) => room.id === selectedId)
    : undefined;
  const selectedIndex = rooms.findIndex((room) => room.id === selectedId);
  const draft = selectedRoom
    ? (drafts[selectedRoom.id] ?? selectedRoom.name)
    : "";
  const canSave =
    canManageRooms &&
    !modeledRoom &&
    draft.trim().length > 1 &&
    draft.trim() !== selectedRoom?.name;

  /** Create a room only for an authorized administrator, using the existing store action. */
  function createRoom() {
    if (!canAddRooms || !roomName.trim() || !selectHomeNavigationAccess(useHomeStore.getState()).admin) return;
    addRoom(roomName.trim());
    setRoomName("");
    setShowAdd(false);
  }

  /** Commit the selected room's draft without changing its devices or order. */
  function saveRoom() {
    if (!selectedRoom || !canSave || !selectHomeNavigationAccess(useHomeStore.getState()).admin) return;
    renameRoom(selectedRoom.id, draft.trim());
    setSelectedId(null);
  }

  /** Preserve the store's device reassignment behavior and the final-room guard. */
  function deleteRoom() {
    if (!selectedRoom || !canManageRooms || modeledRoom || rooms.length <= 1 || !selectHomeNavigationAccess(useHomeStore.getState()).admin)
      return;
    removeRoom(selectedRoom.id);
    setSelectedId(null);
  }

  /** Recheck the role when a retained ordering action runs after household permissions change. */
  function moveSelectedRoom(direction: -1 | 1): void {
    if (selectedRoom && selectHomeNavigationAccess(useHomeStore.getState()).admin) moveRoom(selectedRoom.id, direction);
  }

  /** Resolve visibility again before opening a room from a potentially stale card or dialog. */
  function openRoom(roomId: string) {
    if (
      !selectVisibleRooms(useHomeStore.getState()).some(
        (room) => room.id === roomId,
      )
    )
      return;
    setSelectedId(null);
    navigation.navigate("Room", { roomId });
  }

  return (
    <DeepScreen
      title="Rooms"
      eyebrow="YOUR SPACES"
      subtitle="Choose a room. Make yourself at home."
      onBack={() => navigation.goBack()}
      actions={
        !canAddRooms ? undefined : (
          <DeepAction
            label="Add room"
            icon="add-outline"
            primary
            disabled={!canAddRooms}
            onPress={() => {
              if (canAddRooms) setShowAdd(true);
            }}
          />
        )
      }
    >
      {compact ? (
        <Text
          style={styles.summary}
          accessibilityLabel={`${rooms.length} rooms, ${devices.length} devices`}
        >
          {rooms.length} rooms{" "}
          <Text style={styles.detail}>· {devices.length} devices</Text>
        </Text>
      ) : (
        <DeepCard>
          <View style={styles.overview}>
            <View style={styles.overviewText}>
              <Text style={styles.eyebrow}>YOUR SPACES</Text>
              <Text style={styles.title}>{rooms.length} rooms, one home.</Text>
              <Text style={styles.detail}>
                {devices.length} {modelHome ? "devices" : "connected devices"} ·{" "}
                {modelHome
                  ? "Rooms follow your 3D house plan."
                  : canManageRooms
                    ? "Open a room to control its devices."
                    : "Room changes require an admin account."}
              </Text>
            </View>
            <Ionicons
              name="grid-outline"
              size={28}
              color={theme.colors.accentText}
            />
          </View>
        </DeepCard>
      )}
      <TextInput
        accessibilityLabel="Find a room"
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          pagination.changePage(0);
        }}
        placeholder="Find a room"
        placeholderTextColor={theme.colors.muted}
        style={styles.search}
        autoCorrect={false}
        returnKeyType="search"
      />
      <View
        style={[styles.grid, wide && styles.gridWide]}
        onLayout={pagination.measure}
        testID="room-index-area"
      >
        {matchingRooms.slice(pagination.start, pagination.end).map((room) => {
          const metadata = modelHome
            ? ROOMS.find((space) => space.id === room.id)
            : undefined;
          const floor = metadata?.outdoor
            ? "Outside"
            : metadata?.floor === "upper"
              ? "Upper floor"
              : "Ground floor";
          return (
            <View
              key={room.id}
              style={[styles.card, wide && styles.cardWide, cardSizing.card]}
            >
              <CinematicCardArtwork artwork={roomArtwork(room)} variant="room-row" testID={`room-artwork-${room.id}`} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${room.name}`}
                accessibilityHint="View this room’s devices and scenes"
                style={styles.openRoom}
                onPress={() => openRoom(room.id)}
              >
                <View style={styles.icon}>
                  <Ionicons
                    name="cube-outline"
                    size={23}
                    color={theme.colors.accentText}
                  />
                </View>
                <View style={styles.roomText}>
                  <Text numberOfLines={2} style={[styles.roomName, styles.cardLabelShadow]}>
                    {room.name}
                  </Text>
                  <Text numberOfLines={1} style={[styles.detail, styles.cardDetail, styles.cardLabelShadow]}>
                    {countByRoom[room.id] ?? 0} devices
                    {metadata ? ` · ${floor}` : ""}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={theme.colors.subtext}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${canManageRooms ? 'Manage' : 'Details for'} ${room.name}`}
                accessibilityHint="View room details and organization options"
                style={styles.manageRoom}
                onPress={() => setSelectedId(room.id)}
              >
                <Ionicons
                  name="options-outline"
                  size={18}
                  color={theme.colors.accentText}
                />
                <Text style={[styles.manageLabel, styles.cardLabelShadow]}>{canManageRooms ? 'Manage' : 'Details'}</Text>
              </Pressable>
            </View>
          );
        })}
        {matchingRooms.length === 0 && (
          <View style={styles.empty}>
            <Ionicons
              name="search-outline"
              size={30}
              color={theme.colors.accentText}
            />
            <Text style={styles.detail}>No rooms match your search.</Text>
          </View>
        )}
      </View>
      <DeepPager
        label="rooms"
        page={pagination.page}
        pageCount={pagination.pageCount}
        onChange={pagination.changePage}
      />
      {selectedRoom && (
        <ModalCard
          visible
          onRequestClose={() => setSelectedId(null)}
          onBackdropPress={() => setSelectedId(null)}
          backdropAccessibilityLabel="Close room details"
          colors={[theme.colors.glass, theme.colors.bg0]}
          animationType="none"
          cardStyle={[styles.sheet, modalViewportStyle]}
        >
          <ModalForm
            footer={
              <View style={styles.footer}>
                <DeepAction label="Done" onPress={() => setSelectedId(null)} />
                <DeepAction
                  label="Open room"
                  icon="arrow-forward-outline"
                  onPress={() => openRoom(selectedRoom.id)}
                />
                {canManageRooms && !modeledRoom && (
                  <DeepAction
                    label="Save"
                    primary
                    disabled={!canSave}
                    onPress={saveRoom}
                  />
                )}
              </View>
            }
          >
            <View style={styles.section}>
              <View style={styles.section}>
                <Text style={styles.eyebrow}>
                  ROOM {String(selectedIndex + 1).padStart(2, "0")}
                </Text>
                <Text style={styles.title}>{selectedRoom.name}</Text>
                <Text style={styles.detail}>
                  {countByRoom[selectedRoom.id] ?? 0}{" "}
                  {modelHome ? "devices" : "connected devices"}
                </Text>
              </View>
              {modeledRoom ? (
                <View style={styles.section}>
                  <Text style={styles.detail}>
                    {modeledRoom.outdoor
                      ? "Outside"
                      : modeledRoom.floor === "upper"
                        ? "Upper floor"
                        : "Ground floor"}{" "}
                    · {modeledRoom.area}
                  </Text>
                  <Text style={styles.detail}>{modeledRoom.detail}</Text>
                  <Text style={styles.detail}>
                    Rooms follow your 3D house plan.
                  </Text>
                </View>
              ) : (
                <View style={styles.section}>
                  <Text style={styles.label}>Room name</Text>
                  <TextInput
                    accessibilityLabel={`${selectedRoom.name} room name`}
                    value={draft}
                    onChangeText={(value) =>
                      setDrafts((previous) => ({
                        ...previous,
                        [selectedRoom.id]: value,
                      }))
                    }
                    placeholder="Room name"
                    placeholderTextColor={theme.colors.muted}
                    style={styles.search}
                    editable={canManageRooms}
                    onSubmitEditing={saveRoom}
                    returnKeyType="done"
                  />
                </View>
              )}
              {canConnectModel && <DeepAction label={selectedRoom.modelRoomId ? 'Edit 3D connection' : 'Connect to 3D room'} icon="cube-outline" onPress={() => {
                if (!selectHomeNavigationAccess(useHomeStore.getState()).admin) return;
                setConnectingRoomId(selectedRoom.id);
                setSelectedId(null);
              }} />}
              {canManageRooms && <View style={styles.section}>
                <Text style={styles.label}>Position in your home</Text>
                <View style={styles.actions}>
                  <DeepAction
                    label="Move up"
                    accessibilityLabel={`Move ${selectedRoom.name} up`}
                    icon="arrow-up-outline"
                    disabled={!canManageRooms || selectedIndex === 0}
                    onPress={() => moveSelectedRoom(-1)}
                  />
                  <DeepAction
                    label="Move down"
                    accessibilityLabel={`Move ${selectedRoom.name} down`}
                    icon="arrow-down-outline"
                    disabled={
                      !canManageRooms || selectedIndex === rooms.length - 1
                    }
                    onPress={() => moveSelectedRoom(1)}
                  />
                </View>
              </View>}
              {canManageRooms && !modeledRoom && (
                <Pressable
                  accessibilityLabel={`Delete ${selectedRoom.name}`}
                  disabled={!canManageRooms || rooms.length <= 1}
                  accessibilityState={{
                    disabled: !canManageRooms || rooms.length <= 1,
                  }}
                  onPress={deleteRoom}
                  style={[
                    styles.danger,
                    (!canManageRooms || rooms.length <= 1) && styles.disabled,
                  ]}
                >
                  <Text style={styles.dangerText}>
                    {rooms.length <= 1 ? "Keep at least 1 room" : "Delete room"}
                  </Text>
                </Pressable>
              )}
            </View>
          </ModalForm>
        </ModalCard>
      )}
      {connectingRoomId && canConnectModel && <ModelRoomConnection key={connectingRoomId} roomId={connectingRoomId} onClose={() => setConnectingRoomId(null)} />}
      {showAdd && canAddRooms && (
        <ModalCard
          visible
          onRequestClose={() => setShowAdd(false)}
          onBackdropPress={() => setShowAdd(false)}
          backdropAccessibilityLabel="Close new room"
          colors={[theme.colors.glass, theme.colors.bg0]}
          animationType="none"
          cardStyle={[styles.sheet, modalViewportStyle]}
        >
          <ModalForm
            footer={
              <View style={styles.footer}>
                <DeepAction label="Cancel" onPress={() => setShowAdd(false)} />
                <DeepAction
                  label="Create"
                  primary
                  disabled={!canAddRooms || !roomName.trim()}
                  onPress={createRoom}
                />
              </View>
            }
          >
            <View style={styles.section}>
              <View style={styles.section}>
                <Text style={styles.eyebrow}>MAKE SPACE</Text>
                <Text style={styles.title}>A new room.</Text>
                <Text style={styles.detail}>
                  Give the room a friendly name.
                </Text>
              </View>
              <TextInput
                accessibilityLabel="New room name"
                value={roomName}
                onChangeText={setRoomName}
                placeholder="Office, Patio, Studio…"
                placeholderTextColor={theme.colors.muted}
                style={styles.search}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={createRoom}
              />
            </View>
          </ModalForm>
        </ModalCard>
      )}
    </DeepScreen>
  );
}
