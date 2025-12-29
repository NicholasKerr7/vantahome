import React, { forwardRef, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Pressable from "./Pressable";
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
        backgroundStyle={{ backgroundColor: "transparent" }}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView style={[styles.sheetWrap, { padding: gutter }]}>
          <View
            style={[
              styles.glass,
              {
                width: "100%",
                maxWidth: contentWidth,
                alignSelf: "center",
                borderRadius: glassRadius,
              },
            ]}
          >
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

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.title, { fontSize: titleSize }]}>
                        {device.name}
                      </Text>
                      <Text style={[styles.sub, { fontSize: subSize }]}>
                        {device.kind === "ac"
                          ? `${device.tempC ?? 22}°C • ${(device.mode ?? "cold").toUpperCase()}`
                          : device.kind === "light"
                            ? `Brightness ${device.brightness ?? 60}%`
                            : device.kind === "tv" || device.kind === "speaker"
                              ? `Volume ${device.volume ?? 20}`
                              : device.isOn
                                ? "Running"
                                : "Off"}
                      </Text>
                    </View>

                    <Pressable
                      onPress={onToggle}
                      style={[
                        styles.power,
                        {
                          width: powerSize,
                          height: powerSize,
                          borderRadius: powerRadius,
                        },
                        device.isOn && styles.powerOn,
                      ]}
                    >
                      <Ionicons
                        name="power"
                        size={powerIconSize}
                        color={theme.colors.text}
                      />
                    </Pressable>
                  </View>

                  <View
                    style={[
                      styles.section,
                      {
                        padding: sectionPad,
                        borderRadius: Math.round(sectionPad * 1.4),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sectionTitle,
                        { fontSize: sectionTitleSize },
                      ]}
                    >
                      Quick controls
                    </Text>
                    <DeviceCapabilityControls
                      device={device}
                      context="quick"
                      variant="dark"
                      layout="compact"
                      enableHaptics
                    />
                  </View>

                  <View
                    style={[
                      styles.section,
                      {
                        padding: sectionPad,
                        borderRadius: Math.round(sectionPad * 1.4),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sectionTitle,
                        { fontSize: sectionTitleSize },
                      ]}
                    >
                      Schedule
                    </Text>
                    <View
                      style={{ flexDirection: "row", gap: 10, marginTop: 10 }}
                    >
                      <Pressable
                        style={[
                          styles.chip,
                          { height: chipHeight, borderRadius: chipRadius },
                        ]}
                        onPress={() => {
                          haptic();
                          onQuickSchedule({ hour: 21, minute: 0 });
                        }}
                      >
                        <Text style={[styles.chipText, { fontSize: chipText }]}>
                          Tonight 9:00 PM
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[
                          styles.chip,
                          { height: chipHeight, borderRadius: chipRadius },
                        ]}
                        onPress={() => {
                          haptic();
                          onQuickSchedule({ hour: 7, minute: 0 });
                        }}
                      >
                        <Text style={[styles.chipText, { fontSize: chipText }]}>
                          Tomorrow 7:00 AM
                        </Text>
                      </Pressable>
                    </View>

                    <Pressable
                      style={[
                        styles.linkBtn,
                        {
                          marginTop: 12,
                          height: linkHeight,
                          borderRadius: Math.round(linkHeight * 0.4),
                        },
                      ]}
                      onPress={onGoToAutomations}
                    >
                      <Ionicons
                        name="flash"
                        size={Math.round((isTablet ? 18 : 16) * scale)}
                        color={theme.colors.text}
                      />
                      <Text
                        style={[styles.linkBtnText, { fontSize: chipText }]}
                      >
                        Create automation for this device
                      </Text>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                    <Pressable
                      style={[
                        styles.footerBtn,
                        {
                          height: footerHeight,
                          borderRadius: Math.round(footerHeight * 0.38),
                        },
                      ]}
                      onPress={onOpenDetails}
                    >
                      <Text
                        style={[styles.footerBtnText, { fontSize: chipText }]}
                      >
                        Open details
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.footerBtn,
                        {
                          height: footerHeight,
                          borderRadius: Math.round(footerHeight * 0.38),
                        },
                      ]}
                      onPress={onClose}
                    >
                      <Text
                        style={[styles.footerBtnText, { fontSize: chipText }]}
                      >
                        Close
                      </Text>
                    </Pressable>
                  </View>
                  {onDelete ? (
                    <Pressable
                      style={[
                        styles.footerBtn,
                        {
                          height: footerHeight,
                          borderRadius: Math.round(footerHeight * 0.38),
                        },
                        styles.deleteBtn,
                      ]}
                      onPress={() => {
                        onDelete();
                        onClose();
                      }}
                    >
                      <Text
                        style={[
                          styles.footerBtnText,
                          { color: "#ffebef", fontSize: chipText },
                        ]}
                      >
                        Delete device
                      </Text>
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
