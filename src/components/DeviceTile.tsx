import React from "react";
import {
  View,
  Text,
  StyleSheet,
  type GestureResponderEvent,
} from "react-native";
import Pressable from "./Pressable";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { deviceClient } from "../services/deviceClient";
import {
  AC_TEMP_MAX_C,
  AC_TEMP_MIN_C,
  type Device,
} from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import DeviceIcon from "./DeviceIcon";

/**
 * “Glass” device tile used in the Room grid.
 *
 * - Tap tile: open device details screen
 * - Tap power/controls: quick actions without navigating
 * - Long-press tile: open the bottom sheet
 */
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * Prevent nested buttons (power, +/-) from triggering the tile’s onPress.
 * React Native bubbles press events unless we explicitly stop propagation.
 */
const stop = (e: GestureResponderEvent, fn: () => void) => {
  e.stopPropagation();
  fn();
};

function StepBtn({
  icon,
  onPress,
  size,
  iconSize,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size: number;
  iconSize: number;
}) {
  return (
    <Pressable
      onPress={(e) => stop(e, onPress)}
      style={[
        styles.stepBtn,
        { width: size, height: size, borderRadius: Math.round(size * 0.4) },
      ]}
      hitSlop={6}
    >
      <Ionicons name={icon} size={iconSize} color={theme.colors.text} />
    </Pressable>
  );
}

function ControlPill({
  label,
  onPress,
  height,
  fontSize,
}: {
  label: string;
  onPress: () => void;
  height: number;
  fontSize: number;
}) {
  return (
    <Pressable
      onPress={(e) => stop(e, onPress)}
      style={[
        styles.controlPill,
        { height, borderRadius: Math.round(height * 0.44) },
      ]}
      hitSlop={6}
    >
      <Text style={[styles.controlPillText, { fontSize }]}>{label}</Text>
    </Pressable>
  );
}

export default function DeviceTile({
  device,
  onPress,
  onLongPress,
}: {
  device: Device;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { isTablet, isLandscape, scale } = useResponsive();
  const sendPatch = (patch: Partial<Device>) => {
    deviceClient
      .sendCommand({ op: "patch", deviceId: device.id, patch })
      .catch(() => {});
  };
  const cardPad = Math.round((isTablet ? (isLandscape ? 16 : 18) : 14) * scale);
  const cardRadius = Math.round((isTablet ? 28 : 24) * scale);
  const minHeight = Math.round(
    (isTablet ? (isLandscape ? 190 : 210) : 168) * scale,
  );
  const iconWrapSize = Math.round((isTablet ? 52 : 44) * scale);
  const iconWrapRadius = Math.round(iconWrapSize * 0.36);
  const powerSize = Math.round((isTablet ? 40 : 34) * scale);
  const powerRadius = Math.round(powerSize * 0.42);
  const iconSize = Math.round((isTablet ? 22 : 20) * scale);
  const powerIconSize = Math.round((isTablet ? 18 : 16) * scale);
  const nameSize = Math.round((isTablet ? 16 : 14) * scale);
  const metaSize = Math.round((isTablet ? 13 : 12) * scale);
  const dividerGap = Math.round((isTablet ? 14 : 12) * scale);
  const stepSize = Math.round((isTablet ? 42 : 36) * scale);
  const stepIconSize = Math.round((isTablet ? 18 : 16) * scale);
  const controlFont = Math.round((isTablet ? 14 : 12) * scale);
  const pillHeight = Math.round((isTablet ? 40 : 36) * scale);

  const meta =
    device.kind === "ac"
      ? `${device.tempC ?? 22}°C • ${(device.mode ?? "cold").toUpperCase()}`
      : device.kind === "light"
        ? `${device.brightness ?? 60}%`
        : device.kind === "tv"
          ? `Vol ${device.volume ?? 20}`
          : device.kind === "fan"
            ? `Speed ${device.speed ?? 50}%`
            : device.kind === "fridge"
              ? `${device.tempC ?? 4}°C`
              : device.kind === "garage" ||
                  device.kind === "door" ||
                  device.kind === "gate" ||
                  device.kind === "window"
                ? `${Math.round(device.openPercent ?? 0)}% open`
                : device.kind === "vacuum"
                  ? `${device.status ?? "docked"}`
                  : device.kind === "camera"
                    ? device.armed
                      ? "Armed"
                      : "Disarmed"
                    : device.kind === "stove"
                      ? `Level ${device.burnerLevel ?? 0}`
                      : device.kind === "washer" || device.kind === "dryer"
                        ? `${device.cycle ?? "Normal"}`
                        : device.kind === "microwave"
                          ? `${device.timeRemainingSec ?? 0}s`
                          : device.kind === "energy"
                            ? device.gridAvailable === false
                              ? "Grid Offline"
                              : `${device.powerW ?? 0}W`
                            : device.kind === "water"
                              ? `${device.waterLpm ?? 0} L/min`
                              : device.kind === "air"
                                ? `AQI ${device.airQualityIndex ?? 0}`
                                : device.kind === "sprinkler"
                                  ? (device.zone ?? "Sprinkler")
                                  : device.kind === "speaker"
                                    ? `Vol ${device.volume ?? 20}`
                                    : device.kind === "smoke"
                                      ? device.smokeDetected
                                        ? "Alert"
                                        : "Clear"
                                      : device.isOn
                                        ? "On"
                                        : "Off";

  return (
    <Pressable
      style={[
        styles.card,
        { padding: cardPad, borderRadius: cardRadius, minHeight },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
    >
      <View style={styles.topRow}>
        <View
          style={[
            styles.iconWrap,
            {
              width: iconWrapSize,
              height: iconWrapSize,
              borderRadius: iconWrapRadius,
            },
            device.isOn && styles.iconWrapOn,
          ]}
        >
          <DeviceIcon
            kind={device.kind}
            size={iconSize}
            color={theme.colors.text}
          />
        </View>

        <Pressable
          onPress={(e) => stop(e, () => sendPatch({ isOn: !device.isOn }))}
          style={[
            styles.power,
            { width: powerSize, height: powerSize, borderRadius: powerRadius },
            device.isOn && styles.powerOn,
          ]}
          hitSlop={6}
        >
          <Ionicons
            name="power"
            size={powerIconSize}
            color={theme.colors.text}
          />
        </Pressable>
      </View>

      <Text style={[styles.name, { fontSize: nameSize }]} numberOfLines={1}>
        {device.name}
      </Text>
      <Text style={[styles.meta, { fontSize: metaSize }]} numberOfLines={1}>
        {meta}
      </Text>

      <View
        style={[
          styles.divider,
          { marginTop: dividerGap, marginBottom: dividerGap },
        ]}
      />

      {device.kind === "light" && (
        <View style={styles.controlsRow}>
          <StepBtn
            icon="remove"
            size={stepSize}
            iconSize={stepIconSize}
            onPress={() => {
              const next = clamp((device.brightness ?? 60) - 10, 0, 100);
              sendPatch({ brightness: next, isOn: next > 0 });
            }}
          />
          <Text style={[styles.controlValue, { fontSize: controlFont }]}>
            {device.brightness ?? 60}%
          </Text>
          <StepBtn
            icon="add"
            size={stepSize}
            iconSize={stepIconSize}
            onPress={() => {
              const next = clamp((device.brightness ?? 60) + 10, 0, 100);
              sendPatch({ brightness: next, isOn: true });
            }}
          />
        </View>
      )}

      {device.kind === "ac" && (
        <View style={styles.controlsRow}>
          <StepBtn
            icon="remove"
            size={stepSize}
            iconSize={stepIconSize}
            onPress={() =>
              sendPatch({
                tempC: clamp(
                  (device.tempC ?? 22) - 1,
                  AC_TEMP_MIN_C,
                  AC_TEMP_MAX_C,
                ),
                isOn: true,
              })
            }
          />
          <Text style={[styles.controlValue, { fontSize: controlFont }]}>
            {device.tempC ?? 22}°C
          </Text>
          <StepBtn
            icon="add"
            size={stepSize}
            iconSize={stepIconSize}
            onPress={() =>
              sendPatch({
                tempC: clamp(
                  (device.tempC ?? 22) + 1,
                  AC_TEMP_MIN_C,
                  AC_TEMP_MAX_C,
                ),
                isOn: true,
              })
            }
          />
        </View>
      )}

      {device.kind === "tv" && (
        <View style={styles.controlsRow}>
          <StepBtn
            icon="volume-low"
            size={stepSize}
            iconSize={stepIconSize}
            onPress={() =>
              sendPatch({
                volume: clamp((device.volume ?? 20) - 5, 0, 100),
                isOn: true,
              })
            }
          />
          <Text style={[styles.controlValue, { fontSize: controlFont }]}>
            Vol {device.volume ?? 20}
          </Text>
          <StepBtn
            icon="volume-high"
            size={stepSize}
            iconSize={stepIconSize}
            onPress={() =>
              sendPatch({
                volume: clamp((device.volume ?? 20) + 5, 0, 100),
                isOn: true,
              })
            }
          />
        </View>
      )}

      {device.kind === "fan" && (
        <View style={styles.controlsRow}>
          <StepBtn
            icon="remove"
            size={stepSize}
            iconSize={stepIconSize}
            onPress={() =>
              sendPatch({
                speed: clamp((device.speed ?? 50) - 10, 0, 100),
                isOn: true,
              })
            }
          />
          <Text style={[styles.controlValue, { fontSize: controlFont }]}>
            Speed {device.speed ?? 50}%
          </Text>
          <StepBtn
            icon="add"
            size={stepSize}
            iconSize={stepIconSize}
            onPress={() =>
              sendPatch({
                speed: clamp((device.speed ?? 50) + 10, 0, 100),
                isOn: true,
              })
            }
          />
        </View>
      )}

      {device.kind === "speaker" && (
        <View style={styles.controlsRow}>
          <StepBtn
            icon="volume-low"
            size={stepSize}
            iconSize={stepIconSize}
            onPress={() =>
              sendPatch({
                volume: clamp((device.volume ?? 20) - 5, 0, 100),
                isOn: true,
              })
            }
          />
          <Text style={[styles.controlValue, { fontSize: controlFont }]}>
            Vol {device.volume ?? 20}
          </Text>
          <StepBtn
            icon="volume-high"
            size={stepSize}
            iconSize={stepIconSize}
            onPress={() =>
              sendPatch({
                volume: clamp((device.volume ?? 20) + 5, 0, 100),
                isOn: true,
              })
            }
          />
        </View>
      )}

      {(device.kind === "door" ||
        device.kind === "garage" ||
        device.kind === "gate" ||
        device.kind === "window") && (
        <View style={[styles.controlsRow, { justifyContent: "flex-start" }]}>
          <ControlPill
            label="Open"
            height={pillHeight}
            fontSize={controlFont}
            onPress={() => sendPatch({ openPercent: 100, isOn: true })}
          />
          <ControlPill
            label="Close"
            height={pillHeight}
            fontSize={controlFont}
            onPress={() => sendPatch({ openPercent: 0, isOn: false })}
          />
        </View>
      )}

      {device.kind === "camera" && (
        <View style={[styles.controlsRow, { justifyContent: "flex-start" }]}>
          <ControlPill
            label={device.armed ? "Disarm" : "Arm"}
            height={pillHeight}
            fontSize={controlFont}
            onPress={() => sendPatch({ armed: !device.armed })}
          />
          <ControlPill
            label={device.recording ? "Stop" : "Record"}
            height={pillHeight}
            fontSize={controlFont}
            onPress={() => sendPatch({ recording: !device.recording })}
          />
        </View>
      )}

      {device.kind === "sprinkler" && (
        <View style={[styles.controlsRow, { justifyContent: "flex-start" }]}>
          <ControlPill
            label="Start"
            height={pillHeight}
            fontSize={controlFont}
            onPress={() => sendPatch({ isOn: true })}
          />
          <ControlPill
            label="Stop"
            height={pillHeight}
            fontSize={controlFont}
            onPress={() => sendPatch({ isOn: false })}
          />
        </View>
      )}

      {device.kind === "coffee" && (
        <View style={[styles.controlsRow, { justifyContent: "flex-start" }]}>
          <ControlPill
            label="Brew now"
            height={pillHeight}
            fontSize={controlFont}
            onPress={() => sendPatch({ isOn: true })}
          />
          <ControlPill
            label="Stop"
            height={pillHeight}
            fontSize={controlFont}
            onPress={() => sendPatch({ isOn: false })}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 24,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    minHeight: 168,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapOn: { backgroundColor: "rgba(180,107,255,0.26)" },

  power: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  powerOn: { backgroundColor: "rgba(180,107,255,0.22)" },

  name: { marginTop: 12, color: theme.colors.text, fontWeight: "900" },
  meta: {
    marginTop: 6,
    color: theme.colors.subtext,
    fontWeight: "700",
    fontSize: 12,
  },

  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginTop: 12,
    marginBottom: 12,
  },

  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlValue: {
    flex: 1,
    textAlign: "center",
    color: theme.colors.text,
    fontWeight: "900",
  },

  controlPill: {
    flex: 1,
    height: 36,
    borderRadius: 16,
    backgroundColor: "rgba(180,107,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlPillText: {
    color: theme.colors.text,
    fontWeight: "900",
    fontSize: 12,
  },
});
