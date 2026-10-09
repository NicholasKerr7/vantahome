import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Pressable from "./Pressable";
import { theme } from "../theme/theme";
import CinematicCardArtwork from "../features/cinematic-artwork/CinematicCardArtwork";
import type { ArtworkKey } from "../features/cinematic-artwork/artwork";

/** Both paged collections reserve this height before applying the user's font scale. */
export const DEVICE_COLLECTION_CARD_MIN_HEIGHT = 192;

export type DeviceCollectionCardProps = {
  name: string;
  status: string;
  value: string;
  caption: string;
  active: boolean;
  statusTone?: "normal" | "warning" | "alarm";
  artwork?: ArtworkKey;
  quickActionLabel: string;
  onOpen: () => void;
  onQuickAction: () => void;
  disabled?: boolean;
  favorite?: boolean;
  favoriteDisabled?: boolean;
  onToggleFavorite?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Share the collection design while keeping device logic and data ownership in each caller. */
export default function DeviceCollectionCard({
  name,
  status,
  value,
  caption,
  active,
  statusTone = "normal",
  artwork = "device-generic",
  quickActionLabel,
  onOpen,
  onQuickAction,
  disabled = false,
  favorite = false,
  favoriteDisabled = false,
  onToggleFavorite,
  onLongPress,
  style,
}: DeviceCollectionCardProps) {
  return (
    <View style={[styles.card, active && styles.activeCard, style, statusTone === "alarm" && styles.alarmCard, statusTone === "warning" && styles.warningCard]}>
      <CinematicCardArtwork artwork={artwork} testID="device-collection-artwork" />
      <Pressable
        accessibilityLabel={`${name}, ${status}. Full controls`}
        accessibilityHint={
          onLongPress
            ? "Opens all settings. Touch and hold to manage this device."
            : "Opens all settings for this device."
        }
        accessibilityActions={
          onLongPress
            ? [{ name: "longpress", label: "Manage device" }]
            : undefined
        }
        onAccessibilityAction={
          onLongPress
            ? (event) => {
                if (event.nativeEvent.actionName === "longpress") onLongPress();
              }
            : undefined
        }
        onPress={onOpen}
        onLongPress={onLongPress}
        style={styles.identity}
      >
        <View style={styles.heading}>
          <Text numberOfLines={2} style={styles.name}>
            {name}
          </Text>
          <Ionicons
            name="arrow-up-outline"
            size={17}
            color={theme.colors.subtext}
            style={styles.arrow}
          />
        </View>
        <View style={styles.reading}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={[
              styles.value,
              value.length > 9 && styles.longValue,
              active && styles.activeValue,
              statusTone === "alarm" && styles.alarmValue,
              statusTone === "warning" && styles.warningValue,
            ]}
          >
            {value}
          </Text>
          <Text numberOfLines={2} style={styles.caption}>
            {caption}
          </Text>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={`${quickActionLabel}: ${name}`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onQuickAction}
          style={[styles.quickAction, disabled && styles.disabled]}
        >
          <Text numberOfLines={2} style={styles.quickLabel}>
            {quickActionLabel}
          </Text>
          <Ionicons
            name="flash-outline"
            size={15}
            color={theme.colors.accent}
          />
        </Pressable>
        {onToggleFavorite && (
          <Pressable
            accessibilityLabel={`${favorite ? "Remove" : "Add"} ${name} ${favorite ? "from" : "to"} favorites`}
            accessibilityState={{
              selected: favorite,
              disabled: favoriteDisabled,
            }}
            aria-pressed={favorite}
            disabled={favoriteDisabled}
            onPress={onToggleFavorite}
            style={[styles.favorite, favoriteDisabled && styles.disabled]}
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
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    overflow: "hidden",
  },
  activeCard: { borderColor: theme.colors.accent2 },
  alarmCard: { borderColor: theme.colors.alarmText },
  warningCard: { borderColor: theme.colors.warningText },
  alarmValue: { color: theme.colors.alarmText },
  warningValue: { color: theme.colors.warningText },
  identity: {
    flex: 1,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    justifyContent: "space-between",
  },
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },
  name: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  arrow: { transform: [{ rotate: "45deg" }] },
  reading: { gap: 4 },
  value: {
    color: theme.colors.subtext,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "500",
    letterSpacing: -1,
  },
  longValue: { fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  activeValue: { color: theme.colors.accentText },
  caption: { color: theme.colors.subtext, fontSize: 10, lineHeight: 14 },
  quickAction: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.glass,
  },
  favorite: {
    width: 44,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderColor: theme.colors.stroke,
  },
  quickLabel: {
    flex: 1,
    color: theme.colors.accentText,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  disabled: { opacity: 0.4 },
});
