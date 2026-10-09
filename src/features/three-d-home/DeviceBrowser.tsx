import React, { useMemo, useRef, useState } from "react";
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "../../components/Pressable";
import DeviceCollectionCard, {
  DEVICE_COLLECTION_CARD_MIN_HEIGHT,
} from "../../components/DeviceCollectionCard";
import { theme } from "../../theme/theme";
import type { SimulationDeviceControls } from "./modelDeviceControls";
import {
  DEVICES,
  ROOMS,
  getRoom,
  type DeviceDefinition,
} from "../../../packages/home-scene/src/data";
import {
  deviceStatus,
  quickActionLabel,
} from "../../../packages/home-scene/src/deviceCapabilities";
import { deviceCardReading } from "../../../packages/home-scene/src/dashboardCardPresentation";
import type { ControlSnapshot } from "./simulationControlClient";
import { ControlPagination } from "./ControlPagination";
import { deviceMatchesQuery } from "./deviceBrowserSearch";
import { useDeviceBrowserFavorites } from "./useDeviceBrowserFavorites";
import { deviceBrowserStyles as styles } from "./deviceBrowserStyles";
import CinematicCardArtwork from "../cinematic-artwork/CinematicCardArtwork";
import { deviceArtwork, roomArtwork } from "../cinematic-artwork/artwork";

type Props = {
  allowedDeviceIds?: readonly string[];
  onSelect: (id: string) => void;
  snapshot: ControlSnapshot;
  client: SimulationDeviceControls;
};
const COMPACT_SEARCH_ROW_HEIGHT = 88;

/** Present rooms as destinations and devices as actionable cards within a measured, paged space. */
export default function DeviceBrowser({
  onSelect,
  snapshot,
  client,
  allowedDeviceIds,
}: Props) {
  const { fontScale, height, width } = useWindowDimensions();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [searchSessionActive, setSearchSessionActive] = useState(false);
  const input = useRef<TextInput>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favorites = useDeviceBrowserFavorites();
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const searching = Boolean(query.trim());
  const showingFavorites = favorites.enabled && favoritesOnly;
  const compactSearch = searchSessionActive && (width < 760 || height < 700);
  const showingDevices =
    Boolean(roomId) || searching || showingFavorites || compactSearch;
  const columns =
    !compactSearch && space.width >= 280 && fontScale <= 1.2 ? 2 : 1;
  const rowHeight =
    (compactSearch
      ? COMPACT_SEARCH_ROW_HEIGHT
      : showingDevices
        ? DEVICE_COLLECTION_CARD_MIN_HEIGHT
        : 130) * Math.max(1, fontScale);
  // Search matches retain their touch-sized height even when only one result fills the page.
  const compactRowStyle = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flex: 0,
          minHeight: COMPACT_SEARCH_ROW_HEIGHT * Math.max(1, fontScale),
        },
      }).row,
    [fontScale],
  );
  const sparseRowStyle = useMemo(
    () =>
      StyleSheet.create({
        row: {
          minHeight: DEVICE_COLLECTION_CARD_MIN_HEIGHT * Math.max(1, fontScale),
          maxHeight: 240 * Math.max(1, fontScale),
        },
      }).row,
    [fontScale],
  );
  const rows = Math.max(
    1,
    Math.min(2, Math.floor((space.height + 10) / (rowHeight + 10))),
  );
  const pageSize = columns * rows;
  const availableDevices = allowedDeviceIds
    ? DEVICES.filter((device) => allowedDeviceIds.includes(device.id))
    : DEVICES;
  const favoriteIds = favorites.ids.filter((id) =>
    availableDevices.some((device) => device.id === id),
  );
  const devices = availableDevices.filter((device) =>
    searching
      ? deviceMatchesQuery(device, query)
      : showingFavorites
        ? favoriteIds.includes(device.id)
        : compactSearch && !roomId
          ? true
          : device.roomId === roomId,
  );
  const choices = showingDevices
    ? devices
    : ROOMS.filter((room) =>
        availableDevices.some((device) => device.roomId === room.id),
      );
  const pageCount = Math.max(1, Math.ceil(choices.length / pageSize));
  const visiblePage = Math.min(page, pageCount - 1);
  const visible = choices.slice(
    visiblePage * pageSize,
    (visiblePage + 1) * pageSize,
  );
  const sparsePage =
    showingDevices && (visible.length < pageSize || choices.length === 1);
  const cardRows = Array.from(
    { length: Math.ceil(visible.length / columns) },
    (_, row) => visible.slice(row * columns, (row + 1) * columns),
  );

  /** Recalculate card capacity only when available space actually changes. */
  function measure(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSpace((previous) =>
      previous.width === width && previous.height === height
        ? previous
        : { width, height },
    );
  }

  /** A global query always starts at the first result, regardless of the previously browsed room. */
  function search(value: string): void {
    setQuery(value);
    setRoomId(null);
    setFavoritesOnly(false);
    setPage(0);
  }

  /** Reset every filter together so an empty result can never strand the room directory. */
  function showRooms(): void {
    search("");
    finishSearch();
  }

  /** Release the keyboard before restoring full cards or entering a device inspector. */
  function finishSearch(): void {
    input.current?.blur();
    Keyboard.dismiss();
    setSearchSessionActive(false);
  }

  /** Enter controls with a clear viewport, including after a keyboard-driven search. */
  function openDevice(id: string): void {
    finishSearch();
    onSelect(id);
  }

  return (
    <>
      <View style={styles.searchRow}>
        <Ionicons
          name="search-outline"
          size={18}
          color={theme.colors.subtext}
        />
        <TextInput
          ref={input}
          accessibilityLabel="Search all devices and rooms"
          placeholder="Search devices or rooms"
          placeholderTextColor={theme.colors.subtext}
          value={query}
          onChangeText={search}
          onFocus={() => {
            setSearchSessionActive(true);
            setPage(0);
          }}
          onSubmitEditing={finishSearch}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
        />
        {(query.length > 0 || searchSessionActive) && (
          <Pressable
            accessibilityLabel={
              query.length > 0 ? "Clear device search" : "Close device search"
            }
            onPress={showRooms}
            style={styles.clear}
          >
            <Ionicons name="close" size={19} color={theme.colors.accentText} />
          </Pressable>
        )}
      </View>
      {!compactSearch && (
        <View style={styles.breadcrumb}>
          <Pressable
            accessibilityLabel="Browse all rooms"
            accessibilityState={{ selected: !showingDevices }}
            aria-pressed={!showingDevices}
            onPress={showRooms}
            style={[styles.filter, !showingDevices && styles.selectedFilter]}
          >
            <Ionicons
              name={roomId ? "arrow-back" : "grid-outline"}
              size={16}
              color={theme.colors.accentText}
            />
            <Text style={styles.backLabel}>Rooms</Text>
          </Pressable>
          {favorites.enabled && (
            <Pressable
              accessibilityLabel="Browse favorite devices"
              accessibilityState={{ selected: showingFavorites }}
              aria-pressed={showingFavorites}
              onPress={() => {
                setQuery("");
                setRoomId(null);
                setFavoritesOnly(true);
                setPage(0);
              }}
              style={[styles.filter, showingFavorites && styles.selectedFilter]}
            >
              <Ionicons
                name="star-outline"
                size={16}
                color={theme.colors.accentText}
              />
              <Text style={styles.backLabel}>
                Favorites {favoriteIds.length}
              </Text>
            </Pressable>
          )}
          <Text numberOfLines={1} style={styles.contextValue}>
            {roomId
              ? getRoom(roomId).name
              : `${choices.length} ${showingDevices ? "devices" : "spaces"}`}
          </Text>
        </View>
      )}
      {favorites.enabled && favorites.status === "error" && (
        <Text accessibilityRole="alert" style={styles.saveWarning}>
          Favorites could not be saved or loaded. Changes stay in this session.
        </Text>
      )}
      <View
        testID="device-browser-card-area"
        style={styles.cards}
        onLayout={measure}
      >
        {!choices.length && (
          <View style={styles.empty}>
            <Ionicons
              name={showingFavorites ? "star-outline" : "search-outline"}
              size={28}
              color={theme.colors.accentText}
            />
            <Text style={styles.emptyTitle}>
              {showingFavorites
                ? favorites.status === "loading"
                  ? "Loading favorites…"
                  : "Your favorites start here"
                : "No matching devices"}
            </Text>
            <Text style={styles.emptyDetail}>
              {showingFavorites
                ? "Tap the star on a device card to keep it close."
                : searching
                  ? "Try a device or room name, or clear the search."
                  : "No devices are available in this home view."}
            </Text>
            <Pressable
              accessibilityLabel="Clear filters and browse rooms"
              onPress={showRooms}
              style={styles.filter}
            >
              <Text style={styles.backLabel}>Browse rooms</Text>
            </Pressable>
          </View>
        )}
        {cardRows.map((row) => (
          <View
            key={row[0].id}
            testID="device-browser-result-row"
            style={[
              styles.cardRow,
              compactSearch ? compactRowStyle : sparsePage && sparseRowStyle,
            ]}
          >
            {row.map((choice) =>
              showingDevices ? (
                <DeviceCard
                  key={choice.id}
                  device={choice as DeviceDefinition}
                  snapshot={snapshot}
                  client={client}
                  onSelect={openDevice}
                  compact={compactSearch}
                  favorite={favoriteIds.includes(choice.id)}
                  favoriteDisabled={favorites.status === "loading"}
                  onToggleFavorite={
                    favorites.enabled
                      ? () => favorites.toggle(choice.id)
                      : undefined
                  }
                />
              ) : (
                <Pressable
                  key={choice.id}
                  accessibilityLabel={`${choice.name}, ${availableDevices.filter((device) => device.roomId === choice.id).length} devices`}
                  onPress={() => {
                    setRoomId(choice.id);
                    setPage(0);
                  }}
                  style={styles.roomCard}
                >
                  <CinematicCardArtwork artwork={roomArtwork(choice)} variant="room-backdrop" testID={`room-artwork-${choice.id}`} />
                  <View style={styles.cardTop}>
                    <View style={styles.roomIcon}>
                      <Ionicons
                        name={
                          getRoom(choice.id).outdoor
                            ? "leaf-outline"
                            : "layers-outline"
                        }
                        size={24}
                        color={theme.colors.accentText}
                      />
                    </View>
                    <View style={styles.roomIcon}>
                      <Ionicons
                        name="arrow-forward"
                        size={17}
                        color={theme.colors.text}
                      />
                    </View>
                  </View>
                  <View style={styles.roomIdentity}>
                    <Text numberOfLines={2} style={styles.roomName}>
                      {choice.name}
                    </Text>
                    <Text style={styles.roomDetail}>
                      {
                        availableDevices.filter(
                          (device) => device.roomId === choice.id,
                        ).length
                      }{" "}
                      devices ·{" "}
                      {getRoom(choice.id).outdoor
                        ? "Outside"
                        : getRoom(choice.id).floor === "ground"
                          ? "Ground"
                          : "Upper"}
                    </Text>
                  </View>
                </Pressable>
              ),
            )}
            {row.length < columns && <View style={styles.spacer} />}
          </View>
        ))}
      </View>
      <ControlPagination
        page={visiblePage}
        count={pageCount}
        onChange={setPage}
      />
    </>
  );
}

/** Adapt the simulation snapshot to the shared collection card without coupling it to a store. */
function DeviceCard({
  device,
  snapshot,
  client,
  onSelect,
  favorite,
  favoriteDisabled,
  onToggleFavorite,
  compact,
}: Props & {
  device: DeviceDefinition;
  favorite: boolean;
  favoriteDisabled: boolean;
  onToggleFavorite?: () => void;
  compact: boolean;
}) {
  const state = snapshot.state.deviceStates[device.id];
  const controlDisabled = !snapshot.ready || (snapshot.access !== undefined && !snapshot.access.controllableDeviceIds.includes(device.id));
  const status = deviceStatus(device, state);
  const reading = deviceCardReading(device, state);
  if (compact)
    return (
      <View style={styles.compactResult}>
        <Pressable
          accessibilityLabel={`${device.name}, ${status}. Full controls`}
          onPress={() => onSelect(device.id)}
          style={styles.compactIdentity}
        >
          <CinematicCardArtwork artwork={deviceArtwork(device)} variant="thumbnail" />
          <View style={styles.compactCopy}>
            <Text numberOfLines={2} style={styles.compactName}>
              {device.name}
            </Text>
            <Text numberOfLines={1} style={styles.roomDetail}>
              {reading.value} · {getRoom(device.roomId).name}
            </Text>
          </View>
        </Pressable>
        <View style={styles.compactActions}>
          <Pressable
            accessibilityLabel={`${quickActionLabel(device, state)}: ${device.name}`}
            disabled={controlDisabled}
            accessibilityState={{ disabled: controlDisabled }}
            onPress={() => client.toggle(device.id)}
            style={[styles.compactAction, controlDisabled && styles.disabled]}
          >
            <Ionicons
              name="flash-outline"
              size={18}
              color={theme.colors.accentText}
            />
          </Pressable>
          {onToggleFavorite && (
            <Pressable
              accessibilityLabel={`${favorite ? "Remove" : "Add"} ${device.name} ${favorite ? "from" : "to"} favorites`}
              accessibilityState={{
                selected: favorite,
                disabled: favoriteDisabled,
              }}
              aria-pressed={favorite}
              disabled={favoriteDisabled}
              onPress={onToggleFavorite}
              style={[
                styles.compactAction,
                favoriteDisabled && styles.disabled,
              ]}
            >
              <Ionicons
                name={favorite ? "star" : "star-outline"}
                size={18}
                color={theme.colors.accentText}
              />
            </Pressable>
          )}
        </View>
      </View>
    );
  return (
    <DeviceCollectionCard
      artwork={deviceArtwork(device)}
      name={device.name}
      status={status}
      value={reading.value}
      caption={reading.caption}
      favorite={favorite}
      favoriteDisabled={favoriteDisabled}
      onToggleFavorite={onToggleFavorite}
      active={state.on}
      quickActionLabel={quickActionLabel(device, state)}
      disabled={controlDisabled}
      onOpen={() => onSelect(device.id)}
      onQuickAction={() => client.toggle(device.id)}
    />
  );
}
