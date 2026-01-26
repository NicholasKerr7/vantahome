import React, { forwardRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "./Pressable";
import SheetSection from "./SheetSection";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { theme } from "../theme/theme";
import { type Device } from "../store/useHomeStore";
import DeviceCapabilityControls from "./DeviceCapabilityControls";
import { useResponsive } from "../theme/layout";
import DeviceIcon from "./DeviceIcon";

/**
 * Long-press device sheet:
 * - Presents “quick controls” (sliders / buttons) without leaving the Room screen
 * - Adds simple schedule rules (prototype only)
 * - Links into the Automations tab / Device detail screen
 *
 * Styling:
 * - Bottom sheet background is transparent
 * - Content is a blurred “glass” container with a purple tint overlay
 */

type Props = {
  device?: Device;
  onClose: () => void;
  onOpenDetails: () => void;
  onGoToAutomations: () => void;
  onToggle: () => void;
  onQuickSchedule: (time: { hour: number; minute: number }) => void;
  onDelete?: () => void;
};

const DeviceBottomSheet = forwardRef<BottomSheetModal, Props>(
  function DeviceBottomSheet(
    {
      device,
      onClose,
      onOpenDetails,
      onGoToAutomations,
      onToggle,
      onQuickSchedule,
      onDelete,
    },
    ref,
  ) {
    const { contentWidth, gutter, isTablet, isLandscape, scale } =
      useResponsive(760);
    // Two-stage sheet: compact quick view, then expanded controls.
    const snapPoints = useMemo(
      () =>
        isTablet
          ? isLandscape
            ? ["40%", "72%"]
            : ["42%", "74%"]
          : ["38%", "68%"],
      [isTablet, isLandscape],
    );
    const glassRadius = Math.round((isTablet ? 30 : 26) * scale);
    const iconWrapSize = Math.round((isTablet ? 52 : 44) * scale);
    const iconWrapRadius = Math.round(iconWrapSize * 0.36);
    const iconSize = Math.round((isTablet ? 22 : 20) * scale);
    const powerSize = Math.round((isTablet ? 44 : 40) * scale);
    const powerRadius = Math.round(powerSize * 0.4);
    const powerIconSize = Math.round((isTablet ? 20 : 18) * scale);
    const titleSize = Math.round((isTablet ? 18 : 16) * scale);
    const subSize = Math.round((isTablet ? 13 : 12) * scale);
    const sectionPad = Math.round((isTablet ? 16 : 14) * scale);
    const sectionTitleSize = Math.round((isTablet ? 14 : 13) * scale);
    const chipHeight = Math.round((isTablet ? 44 : 40) * scale);
    const chipRadius = Math.round(chipHeight * 0.45);
    const chipText = Math.round((isTablet ? 13 : 12) * scale);
    const linkHeight = Math.round((isTablet ? 48 : 44) * scale);
    const footerHeight = Math.round((isTablet ? 50 : 46) * scale);
    const sheetWrapStyle: StyleProp<ViewStyle> = [
      styles.sheetWrap,
      { padding: gutter },
    ];
    const glassStyle: StyleProp<ViewStyle> = [
      styles.glass,
      {
        width: "100%",
        maxWidth: contentWidth,
        alignSelf: "center",
        borderRadius: glassRadius,
      },
    ];
    const iconWrapStyle = (on: boolean): StyleProp<ViewStyle> => [
      styles.iconWrap,
      {
        width: iconWrapSize,
        height: iconWrapSize,
        borderRadius: iconWrapRadius,
      },
      on && styles.iconWrapOn,
    ];
    const powerStyle = (on: boolean): StyleProp<ViewStyle> => [
      styles.power,
      {
        width: powerSize,
        height: powerSize,
        borderRadius: powerRadius,
      },
      on && styles.powerOn,
    ];
    const titleTextStyle: StyleProp<TextStyle> = [
      styles.title,
      { fontSize: titleSize },
    ];
    const subTextStyle: StyleProp<TextStyle> = [
      styles.sub,
      { fontSize: subSize },
    ];
    const sectionStyle: StyleProp<ViewStyle> = [
      styles.section,
      {
        padding: sectionPad,
        borderRadius: Math.round(sectionPad * 1.4),
      },
    ];
    const sectionTitleStyle: StyleProp<TextStyle> = [
      styles.sectionTitle,
      { fontSize: sectionTitleSize },
    ];
    const scheduleRowStyle: StyleProp<ViewStyle> = {
      flexDirection: "row",
      gap: 10,
      marginTop: 10,
    };
    const chipStyle: StyleProp<ViewStyle> = [
      styles.chip,
      { height: chipHeight, borderRadius: chipRadius },
    ];
    const chipTextStyle: StyleProp<TextStyle> = [
      styles.chipText,
      { fontSize: chipText },
    ];
    const linkButtonStyle: StyleProp<ViewStyle> = [
      styles.linkBtn,
      {
        marginTop: 12,
        height: linkHeight,
        borderRadius: Math.round(linkHeight * 0.4),
      },
    ];
    const linkButtonTextStyle: StyleProp<TextStyle> = [
      styles.linkBtnText,
      { fontSize: chipText },
    ];
    const footerRowStyle: StyleProp<ViewStyle> = {
      flexDirection: "row",
      gap: 10,
      marginTop: 6,
    };
    const footerButtonStyle: StyleProp<ViewStyle> = [
      styles.footerBtn,
      {
        height: footerHeight,
        borderRadius: Math.round(footerHeight * 0.38),
      },
    ];
    const footerButtonTextStyle: StyleProp<TextStyle> = [
      styles.footerBtnText,
      { fontSize: chipText },
    ];
    const deleteButtonStyle: StyleProp<ViewStyle> = [
      styles.footerBtn,
      {
        height: footerHeight,
        borderRadius: Math.round(footerHeight * 0.38),
      },
      styles.deleteBtn,
    ];
    const deleteButtonTextStyle: StyleProp<TextStyle> = [
      styles.footerBtnText,
      { color: "#ffebef", fontSize: chipText },
    ];
    const flex1Style: StyleProp<ViewStyle> = { flex: 1 };
    const transparentBackgroundStyle: ViewStyle = {
      backgroundColor: "transparent",
    };

    const haptic = () => Haptics.selectionAsync().catch(() => {});

    return (
      <BottomSheetModal
        ref={ref}
        index={0}
        snapPoints={snapPoints}
        backdropComponent={(p) => (
          <BottomSheetBackdrop
            {...p}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.35}
          />
        )}
        // We render our own blurred background container, so keep the sheet itself transparent.
        backgroundStyle={transparentBackgroundStyle}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView style={sheetWrapStyle}>
          <View style={glassStyle}>
            {/* Real blur glass */}
            <BlurView
              intensity={45}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            {/* Theme tint so the blur always feels “Vanta purple” */}
            <View style={styles.glassTint} />

            <View style={styles.content}>
              {!device ? null : (
                <>
                  <View style={styles.header}>
                    <View
                      style={iconWrapStyle(device.isOn)}
                    >
                      <DeviceIcon
                        kind={device.kind}
                        size={iconSize}
                        color={theme.colors.text}
                      />
                    </View>

                    <View style={flex1Style}>
                      <Text style={titleTextStyle}>{device.name}</Text>
                      <Text style={subTextStyle}>
                        {device.kind === "ac"
                          ? `${device.tempC ?? 22}°C • ${(device.mode ?? "cold").toUpperCase()}`
                          : device.kind === "light"
                            ? `Brightness ${device.brightness ?? 60}%`
                            : device.kind === "water-heater"
                              ? `${device.tempC ?? 52}°C • ${(
                                  device.heaterMode ?? "eco"
                                ).toUpperCase()}`
                            : device.kind === "tv" || device.kind === "speaker"
                              ? `Volume ${device.volume ?? 20}`
                              : device.isOn
                                ? "Running"
                                : "Off"}
                      </Text>
                    </View>

                    <Pressable
                      onPress={onToggle}
                      style={powerStyle(device.isOn)}
                    >
                      <Ionicons
                        name="power"
                        size={powerIconSize}
                        color={theme.colors.text}
                      />
                    </Pressable>
                  </View>

                  <SheetSection
                    title="Quick controls"
                    sectionStyle={sectionStyle}
                    titleStyle={sectionTitleStyle}
                  >
                    <DeviceCapabilityControls
                      device={device}
                      context="quick"
                      variant="dark"
                      layout="grid"
                      enableHaptics
                    />
                  </SheetSection>

                  <SheetSection
                    title="Schedule"
                    sectionStyle={sectionStyle}
                    titleStyle={sectionTitleStyle}
                  >
                    <View style={scheduleRowStyle}>
                      <Pressable
                        style={chipStyle}
                        onPress={() => {
                          haptic();
                          onQuickSchedule({ hour: 21, minute: 0 });
                        }}
                      >
                        <Text style={chipTextStyle}>
                          Tonight 9:00 PM
                        </Text>
                      </Pressable>

                      <Pressable
                        style={chipStyle}
                        onPress={() => {
                          haptic();
                          onQuickSchedule({ hour: 7, minute: 0 });
                        }}
                      >
                        <Text style={chipTextStyle}>
                          Tomorrow 7:00 AM
                        </Text>
                      </Pressable>
                    </View>

                    <Pressable
                      style={linkButtonStyle}
                      onPress={onGoToAutomations}
                    >
                      <Ionicons
                        name="flash"
                        size={Math.round((isTablet ? 18 : 16) * scale)}
                        color={theme.colors.text}
                      />
                      <Text style={linkButtonTextStyle}>
                        Create automation for this device
                      </Text>
                    </Pressable>
                  </SheetSection>

                  <View style={footerRowStyle}>
                    <Pressable
                      style={footerButtonStyle}
                      onPress={onOpenDetails}
                    >
                      <Text style={footerButtonTextStyle}>Open details</Text>
                    </Pressable>
                    <Pressable
                      style={footerButtonStyle}
                      onPress={onClose}
                    >
                      <Text style={footerButtonTextStyle}>Close</Text>
                    </Pressable>
                  </View>
                  {onDelete ? (
                    <Pressable
                      style={deleteButtonStyle}
                      onPress={() => {
                        onDelete();
                        onClose();
                      }}
                    >
                      <Text style={deleteButtonTextStyle}>Delete device</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

export default DeviceBottomSheet;

const styles = StyleSheet.create({
  handle: { backgroundColor: "rgba(255,255,255,0.35)", width: 46 },
  sheetWrap: { alignItems: "center" },
  glass: {
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(50, 10, 120, 0.35)",
  },
  content: { padding: 18, paddingBottom: 18 },

  header: { flexDirection: "row", alignItems: "center", gap: 12 },
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
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  powerOn: { backgroundColor: "rgba(180,107,255,0.22)" },

  title: { color: theme.colors.text, fontWeight: "900", fontSize: 16 },
  sub: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginTop: 6,
    fontSize: 12,
  },

  section: {
    marginTop: 16,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sectionTitle: { color: theme.colors.text, fontWeight: "900" },

  chip: {
    flex: 1,
    height: 40,
    borderRadius: 18,
    backgroundColor: "rgba(180,107,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { color: theme.colors.text, fontWeight: "900", fontSize: 12 },

  linkBtn: {
    height: 44,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  linkBtnText: { color: theme.colors.text, fontWeight: "900" },

  footerBtn: {
    flex: 1,
    height: 46,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  footerBtnText: { color: theme.colors.text, fontWeight: "900" },
  deleteBtn: {
    marginTop: 10,
    backgroundColor: "rgba(255, 99, 132, 0.18)",
    borderColor: "rgba(255,255,255,0.24)",
  },
});
