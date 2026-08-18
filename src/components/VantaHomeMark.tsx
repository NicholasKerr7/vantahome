import React from "react";
import { Image } from "react-native";

const approvedVantaHomeIcon = require("../../assets/release/icon.png");

export default function VantaHomeMark({ size = 220 }: { size?: number }) {
  return (
    <Image
      accessibilityLabel="VantaHome logo"
      source={approvedVantaHomeIcon}
      resizeMode="contain"
      style={{ width: size, height: size }}
    />
  );
}
