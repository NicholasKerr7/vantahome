import React from "react";
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
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

const OPENABLE_KINDS = ["gate", "door", "garage", "window"] as const;
type OpenableKind = (typeof OPENABLE_KINDS)[number];
const isOpenableKind = (kind: Device["kind"]): kind is OpenableKind =>
  OPENABLE_KINDS.includes(kind as OpenableKind);

const deviceMeta = (device: Device): string => {
  switch (device.kind) {
    case "ac":
      return `${device.tempC ?? 22}°C • ${(
        device.mode ?? "cold"
      ).toUpperCase()}`;
    case "light":
      return `${device.brightness ?? 60}%`;
    case "tv":
      return `Vol ${device.volume ?? 20}`;
    case "fan":
      return `Speed ${device.speed ?? 50}%`;
    case "fridge":
      return `${device.tempC ?? 4}°C`;
    case "garage":
    case "door":
    case "gate":
    case "window":
      return `${Math.round(device.openPercent ?? 0)}% open`;
    case "vacuum":
      return `${device.status ?? "docked"}`;
    case "camera":
      return device.armed ? "Armed" : "Disarmed";
    case "stove":
      return `Level ${device.burnerLevel ?? 0}`;
    case "washer":
    case "dryer":
      return `${device.cycle ?? "Normal"}`;
    case "microwave":
      return `${device.timeRemainingSec ?? 0}s`;
    case "energy":
      return device.gridAvailable === false
        ? "Grid Offline"
        : `${device.powerW ?? 0}W`;
    case "water":
      return `${device.waterLpm ?? 0} L/min`;
    case "water-heater":
      return `${device.tempC ?? 52}°C • ${(
        device.heaterMode ?? "eco"
      ).toUpperCase()}`;
    case "air":
      return `AQI ${device.airQualityIndex ?? 0}`;
    case "sprinkler":
      return device.zone ?? "Sprinkler";
    case "speaker":
      return device.isOn
        ? device.trackTitle ?? `Vol ${device.volume ?? 20}`
        : `Vol ${device.volume ?? 20}`;
    case "smoke":
      return device.smokeDetected ? "Alert" : "Clear";
    default:
      return device.isOn ? "On" : "Off";
  }
};

const stackMeta = (device: Device) => {
  if (!device.stackId) return "";
  if (device.stackPosition === "top") return " • Stack top";
  if (device.stackPosition === "bottom") return " • Stack bottom";
  return " • Stacked";
};

const stepButtonStyle = (size: number): StyleProp<ViewStyle> => [
  styles.stepBtn,
  { width: size, height: size, borderRadius: Math.round(size * 0.4) },
];

const controlPillStyle = (height: number): StyleProp<ViewStyle> => [
  styles.controlPill,
  { height, borderRadius: Math.round(height * 0.44) },
];

const controlPillTextStyle = (fontSize: number): StyleProp<TextStyle> => [
  styles.controlPillText,
  { fontSize },
];

const cardStyle = (
  padding: number,
  borderRadius: number,
  minHeight: number,
): StyleProp<ViewStyle> => [
  styles.card,
  { padding, borderRadius, minHeight },
];

const iconWrapStyle = (
  size: number,
  borderRadius: number,
  isOn: boolean,
): StyleProp<ViewStyle> => [
  styles.iconWrap,
  { width: size, height: size, borderRadius },
  isOn && styles.iconWrapOn,
];

const powerStyle = (
  size: number,
  borderRadius: number,
  isOn: boolean,
): StyleProp<ViewStyle> => [
  styles.power,
  { width: size, height: size, borderRadius },
  isOn && styles.powerOn,
];

const nameStyle = (fontSize: number): StyleProp<TextStyle> => [
  styles.name,
  { fontSize },
];

const metaStyle = (fontSize: number): StyleProp<TextStyle> => [
  styles.meta,
  { fontSize },
];

const dividerStyle = (gap: number): StyleProp<ViewStyle> => [
  styles.divider,
  { marginTop: gap, marginBottom: gap },
];

const controlValueStyle = (fontSize: number): StyleProp<TextStyle> => [
  styles.controlValue,
  { fontSize },
];

const controlsRowStyle = (alignStart: boolean): StyleProp<ViewStyle> => [
  styles.controlsRow,
  alignStart && styles.controlsRowStart,
];

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
      style={stepButtonStyle(size)}
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
      style={controlPillStyle(height)}
      hitSlop={6}
    >
      <Text style={controlPillTextStyle(fontSize)}>{label}</Text>
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
      .sendCommand({ op: "set-properties", deviceId: device.id, changes: patch })
      .catch(() => {});
  };
  const toggleOpenable = () => {
    if (!isOpenableKind(device.kind)) return;
    const openNow = (device.openPercent ?? (device.isOn ? 100 : 0)) > 0;
    const nextOpen = openNow ? 0 : 100;
    sendPatch({ openPercent: nextOpen, isOn: nextOpen > 0 });
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

  const meta = `${deviceMeta(device)}${stackMeta(device)}`;

  return (
    <Pressable
      style={cardStyle(cardPad, cardRadius, minHeight)}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
    >
      <View style={styles.topRow}>
        <View
          style={iconWrapStyle(iconWrapSize, iconWrapRadius, device.isOn)}
        >
          <DeviceIcon
            kind={device.kind}
            size={iconSize}
            color={theme.colors.text}
          />
        </View>

        <Pressable
          accessibilityLabel={`${device.isOn ? "Turn off" : "Turn on"} ${device.name}`}
          accessibilityState={{ selected: device.isOn }}
          onPress={(e) =>
            stop(e, () =>
              isOpenableKind(device.kind)
                ? toggleOpenable()
                : sendPatch({ isOn: !device.isOn }),
            )
          }
          style={powerStyle(powerSize, powerRadius, device.isOn)}
          hitSlop={6}
        >
          <Ionicons
            name="power"
            size={powerIconSize}
            color={theme.colors.text}
          />
        </Pressable>
      </View>

      <Text style={nameStyle(nameSize)} numberOfLines={1}>
        {device.name}
      </Text>
      <Text style={metaStyle(metaSize)} numberOfLines={1}>
        {meta}
      </Text>

      <View style={dividerStyle(dividerGap)} />

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
          <Text style={controlValueStyle(controlFont)}>
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
          <Text style={controlValueStyle(controlFont)}>
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
          <Text style={controlValueStyle(controlFont)}>
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
          <Text style={controlValueStyle(controlFont)}>
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
          <Text style={controlValueStyle(controlFont)}>
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
        <View style={controlsRowStyle(true)}>
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
        <View style={controlsRowStyle(true)}>
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
        <View style={controlsRowStyle(true)}>
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
        <View style={controlsRowStyle(true)}>
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
  controlsRowStart: { justifyContent: "flex-start" },
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
