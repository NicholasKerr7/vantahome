import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TextInput,
  ScrollView,
} from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Slider from "@react-native-community/slider";
import { theme } from "../theme/theme";
import {
  AC_TEMP_MAX_C,
  AC_TEMP_MIN_C,
  useHomeStore,
} from "../store/useHomeStore";
import BackgroundLines from "../components/BackgroundLines";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useResponsive } from "../theme/layout";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ScreenFrame from "../components/ScreenFrame";
import ScreenSectionLayout from "../components/ScreenSectionLayout";
import HeaderPill from "../components/HeaderPill";
import ModalCard from "../components/ModalCard";
import ModalActionRow from "../components/ModalActionRow";
import ModalField from "../components/ModalField";

export default function AutomationsScreen() {
  const { width, contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(920);
  const minSize = Math.min(width, contentWidth);
  const isCompactPhone = !isTablet && minSize < 360;
  const isWide = isTablet && isLandscape;
  const isPortrait = !isLandscape;
  const frameEnabled = isPortrait || isWide;
  const titleSize = Math.round(
    (isTablet ? 30 : isCompactPhone ? 22 : 24) * scale,
  );
  const subtitleSize = Math.round(
    (isTablet ? 15 : isCompactPhone ? 11 : 12) * scale,
  );
  const badgeHeight = Math.round(
    (isTablet ? 30 : isCompactPhone ? 24 : 26) * scale,
  );
  const badgeText = Math.round(
    (isTablet ? 12 : isCompactPhone ? 10 : 11) * scale,
  );
  const actionHeight = Math.round(
    (isTablet ? 34 : isCompactPhone ? 28 : 30) * scale,
  );
  const actionText = Math.round(
    (isTablet ? 13 : isCompactPhone ? 11 : 12) * scale,
  );
  const sectionTitleSize = Math.round(
    (isTablet ? 18 : isCompactPhone ? 14 : 15) * scale,
  );
  const sectionSubSize = Math.round(
    (isTablet ? 13 : isCompactPhone ? 11 : 12) * scale,
  );
  const cardPad = Math.round(
    (isTablet ? 18 : isCompactPhone ? 12 : 14) * scale,
  );
  const cardRadius = Math.round(
    (isTablet ? 24 : isCompactPhone ? 18 : 20) * scale,
  );
  const sectionPad = Math.round(
    (isTablet ? 20 : isCompactPhone ? 12 : 14) * scale,
  );
  const sectionRadius = Math.round(
    (isTablet ? 26 : isCompactPhone ? 18 : 20) * scale,
  );
  const framePad = Math.round(
    (isTablet ? 14 : isCompactPhone ? 8 : 10) * scale,
  );
  const frameRadius = Math.round(
    (isTablet ? 30 : isCompactPhone ? 22 : 24) * scale,
  );
  const outerGutter = isWide
    ? Math.round(gutter * 0.6)
    : isTablet
      ? gutter
      : gutter;
  const innerGutter = isWide
    ? Math.round(gutter * 0.75)
    : isTablet
      ? gutter
      : Math.round(gutter * 0.6);
  const cardTitleSize = Math.round(
    (isTablet ? 16 : isCompactPhone ? 12 : 13) * scale,
  );
  const cardSubSize = Math.round(
    (isTablet ? 13 : isCompactPhone ? 10 : 11) * scale,
  );
  const cardGap = Math.round(
    (isTablet ? 16 : isCompactPhone ? 8 : 10) * scale,
  );
  const sectionMinWidth = Math.round(
    (isTablet ? 380 : isCompactPhone ? 260 : 280) * scale,
  );
  const cardMinWidth = Math.round(
    (isTablet ? 320 : isCompactPhone ? 220 : 240) * scale,
  );
  const dividerPad = Math.round(
    (isTablet ? 16 : isCompactPhone ? 10 : 12) * scale,
  );
  const scrollBottomPad = Math.round(cardGap * 1.2);
  const modalPad = Math.round(
    (isTablet ? 20 : isCompactPhone ? 14 : 16) * scale,
  );
  const modalRadius = Math.round(
    (isTablet ? 24 : isCompactPhone ? 18 : 20) * scale,
  );
  const modalTitleSize = Math.round(
    (isTablet ? 20 : isCompactPhone ? 16 : 17) * scale,
  );
  const modalSubSize = Math.round(
    (isTablet ? 14 : isCompactPhone ? 11 : 12) * scale,
  );
  const modalLabelSize = Math.round(
    (isTablet ? 13 : isCompactPhone ? 11 : 12) * scale,
  );
  const modalInputHeight = Math.round(
    (isTablet ? 48 : isCompactPhone ? 40 : 42) * scale,
  );
  const modalBtnHeight = Math.round(
    (isTablet ? 46 : isCompactPhone ? 40 : 42) * scale,
  );
  const insets = useSafeAreaInsets();
  const tabInset = isTablet ? (isLandscape ? 28 : 24) : gutter;
  const tabBarInset = insets.bottom > 0 ? insets.bottom + 8 : tabInset;
  const tabBarHeight = Math.round(
    (isTablet ? (isLandscape ? 74 : 72) : isCompactPhone ? 62 : 66) * scale,
  );
  const tabBarGap = Math.round((isTablet ? 12 : 8) * scale);
  const tabBarPad = tabBarInset + tabBarHeight + tabBarGap;
  const frameWidth = isWide
    ? undefined
    : Math.max(0, contentWidth - outerGutter * 2);
  const frameInnerWidth = Math.max(
    0,
    frameWidth - (frameEnabled ? framePad * 2 : 0),
  );
  const availableWidth = isTablet
    ? width - outerGutter * 2 - innerGutter * 2
    : Math.max(0, frameInnerWidth - innerGutter * 2);
  const sectionColumns = isWide
    ? Math.max(
        1,
        Math.min(
          2,
          Math.floor(
            (availableWidth + cardGap) / (sectionMinWidth + cardGap),
          ),
        ),
      )
    : 1;
  const isSplit = sectionColumns > 1;
  const sectionWidth = isSplit
    ? Math.max(0, (availableWidth - cardGap) / 2)
    : availableWidth;
  const sectionContentWidth = Math.max(0, sectionWidth - sectionPad * 2);
  const cardColumns = Math.max(
    1,
    Math.min(
      2,
      Math.floor(
        (sectionContentWidth + cardGap) / (cardMinWidth + cardGap),
      ),
    ),
  );
  const cardWidthValue =
    cardColumns > 1
      ? Math.max(
          0,
          (sectionContentWidth - cardGap * (cardColumns - 1)) / cardColumns,
        )
      : "100%";
  const emptyCardWidth = cardColumns > 1 ? sectionContentWidth : "100%";
  const rules = useHomeStore((s) => s.rules);
  const flows = useHomeStore((s) => s.flows);
  const toggleRule = useHomeStore((s) => s.toggleRule);
  const addRule = useHomeStore((s) => s.addRule);
  const updateRule = useHomeStore((s) => s.updateRule);
  const removeRule = useHomeStore((s) => s.removeRule);
  const toggleFlow = useHomeStore((s) => s.toggleFlow);
  const devices = useHomeStore((s) => s.devices);
  const navigation = useNavigation<any>();

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [hour, setHour] = useState("21");
  const [minute, setMinute] = useState("00");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(
    devices[0]?.id ?? null,
  );
  const [toggleOn, setToggleOn] = useState(true);
  const [temp, setTemp] = useState(22);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) ?? devices[0],
    [devices, selectedDeviceId],
  );
  const isAC = selectedDevice?.kind === "ac";

  const canCreate =
    selectedDevice && /^\d{1,2}$/.test(hour) && /^\d{1,2}$/.test(minute);
  const isEditing = modalMode === "edit";
  const editingRule = rules.find((r) => r.id === editingId);
  const flowSummary = (count: number, label: string) =>
    `${count} ${label}${count === 1 ? "" : "s"}`;
  const headerSummary = `${flowSummary(flows.length, "Flow")} / ${flowSummary(rules.length, "Schedule")}`;
  const contentStyle: StyleProp<ViewStyle> = [
    styles.content,
    {
      paddingHorizontal: isWide ? outerGutter : outerGutter,
      paddingTop: topPad,
      paddingBottom: tabBarPad,
    },
  ];
  const headerWrapStyle: StyleProp<ViewStyle> = {
    paddingHorizontal: innerGutter,
  };
  const headerStyle: StyleProp<ViewStyle> = [
    styles.header,
    isCompactPhone && styles.headerCompact,
  ];
  const headerTitleStyle: StyleProp<TextStyle> = [
    styles.h1,
    { fontSize: titleSize },
  ];
  const headerSubtitleStyle: StyleProp<TextStyle> = [
    styles.p,
    { fontSize: subtitleSize },
  ];
  const headerPillStyle: StyleProp<ViewStyle> = [
    styles.headerPill,
    { height: badgeHeight, borderRadius: Math.round(badgeHeight / 2) },
    isCompactPhone && { maxWidth: "100%" },
  ];
  const headerPillTextStyle: StyleProp<TextStyle> = [
    styles.headerPillText,
    { fontSize: badgeText, flexShrink: 1 },
  ];
  const headerDividerWrapStyle: StyleProp<ViewStyle> = {
    paddingVertical: dividerPad,
  };
  const sectionsScrollContentStyle: StyleProp<ViewStyle> = {
    paddingBottom: scrollBottomPad,
    paddingHorizontal: innerGutter,
  };
  const sectionsGridLandscapeStyle: StyleProp<ViewStyle> = [
    styles.sectionsGridLandscape,
    { gap: cardGap, width: "100%" },
  ];
  const sectionsColumnStyle: StyleProp<ViewStyle> = [
    styles.sectionsColumn,
    { gap: cardGap },
  ];
  const sectionsStackStyle: StyleProp<ViewStyle> = [
    styles.sectionsStack,
    { gap: cardGap },
  ];
  const sectionCardStyle: StyleProp<ViewStyle> = [
    styles.sectionCard,
    { padding: sectionPad, borderRadius: sectionRadius, width: "100%" },
  ];
  const sectionTitleStyle: StyleProp<TextStyle> = [
    styles.sectionTitle,
    { fontSize: sectionTitleSize },
  ];
  const sectionSubStyle: StyleProp<TextStyle> = [
    styles.sectionSub,
    { fontSize: sectionSubSize },
  ];
  const sectionHeaderStyle: StyleProp<ViewStyle> = [
    styles.sectionHeader,
    isSplit && styles.sectionHeaderWrap,
    isCompactPhone && styles.sectionHeaderCompact,
  ];
  const sectionActionsStyle: StyleProp<ViewStyle> = [
    styles.sectionActions,
    isSplit && styles.sectionActionsFull,
    isCompactPhone && styles.sectionActionsCompact,
  ];
  const sectionBadgeStyle: StyleProp<ViewStyle> = [
    styles.sectionBadge,
    { height: badgeHeight, borderRadius: Math.round(badgeHeight / 2) },
  ];
  const sectionBadgeTextStyle: StyleProp<TextStyle> = [
    styles.sectionBadgeText,
    { fontSize: badgeText },
  ];
  const sectionActionStyle: StyleProp<ViewStyle> = [
    styles.sectionAction,
    { height: actionHeight, borderRadius: Math.round(actionHeight / 2) },
    isSplit && styles.sectionActionWide,
    isCompactPhone && styles.sectionActionCompact,
  ];
  const sectionActionTextStyle: StyleProp<TextStyle> = [
    styles.sectionActionText,
    { fontSize: actionText },
  ];
  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    { padding: cardPad, borderRadius: cardRadius, width: cardWidthValue },
  ];
  const emptyCardStyle: StyleProp<ViewStyle> = [
    styles.emptyCard,
    { padding: cardPad, borderRadius: cardRadius, width: emptyCardWidth },
  ];
  const gridStyle: StyleProp<ViewStyle> = [
    styles.grid,
    cardColumns > 1 && styles.gridMulti,
    { gap: cardGap, width: "100%" },
  ];
  const cardBodyStyle: ViewStyle = { flex: 1 };
  const cardNameStyle: StyleProp<TextStyle> = [
    styles.name,
    { fontSize: cardTitleSize },
  ];
  const cardSubStyle: StyleProp<TextStyle> = [
    styles.sub,
    { fontSize: cardSubSize },
  ];
  const switchScaleStyle: ViewStyle = {
    transform: [{ scale: isTablet ? 1.05 : isCompactPhone ? 0.94 : 0.98 }],
  };
  const modalCardStyle: StyleProp<ViewStyle> = [
    styles.modalCard,
    {
      padding: modalPad,
      borderRadius: modalRadius,
      maxWidth: isTablet ? 560 : undefined,
      width: isTablet ? Math.min(contentWidth - gutter * 2, 560) : undefined,
      alignSelf: isTablet ? "center" : "stretch",
    },
  ];
  const modalTitleStyle: StyleProp<TextStyle> = [
    styles.modalTitle,
    { fontSize: modalTitleSize },
  ];
  const modalSubStyle: StyleProp<TextStyle> = [
    styles.modalSub,
    { fontSize: modalSubSize },
  ];
  const modalLabelStyle: StyleProp<TextStyle> = [
    styles.modalLabel,
    { fontSize: modalLabelSize },
  ];
  const modalInputStyle: StyleProp<ViewStyle> = [
    styles.modalInput,
    {
      height: modalInputHeight,
      borderRadius: Math.round(modalInputHeight * 0.28),
    },
  ];
  const timeInputStyle: StyleProp<ViewStyle> = [
    styles.timeInput,
    {
      width: isCompactPhone ? 52 : 60,
      height: modalInputHeight,
      borderRadius: Math.round(modalInputHeight * 0.28),
    },
  ];
  const sliderStyle: ViewStyle = { flex: 1 };
  const sliderValueStyle: StyleProp<TextStyle> = [
    styles.sliderValue,
    { fontSize: modalLabelSize, width: isCompactPhone ? 52 : 64 },
  ];
  const modalGhostStyle: StyleProp<ViewStyle> = [
    styles.modalGhost,
    {
      height: modalBtnHeight,
      borderRadius: Math.round(modalBtnHeight * 0.28),
    },
  ];
  const modalGhostTextStyle: StyleProp<TextStyle> = [
    styles.modalGhostText,
    { fontSize: modalLabelSize },
  ];
  const modalPrimaryStyle: StyleProp<ViewStyle> = [
    styles.modalPrimary,
    {
      height: modalBtnHeight,
      borderRadius: Math.round(modalBtnHeight * 0.28),
    },
    !canCreate && styles.modalPrimaryDisabled,
  ];
  const modalPrimaryTextStyle: StyleProp<TextStyle> = [
    styles.modalPrimaryText,
    { fontSize: modalLabelSize },
  ];
  const modalDeleteStyle: StyleProp<ViewStyle> = [
    styles.modalDelete,
    {
      height: modalBtnHeight,
      borderRadius: Math.round(modalBtnHeight * 0.28),
    },
  ];
  const modalDeleteTextStyle: StyleProp<TextStyle> = [
    styles.modalDeleteText,
    { fontSize: modalLabelSize },
  ];
  const devicePillStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.devicePill,
    {
      height: modalInputHeight,
      borderRadius: Math.round(modalInputHeight / 2),
    },
    active && styles.devicePillActive,
  ];
  const devicePillTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.devicePillText,
    { fontSize: modalLabelSize },
    active && styles.devicePillTextActive,
  ];
  const toggleBtnStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.toggleBtn,
    {
      height: modalInputHeight,
      borderRadius: Math.round(modalInputHeight * 0.28),
    },
    active && styles.toggleBtnActive,
  ];
  const toggleTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.toggleText,
    { fontSize: modalLabelSize },
    active && styles.toggleTextActive,
  ];

  const openAdd = () => {
    setEditingId(null);
    setRuleName("");
    setHour("21");
    setMinute("00");
    setSelectedDeviceId(devices[0]?.id ?? null);
    setToggleOn(true);
    setTemp(22);
    setModalMode("add");
  };

  const openEdit = (ruleId: string) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;
    setEditingId(rule.id);
    setRuleName(rule.name);
    setHour(String(rule.trigger.hour).padStart(2, "0"));
    setMinute(String(rule.trigger.minute).padStart(2, "0"));
    setSelectedDeviceId(rule.action.deviceId);
    if (rule.action.type === "set-ac") {
      setTemp(rule.action.tempC);
    } else {
      setToggleOn(rule.action.on);
    }
    setModalMode("edit");
  };

  const handleSubmit = () => {
    if (!selectedDevice) return;
    const h = Math.max(0, Math.min(23, parseInt(hour, 10)));
    const m = Math.max(0, Math.min(59, parseInt(minute, 10)));
    const name =
      ruleName.trim() ||
      `${selectedDevice.name} @ ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    const action =
      selectedDevice.kind === "ac"
        ? {
            type: "set-ac" as const,
            deviceId: selectedDevice.id,
            tempC: Math.max(AC_TEMP_MIN_C, Math.min(AC_TEMP_MAX_C, temp)),
            mode: selectedDevice.mode ?? "cold",
          }
        : {
            type: "toggle" as const,
            deviceId: selectedDevice.id,
            on: toggleOn,
          };

    if (isEditing && editingId) {
      updateRule(editingId, {
        name,
        trigger: { type: "time", hour: h, minute: m },
        action,
        enabled: editingRule?.enabled ?? true,
      });
    } else {
      addRule({
        name,
        enabled: true,
        trigger: { type: "time", hour: h, minute: m },
        action,
      });
    }

    setRuleName("");
    setModalMode(null);
  };

  const flowsList = (
    <View style={gridStyle}>
      {flows.length === 0 ? (
        <View style={emptyCardStyle}>
          <Text style={styles.emptyTitle}>No flows yet</Text>
          <Text style={styles.emptySub}>
            Create a flow to chain triggers and actions.
          </Text>
        </View>
      ) : (
        flows.map((flow) => (
          <Pressable
            key={flow.id}
            style={cardStyle}
            onPress={() =>
              navigation.navigate("AutomationBuilder", {
                flowId: flow.id,
              })
            }
          >
            <View style={cardBodyStyle}>
              <Text style={cardNameStyle}>{flow.name}</Text>
              <Text style={cardSubStyle}>
                {flowSummary(flow.triggers.length, "trigger")} •{" "}
                {flowSummary(flow.conditions.length, "condition")} •{" "}
                {flowSummary(flow.actions.length, "action")}
              </Text>
            </View>
            <Switch
              value={flow.enabled}
              onValueChange={() => toggleFlow(flow.id)}
              trackColor={{
                false: "rgba(255,255,255,0.18)",
                true: "rgba(180,107,255,0.55)",
              }}
              thumbColor={flow.enabled ? "#FFFFFF" : "rgba(255,255,255,0.9)"}
              style={switchScaleStyle}
            />
          </Pressable>
        ))
      )}
    </View>
  );

  const schedulesList = (
    <View style={gridStyle}>
      {rules.map((r) => (
        <Pressable
          key={r.id}
          style={cardStyle}
          onPress={() => openEdit(r.id)}
        >
          <View style={cardBodyStyle}>
            <Text style={cardNameStyle}>{r.name}</Text>
            <Text style={cardSubStyle}>
              Trigger: {String(r.trigger.hour).padStart(2, "0")}:
              {String(r.trigger.minute).padStart(2, "0")} • Action:{" "}
              {r.action.type === "set-ac"
                ? `AC → ${r.action.tempC}°C`
                : `Toggle → ${r.action.on ? "ON" : "OFF"}`}
            </Text>
          </View>
          <Switch
            value={r.enabled}
            onValueChange={() => toggleRule(r.id)}
            trackColor={{
              false: "rgba(255,255,255,0.18)",
              true: "rgba(180,107,255,0.55)",
            }}
            thumbColor={r.enabled ? "#FFFFFF" : "rgba(255,255,255,0.9)"}
            style={switchScaleStyle}
          />
        </Pressable>
      ))}
    </View>
  );
  const flowsPanel = (
    <View style={sectionCardStyle}>
      <View style={sectionHeaderStyle}>
        <View>
          <Text style={sectionTitleStyle}>Flows</Text>
          <Text style={sectionSubStyle}>Triggers → Conditions → Actions</Text>
        </View>
        <View style={sectionActionsStyle}>
          <View style={sectionBadgeStyle}>
            <Text style={sectionBadgeTextStyle}>
              {flowSummary(flows.length, "Flow")}
            </Text>
          </View>
          <Pressable
            style={sectionActionStyle}
            onPress={() => navigation.navigate("AutomationBuilder")}
          >
            <Ionicons
              name="add"
              size={Math.round(14 * scale)}
              color="rgba(255,255,255,0.95)"
            />
            <Text style={sectionActionTextStyle}>New flow</Text>
          </Pressable>
        </View>
      </View>
      {flowsList}
    </View>
  );
  const schedulesPanel = (
    <View style={sectionCardStyle}>
      <View style={sectionHeaderStyle}>
        <View>
          <Text style={sectionTitleStyle}>Schedules</Text>
          <Text style={sectionSubStyle}>Time-based device rules</Text>
        </View>
        <View style={sectionActionsStyle}>
          <View style={sectionBadgeStyle}>
            <Text style={sectionBadgeTextStyle}>
              {flowSummary(rules.length, "Schedule")}
            </Text>
          </View>
          <Pressable
            style={sectionActionStyle}
            onPress={openAdd}
          >
            <Ionicons
              name="add"
              size={Math.round(14 * scale)}
              color="rgba(255,255,255,0.95)"
            />
            <Text style={sectionActionTextStyle}>Add schedule</Text>
          </Pressable>
        </View>
      </View>
      {schedulesList}
    </View>
  );

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <BackgroundLines />
      <View style={contentStyle}>
        <ScreenFrame
          isPortrait={isPortrait}
          enabled={frameEnabled}
          isWide={isWide}
          pad={framePad}
          radius={frameRadius}
          width={frameWidth}
        >
          <ScreenSectionLayout
            header={
              <View style={headerStyle}>
                <View>
                  <Text style={headerTitleStyle}>Automations</Text>
                  <Text style={headerSubtitleStyle}>
                    Build flows and schedules.
                  </Text>
                </View>
                <HeaderPill
                  label={headerSummary}
                  icon="flash-outline"
                  iconSize={Math.round(14 * scale)}
                  style={headerPillStyle}
                  textStyle={headerPillTextStyle}
                />
              </View>
            }
            headerWrapStyle={headerWrapStyle}
            showDivider={isWide}
            dividerWrapStyle={headerDividerWrapStyle}
            scrollStyle={styles.sectionsScroll}
            contentContainerStyle={sectionsScrollContentStyle}
            showsVerticalScrollIndicator={false}
          >
            {isSplit ? (
              <View style={sectionsGridLandscapeStyle}>
                <View style={sectionsColumnStyle}>{flowsPanel}</View>
                <View style={sectionsColumnStyle}>{schedulesPanel}</View>
              </View>
            ) : (
              <View style={sectionsStackStyle}>
                {flowsPanel}
                {schedulesPanel}
              </View>
            )}
          </ScreenSectionLayout>
        </ScreenFrame>
      </View>

      <ModalCard
        visible={modalMode !== null}
        onRequestClose={() => setModalMode(null)}
        onBackdropPress={() => setModalMode(null)}
        colors={["rgba(255,255,255,0.96)", "rgba(246,238,255,0.90)"]}
        cardStyle={modalCardStyle}
      >
        <Text style={modalTitleStyle}>
          {isEditing ? "Edit schedule" : "New schedule"}
        </Text>
        <Text style={modalSubStyle}>
          {isEditing
            ? "Update your schedule or device action."
            : "Pick a device and schedule a time."}
        </Text>

        <ModalField label="Name" labelStyle={modalLabelStyle}>
          <TextInput
            value={ruleName}
            onChangeText={setRuleName}
            placeholder="Morning routine"
            placeholderTextColor="rgba(12,12,18,0.45)"
            style={modalInputStyle}
          />
        </ModalField>

        <ModalField label="Device" labelStyle={modalLabelStyle}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.deviceRow}
          >
            {devices.map((d) => {
              const active = d.id === selectedDevice?.id;
              return (
                <Pressable
                  key={d.id}
                  style={devicePillStyle(active)}
                  onPress={() => {
                    setSelectedDeviceId(d.id);
                    if (d.kind === "ac") setTemp(d.tempC ?? 22);
                  }}
                >
                  <Text style={devicePillTextStyle(active)}>{d.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </ModalField>

        <ModalField label="Time" labelStyle={modalLabelStyle}>
          <View style={styles.timeRow}>
            <TextInput
              value={hour}
              onChangeText={setHour}
              placeholder="21"
              keyboardType="number-pad"
              style={timeInputStyle}
              maxLength={2}
            />
            <Text style={styles.timeColon}>:</Text>
            <TextInput
              value={minute}
              onChangeText={setMinute}
              placeholder="00"
              keyboardType="number-pad"
              style={timeInputStyle}
              maxLength={2}
            />
          </View>
        </ModalField>

        {isAC ? (
          <ModalField label="Temperature" labelStyle={modalLabelStyle}>
            <View style={styles.sliderRow}>
              <Text style={sliderValueStyle}>{temp}°C</Text>
              <Slider
                style={sliderStyle}
                minimumValue={AC_TEMP_MIN_C}
                maximumValue={AC_TEMP_MAX_C}
                value={temp}
                minimumTrackTintColor="rgba(180,107,255,0.8)"
                maximumTrackTintColor="rgba(12,12,18,0.1)"
                thumbTintColor="#fff"
                onValueChange={(v) => setTemp(Math.round(v))}
              />
            </View>
          </ModalField>
        ) : (
          <ModalField label="Action" labelStyle={modalLabelStyle}>
            <View style={styles.toggleRow}>
              <Pressable
                style={toggleBtnStyle(toggleOn)}
                onPress={() => setToggleOn(true)}
              >
                <Ionicons
                  name="power"
                  size={Math.round(16 * scale)}
                  color={toggleOn ? "#fff" : "rgba(12,12,18,0.7)"}
                />
                <Text style={toggleTextStyle(toggleOn)}>On</Text>
              </Pressable>
              <Pressable
                style={toggleBtnStyle(!toggleOn)}
                onPress={() => setToggleOn(false)}
              >
                <Ionicons
                  name="power"
                  size={Math.round(16 * scale)}
                  color={!toggleOn ? "#fff" : "rgba(12,12,18,0.7)"}
                />
                <Text style={toggleTextStyle(!toggleOn)}>Off</Text>
              </Pressable>
            </View>
          </ModalField>
        )}

              <ModalActionRow
                style={styles.modalRow}
                actions={[
                  {
                    label: "Cancel",
                    onPress: () => setModalMode(null),
                    style: modalGhostStyle,
                    textStyle: modalGhostTextStyle,
                  },
                  {
                    label: isEditing ? "Save" : "Create",
                    onPress: handleSubmit,
                    style: modalPrimaryStyle,
                    textStyle: modalPrimaryTextStyle,
                    disabled: !canCreate,
                  },
                ]}
              />
        {isEditing ? (
          <Pressable
            style={modalDeleteStyle}
            onPress={() => {
              if (!editingId) return;
              removeRule(editingId);
              setModalMode(null);
            }}
          >
            <Text style={modalDeleteTextStyle}>Delete schedule</Text>
          </Pressable>
        ) : null}
      </ModalCard>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: "center" },
  sectionsScroll: { flex: 1 },
  sectionsGridLandscape: { flexDirection: "row", alignItems: "flex-start" },
  sectionsColumn: { flex: 1, minWidth: 0 },
  sectionsStack: { width: "100%" },
  sectionCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  headerCompact: {
    alignItems: "flex-start",
    marginBottom: 12,
  },
  h1: { color: theme.colors.text, fontSize: 28, fontWeight: "900" },
  p: { color: theme.colors.subtext, marginTop: 4, fontWeight: "700" },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  headerPillText: { color: theme.colors.text, fontWeight: "800" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  sectionHeaderWrap: {
    flexWrap: "wrap",
  },
  sectionHeaderCompact: {
    alignItems: "flex-start",
    marginBottom: 10,
  },
  sectionTitle: { color: theme.colors.text, fontWeight: "900" },
  sectionSub: { color: theme.colors.subtext, marginTop: 4, fontWeight: "700" },
  sectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  sectionActionsFull: {
    width: "100%",
    justifyContent: "flex-start",
  },
  sectionActionsCompact: {
    alignSelf: "stretch",
    justifyContent: "flex-start",
    gap: 6,
  },
  sectionActionCompact: {
    maxWidth: "100%",
    flexShrink: 1,
  },
  sectionBadge: {
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    maxWidth: "100%",
  },
  sectionBadgeText: {
    color: theme.colors.text,
    fontWeight: "800",
    flexShrink: 1,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(180,107,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(180,107,255,0.35)",
  },
  sectionActionWide: {
    maxWidth: "100%",
    flexShrink: 1,
  },
  sectionActionText: {
    color: theme.colors.text,
    fontWeight: "800",
    flexShrink: 1,
  },
  grid: { gap: 12 },
  gridMulti: { flexDirection: "row", flexWrap: "wrap" },
  card: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  name: { color: theme.colors.text, fontWeight: "900" },
  sub: { color: theme.colors.subtext, marginTop: 6, fontWeight: "700" },
  emptyCard: {
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  emptyTitle: { color: theme.colors.text, fontWeight: "900" },
  emptySub: { color: theme.colors.subtext, marginTop: 6, fontWeight: "700" },
  modalCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.40)",
  },
  modalTitle: { color: "rgba(12,12,18,0.9)", fontWeight: "900", fontSize: 18 },
  modalSub: { color: "rgba(12,12,18,0.55)", fontWeight: "700", marginTop: 6 },
  modalLabel: {
    color: "rgba(12,12,18,0.75)",
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    paddingHorizontal: 12,
    color: "rgba(12,12,18,0.9)",
    fontWeight: "700",
  },
  deviceRow: { gap: 8, paddingVertical: 6 },
  devicePill: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(12,12,18,0.06)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  devicePillActive: {
    backgroundColor: "rgba(107,60,255,0.2)",
    borderColor: "rgba(107,60,255,0.3)",
  },
  devicePillText: {
    color: "rgba(12,12,18,0.7)",
    fontWeight: "800",
    fontSize: 12,
  },
  devicePillTextActive: { color: "rgba(12,12,18,0.9)" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  timeInput: {
    width: 60,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    textAlign: "center",
    color: "rgba(12,12,18,0.9)",
    fontWeight: "800",
  },
  timeColon: { fontSize: 18, fontWeight: "900", color: "rgba(12,12,18,0.65)" },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sliderValue: { width: 64, color: "rgba(12,12,18,0.9)", fontWeight: "900" },
  toggleRow: { flexDirection: "row", gap: 10 },
  toggleBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.08)",
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  toggleBtnActive: { backgroundColor: "#6B3CFF", borderColor: "#6B3CFF" },
  toggleText: { color: "rgba(12,12,18,0.7)", fontWeight: "800" },
  toggleTextActive: { color: "#fff" },
  modalRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalGhost: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalGhostText: { color: "rgba(12,12,18,0.75)", fontWeight: "800" },
  modalPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#6B3CFF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryDisabled: { opacity: 0.6 },
  modalPrimaryText: { color: "#FFFFFF", fontWeight: "900" },
  modalDelete: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 99, 132, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalDeleteText: { color: "#8b1e3a", fontWeight: "900" },
});
