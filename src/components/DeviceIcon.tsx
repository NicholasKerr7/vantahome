import React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Device } from "../store/useHomeStore";

const ICON_MAP: Record<Device["kind"], { set: "ion" | "mci"; name: string }> = {
  ac: { set: "ion", name: "snow" },
  light: { set: "ion", name: "bulb" },
  tv: { set: "ion", name: "tv" },
  coffee: { set: "ion", name: "cafe" },
  fridge: { set: "ion", name: "thermometer" },
  gate: { set: "ion", name: "exit" },
  garage: { set: "ion", name: "car-sport" },
  fan: { set: "ion", name: "aperture" },
  door: { set: "mci", name: "door" },
  vacuum: { set: "mci", name: "robot-vacuum" },
  camera: { set: "ion", name: "videocam" },
  window: { set: "mci", name: "window-closed" },
  stove: { set: "ion", name: "flame" },
  washer: { set: "mci", name: "washing-machine" },
  dryer: { set: "mci", name: "tumble-dryer" },
  microwave: { set: "mci", name: "microwave" },
  energy: { set: "ion", name: "flash" },
  water: { set: "ion", name: "water" },
  "water-heater": { set: "ion", name: "thermometer" },
  air: { set: "ion", name: "leaf" },
  sprinkler: { set: "ion", name: "rainy" },
  speaker: { set: "ion", name: "volume-high" },
  smoke: { set: "ion", name: "alert-circle" },
};

export default function DeviceIcon({
  kind,
  size,
  color,
}: {
  kind: Device["kind"];
  size: number;
  color: string;
}) {
  const icon = ICON_MAP[kind] ?? { set: "ion" as const, name: "cube" };

  if (icon.set === "mci") {
    return (
      <MaterialCommunityIcons
        name={icon.name as any}
        size={size}
        color={color}
      />
    );
  }

  return <Ionicons name={icon.name as any} size={size} color={color} />;
}
