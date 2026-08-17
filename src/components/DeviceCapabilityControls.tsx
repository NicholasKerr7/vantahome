import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import Pressable from "./Pressable";
import RadialDial from "./RadialDial";
import { theme } from "../theme/theme";
import { deviceClient } from "../services/deviceClient";
import { useResponsive } from "../theme/layout";
import {
  getDeviceCapabilities,
  type ActionCapability,
  type CapabilityContext,
  type EnumCapability,
  type RangeCapability,
  type StatCapability,
  type ToggleCapability,
} from "../data/deviceCapabilities";
import type { Device } from "../store/useHomeStore";

type Variant = "dark" | "light";
type Layout = "compact" | "cards" | "grid";

type Props = {
  device: Device;
  context: CapabilityContext;
  variant?: Variant;
  layout?: Layout;
  enableHaptics?: boolean;
};

const roundToStep = (value: number, step: number) =>
  Math.round(value / step) * step;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const formatNumber = (value: number) =>
  Math.round(value) === value ? String(value) : value.toFixed(1);
const formatUnit = (unit?: string) => {
  if (!unit) return "";
  return unit === "C" ? "\u00b0C" : unit;
};
const joinUnit = (value: string, unit: string) => {
  const spacer = unit.length > 1 ? " " : "";
  return `${value}${spacer}${unit}`;
};
const formatClock = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const paletteFor = (variant: Variant) => {
  if (variant === "light") {
    return {
      text: "rgba(12,12,18,0.88)",
      subtext: "rgba(12,12,18,0.55)",
      cardBg: "rgba(255,255,255,0.16)",
      cardBorder: "rgba(0,0,0,0.05)",
      pillBg: "rgba(180,107,255,0.18)",
      pillBorder: "rgba(255,255,255,0.22)",
      pillActiveBg: "rgba(122,92,255,0.28)",
      pillActiveBorder: "rgba(122,92,255,0.4)",
      sliderMin: "rgba(122,92,255,0.9)",
      sliderMax: "rgba(12,12,18,0.12)",
      sliderThumb: "rgba(255,255,255,0.92)",
      statBg: "rgba(255,255,255,0.72)",
      statBorder: "rgba(0,0,0,0.05)",
    };
  }

  return {
    text: theme.colors.text,
    subtext: theme.colors.subtext,
    cardBg: "rgba(255,255,255,0.08)",
    cardBorder: "rgba(255,255,255,0.12)",
    pillBg: "rgba(180,107,255,0.18)",
    pillBorder: "rgba(255,255,255,0.16)",
    pillActiveBg: "rgba(180,107,255,0.35)",
    pillActiveBorder: "rgba(255,255,255,0.25)",
    sliderMin: "rgba(180,107,255,0.85)",
    sliderMax: "rgba(255,255,255,0.12)",
    sliderThumb: "rgba(255,255,255,0.85)",
    statBg: "rgba(255,255,255,0.06)",
    statBorder: "rgba(255,255,255,0.12)",
  };
};

const createStyles = (
  palette: ReturnType<typeof paletteFor>,
  scale: number,
  isTablet: boolean,
) =>
  StyleSheet.create({
    group: { marginTop: Math.round(12 * scale) },
    groupTitle: {
      color: palette.subtext,
      fontWeight: "800",
      marginBottom: Math.round(8 * scale),
    },
    gridTitle: {
      textTransform: "uppercase",
      letterSpacing: 0.6,
      fontSize: Math.round(10 * scale),
    },
    card: {
      marginTop: Math.round(12 * scale),
      padding: Math.round(12 * scale),
      borderRadius: Math.round(18 * scale),
      backgroundColor: palette.cardBg,
      borderWidth: 1,
      borderColor: palette.cardBorder,
    },
    gridCard: {
      marginTop: 0,
      minWidth: 0,
      padding: Math.round(11 * scale),
    },
    dialWrap: {
      marginTop: Math.round(6 * scale),
      alignItems: "center",
      justifyContent: "center",
    },
    sliderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Math.round(12 * scale),
      marginTop: Math.round(8 * scale),
    },
    valueText: {
      width: Math.round(120 * scale),
      color: palette.text,
      fontWeight: "900",
    },
    controlLabel: {
      color: palette.subtext,
      fontWeight: "800",
      fontSize: Math.round(12 * scale),
      marginBottom: Math.round(6 * scale),
    },
    toggleRow: {
      flexDirection: "row",
      gap: Math.round(10 * scale),
      flexWrap: "wrap",
    },
    pillBtn: {
      paddingHorizontal: Math.round(14 * scale),
      height: Math.round((isTablet ? 44 : 40) * scale),
      borderRadius: Math.round(16 * scale),
      backgroundColor: palette.pillBg,
      borderWidth: 1,
      borderColor: palette.pillBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    pillBtnActive: {
      backgroundColor: palette.pillActiveBg,
      borderColor: palette.pillActiveBorder,
    },
    pillBtnText: {
      color: palette.text,
      fontWeight: "900",
      fontSize: Math.round(12 * scale),
    },
    pillBtnTextActive: { color: "#fff" },
    statRow: {
      marginTop: Math.round(8 * scale),
      paddingVertical: Math.round(8 * scale),
      paddingHorizontal: Math.round(12 * scale),
      borderRadius: Math.round(14 * scale),
      borderWidth: 1,
      borderColor: palette.statBorder,
      backgroundColor: palette.statBg,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    statLabel: {
      color: palette.subtext,
      fontWeight: "700",
      fontSize: Math.round(12 * scale),
    },
    statValue: {
      color: palette.text,
      fontWeight: "900",
      fontSize: Math.round(12 * scale),
    },
    emptyHint: {
      color: palette.subtext,
      fontWeight: "700",
      fontSize: Math.round(12 * scale),
      marginTop: Math.round(10 * scale),
    },
  });

function DeviceCapabilityControls({
  device,
  context,
  variant = "dark",
  layout = "compact",
  enableHaptics = false,
}: Props) {
  const { isTablet, isLandscape, scale, width } = useResponsive();
  const palette = useMemo(() => paletteFor(variant), [variant]);
  const styles = useMemo(
    () => createStyles(palette, scale, isTablet),
    [palette, scale, isTablet],
  );
  const capabilities = useMemo(
    () => getDeviceCapabilities(device, context),
    [device, context],
  );
  const dialSize = Math.round(
    (isTablet ? (isLandscape ? 280 : 300) : 240) * scale,
  );
  const gridColumns = layout === "grid" ? (width < 360 ? 1 : 2) : 1;
  const gridGap = Math.round(12 * scale);
  const isGridLayout = layout === "grid";
  const gridRowStyle: StyleProp<ViewStyle> = isGridLayout
    ? { flexDirection: "row", gap: gridGap }
    : undefined;
  const gridColumnStyle: StyleProp<ViewStyle> = isGridLayout
    ? { flex: 1, minWidth: 0, gap: gridGap }
    : undefined;
  const gridColumnLeftStyle: StyleProp<ViewStyle> = isGridLayout
    ? [gridColumnStyle, { flexGrow: 4 }]
    : undefined;
  const gridColumnRightStyle: StyleProp<ViewStyle> = isGridLayout
    ? [gridColumnStyle, { flexGrow: 6 }]
    : undefined;
  const gridCardStyle: StyleProp<ViewStyle> =
    isGridLayout
      ? [
          styles.card,
          styles.gridCard,
          {
            flexBasis: gridColumns === 1 ? "100%" : "48%",
            flexGrow: 1,
          },
        ]
      : styles.card;
  const gridTitleStyle: StyleProp<TextStyle> =
    isGridLayout ? [styles.groupTitle, styles.gridTitle] : styles.groupTitle;
  const gridToggleGridStyle: StyleProp<ViewStyle> = isGridLayout
    ? { gap: gridGap }
    : undefined;
  const gridToggleRowStyle: StyleProp<ViewStyle> = isGridLayout
    ? { flexDirection: "row", gap: gridGap }
    : styles.toggleRow;
  const gridToggleCellStyle: StyleProp<ViewStyle> = isGridLayout
    ? { flex: 1, minWidth: 0 }
    : undefined;

  const ranges = capabilities.filter(
    (cap): cap is RangeCapability => cap.type === "range",
  );
  const toggles = capabilities.filter(
    (cap): cap is ToggleCapability => cap.type === "toggle",
  );
  const enums = capabilities.filter(
    (cap): cap is EnumCapability => cap.type === "enum",
  );
  const actions = capabilities.filter(
    (cap): cap is ActionCapability => cap.type === "action",
  );
  const stats = capabilities.filter(
    (cap): cap is StatCapability => cap.type === "stat",
  );

  const haptic = () => {
    if (enableHaptics) {
      Haptics.selectionAsync().catch(() => {});
    }
  };
  const sliderStyle: StyleProp<ViewStyle> = { flex: 1, height: 40 };
  const toggleGroupStyle: StyleProp<ViewStyle> = { marginTop: 8 };
  const pillButtonStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.pillBtn,
    active && styles.pillBtnActive,
  ];
  const pillButtonTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.pillBtnText,
    active && styles.pillBtnTextActive,
  ];

  const sendPatch = (patch: Partial<Device>) => {
    deviceClient
      .sendCommand({ op: "set-properties", deviceId: device.id, changes: patch })
      .catch(() => {});
  };

  const formatRangeValue = (cap: RangeCapability, value: number) => {
    if (cap.unit === "sec") return formatClock(value);
    const unit = formatUnit(cap.unit);
    const base = formatNumber(value);
    return unit ? joinUnit(base, unit) : base;
  };

  const formatDialTick = (cap: RangeCapability, value: number) => {
    if (cap.unit === "sec") {
      const mins = Math.round(value / 60);
      return mins > 0 ? `${mins}m` : "0";
    }
    if (cap.unit === "C") return `${formatNumber(value)}\u00b0`;
    return formatNumber(value);
  };

  const applyRangeValue = (cap: RangeCapability, rawValue: number) => {
    // Respect device-specific steps and auto-on/off behavior for ranges.
    const step = cap.step ?? 1;
    const next = clamp(roundToStep(rawValue, step), cap.min, cap.max);
    const patch: Partial<Device> = { [cap.field]: next } as Partial<Device>;
    if (cap.autoOn) patch.isOn = true;
    if (cap.autoOffWhenZero && next <= 0) patch.isOn = false;
    sendPatch(patch);
  };

  const shouldUseDial = (cap: RangeCapability) =>
    cap.control === "dial" && context === "detail" && layout === "cards";

  const formatStatValue = (cap: StatCapability, value: unknown) => {
    if (cap.format) return cap.format(value as string | number | boolean);
    if (typeof value === "number" && cap.unit) {
      return joinUnit(formatNumber(value), formatUnit(cap.unit));
    }
    if (typeof value === "number") return formatNumber(value);
    if (typeof value === "boolean") return value ? "On" : "Off";
    return value ? String(value) : "--";
  };

  const renderRange = (cap: RangeCapability) => {
    const raw = device[cap.field];
    const current =
      typeof raw === "number" ? clamp(raw, cap.min, cap.max) : cap.min;
    if (shouldUseDial(cap)) {
      return (
        <View key={cap.id} style={styles.dialWrap}>
          <RadialDial
            size={dialSize}
            value={current}
            min={cap.min}
            max={cap.max}
            tickValues={cap.dialTicks}
            dimmed={!device.isOn}
            centerLabel={cap.label}
            centerIcon={null}
            formatValue={(value) => formatRangeValue(cap, value)}
            formatCenterValue={(value) => formatRangeValue(cap, value)}
            formatTick={(value) => formatDialTick(cap, value)}
            onChange={(value) => applyRangeValue(cap, value)}
          />
        </View>
      );
    }

    const label = `${cap.label} ${formatRangeValue(cap, current)}`;
    return (
      <View key={cap.id} style={styles.sliderRow}>
        <Text style={styles.valueText}>{label}</Text>
        <Slider
          style={sliderStyle}
          minimumValue={cap.min}
          maximumValue={cap.max}
          value={current}
          minimumTrackTintColor={palette.sliderMin}
          maximumTrackTintColor={palette.sliderMax}
          thumbTintColor={palette.sliderThumb}
          onValueChange={(value) => {
            haptic();
            applyRangeValue(cap, value);
          }}
        />
      </View>
    );
  };

  const renderPillRows = (nodes: React.ReactElement[]) => {
    if (!isGridLayout) {
      return <View style={styles.toggleRow}>{nodes}</View>;
    }
    const rows: Array<[React.ReactElement, React.ReactElement | null]> = [];
    for (let index = 0; index < nodes.length; index += 2) {
      rows.push([nodes[index], nodes[index + 1] ?? null]);
    }
    return (
      <View style={gridToggleGridStyle}>
        {rows.map((row, rowIndex) => (
          <View key={`grid-row-${rowIndex}`} style={gridToggleRowStyle}>
            <View style={gridToggleCellStyle}>{row[0]}</View>
            <View style={gridToggleCellStyle}>{row[1] ?? null}</View>
          </View>
        ))}
      </View>
    );
  };

  const renderToggle = (cap: ToggleCapability) => {
    const current = Boolean(device[cap.field]);
    const toggleNodes = [
      <Pressable
        key={`${cap.id}-on`}
        style={pillButtonStyle(current)}
        onPress={() => sendPatch({ [cap.field]: true } as Partial<Device>)}
      >
        <Text style={pillButtonTextStyle(current)}>
          {cap.onLabel ?? "On"}
        </Text>
      </Pressable>,
      <Pressable
        key={`${cap.id}-off`}
        style={pillButtonStyle(!current)}
        onPress={() => sendPatch({ [cap.field]: false } as Partial<Device>)}
      >
        <Text style={pillButtonTextStyle(!current)}>
          {cap.offLabel ?? "Off"}
        </Text>
      </Pressable>,
    ];
    return (
      <View key={cap.id} style={toggleGroupStyle}>
        <Text style={styles.controlLabel}>{cap.label}</Text>
        {renderPillRows(toggleNodes)}
      </View>
    );
  };

  const renderEnum = (cap: EnumCapability) => {
    const current = device[cap.field];
    const optionNodes = cap.options.map((opt) => {
      const active = current === opt.value;
      return (
        <Pressable
          key={`${cap.id}-${opt.value}`}
          style={pillButtonStyle(active)}
          onPress={() =>
            sendPatch({ [cap.field]: opt.value } as Partial<Device>)
          }
        >
          <Text style={pillButtonTextStyle(active)}>{opt.label}</Text>
        </Pressable>
      );
    });
    return (
      <View key={cap.id} style={toggleGroupStyle}>
        <Text style={styles.controlLabel}>{cap.label}</Text>
        {renderPillRows(optionNodes)}
      </View>
    );
  };

  const renderActions = () => {
    if (!actions.length) return null;
    const actionNodes = actions.map((cap) => (
      <Pressable
        key={cap.id}
        style={styles.pillBtn}
        onPress={() => sendPatch(cap.patch)}
      >
        <Text style={styles.pillBtnText}>{cap.label}</Text>
      </Pressable>
    ));
    return (
      <View>
        {renderPillRows(actionNodes)}
      </View>
    );
  };

  const renderStats = () => {
    if (!stats.length) return null;
    return stats.map((cap) => {
      const value = device[cap.field];
      return (
        <View key={cap.id} style={styles.statRow}>
          <Text style={styles.statLabel}>{cap.label}</Text>
          <Text style={styles.statValue}>{formatStatValue(cap, value)}</Text>
        </View>
      );
    });
  };

  const renderGroup = (title: string, content: React.ReactNode) => {
    if (!content || React.Children.count(content) === 0) return null;
    if (layout === "cards" || layout === "grid") {
      return (
        <View style={layout === "grid" ? gridCardStyle : styles.card}>
          <Text style={layout === "grid" ? gridTitleStyle : styles.groupTitle}>
            {title}
          </Text>
          {content}
        </View>
      );
    }
    return <View style={styles.group}>{content}</View>;
  };

  if (!capabilities.length) {
    return <Text style={styles.emptyHint}>No controls available.</Text>;
  }

  if (isGridLayout) {
    return (
      <View style={gridRowStyle}>
        <View style={gridColumnLeftStyle}>
          {renderGroup("Controls", ranges.map(renderRange))}
          {renderGroup("Status", renderStats())}
        </View>
        <View style={gridColumnRightStyle}>
          {renderGroup("Toggles", toggles.map(renderToggle))}
          {renderGroup("Modes", enums.map(renderEnum))}
          {renderGroup("Actions", renderActions())}
        </View>
      </View>
    );
  }

  return (
    <View>
      {renderGroup("Controls", ranges.map(renderRange))}
      {renderGroup("Toggles", toggles.map(renderToggle))}
      {renderGroup("Modes", enums.map(renderEnum))}
      {renderGroup("Actions", renderActions())}
      {renderGroup("Status", renderStats())}
    </View>
  );
}

export default React.memo(DeviceCapabilityControls);
