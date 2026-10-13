import React, { useState } from "react";
import { StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme/theme";
import { resolveProfilePortraitUri } from "../features/household/profilePortrait";

type AvatarSize = 32 | 38 | 44 | 48 | 60 | 68 | 92;
type AvatarFallback = "initials" | "person";
type PortraitContentProps = {
  uri?: string;
  initials: string;
  size: AvatarSize;
  fallback: AvatarFallback;
};

/** Keep initials readable for empty names and Unicode characters. */
function initialsFrom(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase() || "VH";
}

/** A source-keyed child prevents a late failure from hiding a newly selected portrait. */
function PortraitContent({ uri, initials, size, fallback }: PortraitContentProps) {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return <Image source={{ uri }} contentFit="cover" style={[styles.image, imageSizes[size]]}
      allowDownscaling enforceEarlyResizing transition={0}
      accessible={false} onError={() => setFailed(true)} />;
  }
  return fallback === "person"
    ? <Ionicons name="person-outline" size={iconSizes[size]} color={theme.colors.accentText} />
    : <Text style={[styles.text, textSizes[size]]} numberOfLines={1}>{initials}</Text>;
}

/** Render a saved portrait with a durable initials fallback and shared size tokens. */
export default function AvatarChip({
  name, size = 38, color, uri, style, initials, fallback = "initials", decorative = false,
}: {
  name: string;
  size?: AvatarSize;
  color?: string;
  uri?: string;
  style?: StyleProp<ViewStyle>;
  initials?: string;
  fallback?: AvatarFallback;
  decorative?: boolean;
}) {
  const source = resolveProfilePortraitUri(uri);
  return (
    <LinearGradient colors={[color || theme.colors.accent2, "rgba(255,255,255,0.28)"]}
      start={{ x: 0.1, y: 0.1 }} end={{ x: 1, y: 1 }}
      style={[styles.wrap, sizes[size], style]} accessible={!decorative}
      accessibilityRole="image" accessibilityLabel={decorative ? undefined : `${name} portrait`}
      accessibilityElementsHidden={decorative} importantForAccessibility={decorative ? "no-hide-descendants" : "auto"}>
      <PortraitContent key={source ?? "empty"} uri={source} initials={initials ?? initialsFrom(name)} size={size} fallback={fallback} />
    </LinearGradient>
  );
}

const iconSizes: Record<AvatarSize, number> = { 32: 17, 38: 20, 44: 23, 48: 25, 60: 27, 68: 32, 92: 42 };
const sizes = StyleSheet.create({
  32: { width: 32, height: 32, borderRadius: 16 },
  38: { width: 38, height: 38, borderRadius: 19 },
  44: { width: 44, height: 44, borderRadius: 22 },
  48: { width: 48, height: 48, borderRadius: 24 },
  60: { width: 60, height: 60, borderRadius: 30 },
  68: { width: 68, height: 68, borderRadius: 34 },
  92: { width: 92, height: 92, borderRadius: 46 },
});
const imageSizes = StyleSheet.create({
  32: { borderRadius: 14 }, 38: { borderRadius: 17 }, 44: { borderRadius: 20 },
  48: { borderRadius: 22 }, 60: { borderRadius: 28 }, 68: { borderRadius: 32 }, 92: { borderRadius: 44 },
});
const textSizes = StyleSheet.create({
  32: { fontSize: 12 }, 38: { fontSize: 14 }, 44: { fontSize: 17 },
  48: { fontSize: 18 }, 60: { fontSize: 22 }, 68: { fontSize: 26 }, 92: { fontSize: 35 },
});
const styles = StyleSheet.create({
  wrap: {
    alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 2,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.40)",
    shadowColor: theme.colors.glow, shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  image: { width: "100%", height: "100%" },
  text: { color: theme.colors.text, fontWeight: "700", letterSpacing: -0.4 },
});
