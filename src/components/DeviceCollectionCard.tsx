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

/** Both paged collections reserve this height before applying the user's font scale. */
export const DEVICE_COLLECTION_CARD_MIN_HEIGHT = 192;

export type DeviceCollectionCardProps = {
  name: string;
  status: string;
  value: string;
  caption: string;
  active: boolean;
  quickActionLabel: string;
  onOpen: () => void;
  onQuickAction: () => void;
  disabled?: boolean;
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
  quickActionLabel,
  onOpen,
  onQuickAction,
  disabled = false,
  onLongPress,
  style,
}: DeviceCollectionCardProps) {
  return (
    <View style={[styles.card, active && styles.activeCard, style]}>
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
            ]}
          >
            {value}
          </Text>
          <Text numberOfLines={2} style={styles.caption}>
            {caption}
          </Text>
        </View>
      </Pressable>
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
        <Ionicons name="flash-outline" size={15} color={theme.colors.accent} />
      </Pressable>
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
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.glass,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
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
