import React, { useMemo } from "react";
import { Image, PixelRatio, StyleSheet } from "react-native";

const approvedVantaHomeIcon = require("../../assets/release/icon.png");
const compactVantaHomeIcon = require("../../assets/brand/vantahome-mark-256.png");

/** Displays the approved mark, using the compact artwork when its resolution is sufficient. */
export default function VantaHomeMark({
  size = 220,
  decorative = false,
}: {
  size?: number;
  decorative?: boolean;
}) {
  const styles = useMemo(
    () => StyleSheet.create({ image: { width: size, height: size, borderRadius: size * 0.23 } }),
    [size],
  );

  return (
    <Image
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : "VantaHome logo"}
      source={size * PixelRatio.get() <= 256 ? compactVantaHomeIcon : approvedVantaHomeIcon}
      resizeMode="contain"
      style={styles.image}
    />
  );
}
