import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Switch,
  Alert,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import {
  selectActiveMember,
  selectVisibleDevices,
  selectVisibleRooms,
  type IntegrationProvider,
  useHomeStore,
} from "../store/useHomeStore";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import AvatarChip from "../components/AvatarChip";
import { useResponsive } from "../theme/layout";
import * as ImagePicker from "expo-image-picker";
import LandscapeFrame from "../components/LandscapeFrame";
import PortraitFrame from "../components/PortraitFrame";
import {
  setRoomMembershipRemote,
  type RoomMemberRole,
} from "../services/roomMembers";
import {
  inviteHomeMember,
  listPendingInvites,
  respondHomeInvite,
  type HomeInvite,
} from "../services/cloudRegistry";
import { syncMembershipFromSupabase } from "../services/membership";
import { supabase } from "../services/supabaseClient";
import { disableRemotePushRegistration } from "../services/remotePush";
import {
  DEFAULT_UTILITY_LOCATION_ID,
  UTILITY_RATE_OPTIONS,
  formatElectricityRate,
  formatWaterRate,
  getUtilityRatePreset,
  type UtilityLocationId,
  type UtilityLocationMode,
  type UtilityLocationStatus,
} from "../data/utilityRates";
import {
  buildUtilityLocationPatchFromDeviceResult,
  requestUtilityLocationFromDevice,
} from "../services/utilityLocation";
import {
  configurePresenceGeofenceFromCurrentLocation,
  DEFAULT_PRESENCE_GEOFENCE_RADIUS_M,
  PRESENCE_GEOFENCE_RADIUS_OPTIONS,
  syncPresenceFromCurrentLocationIfAuthorized,
  syncPresenceGeofencingFromProfile,
} from "../services/presenceGeofencing";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export default function ProfileScreen({ navigation }: Props) {
  const { width, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(640);
  const isWide = isTablet && isLandscape;
  const isPortrait = !isLandscape;
  const frameEnabled = isPortrait || isWide;
  const FrameComponent = isPortrait ? PortraitFrame : LandscapeFrame;
  const iconSize = Math.round((isTablet ? 46 : 40) * scale);
  const iconRadius = Math.round(iconSize * 0.4);
  const titleSize = Math.round((isTablet ? 26 : 24) * scale);
  const cardPad = Math.round((isTablet ? 20 : 16) * scale);
  const cardRadius = Math.round((isTablet ? 26 : 24) * scale);
  const heroPanelPad = Math.round((isTablet ? 18 : 14) * scale);
  const heroPanelRadius = Math.round((isTablet ? 22 : 20) * scale);
  const heroOuterPad = Math.round(cardPad * (isWide ? 1 : 0.9));
  const framePad = Math.round((isTablet ? 14 : 10) * scale);
  const frameRadius = Math.round((isTablet ? 30 : 26) * scale);
  const avatarSize = Math.round(
    (isTablet ? (isPortrait ? 112 : 96) : 84) * scale,
  );
  const heroHaloSize = Math.round(avatarSize * 1.5);
  const heroNameSize = Math.round((isTablet ? 22 : 20) * scale);
  const heroSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const statPillHeight = Math.round((isTablet ? 30 : 28) * scale);
  const statTextSize = Math.round((isTablet ? 12 : 11) * scale);
  const hintSize = Math.round((isTablet ? 13 : 12) * scale);
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const inputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const inputRadius = Math.round(inputHeight * 0.32);
  const saveHeight = Math.round(
    (isTablet ? (isLandscape ? 42 : 48) : 44) * scale,
  );
  const saveRadius = Math.round(saveHeight * 0.32);
  const saveWidth = Math.round((isTablet ? 300 : 240) * scale);
  const gridGap = Math.round((isTablet ? 18 : 12) * scale);
  const outerGutter = Math.round(gutter * (isWide ? 0.6 : 0.8));
  const innerGutter = Math.round(gutter * (isWide ? 0.75 : 0.9));
  const scrollTopPad = Math.round(16 * scale);
  const scrollBottomPad = Math.round(
    (isTablet ? (isLandscape ? 120 : 140) : 120) * scale,
  );
  const columnsGap = Math.round((isTablet ? 12 : 8) * scale);
  const heroGap = Math.round((isTablet ? 18 : 12) * scale);
  const heroIdentityGap = Math.round(
    (isTablet ? (isPortrait ? 26 : 22) : 16) * scale,
  );
  const swatchSize = Math.round((isTablet ? 30 : 26) * scale);
  const swatchRadius = Math.round((isTablet ? 12 : 10) * scale);
  const headerSlotWidth = isLandscape ? iconSize : iconSize;
  const headerSidePad = Math.round(
    (isLandscape ? (isTablet ? 0 : 4) : 0) * scale,
  );
  const headerGap = Math.round(
    (isLandscape ? (isTablet ? 22 : 16) : 12) * scale,
  );
  const headerTopPad = Math.round(
    (isLandscape ? (isTablet ? 12 : 8) : 0) * scale,
  );
  const framePadValue = frameEnabled && !isWide ? framePad : 0;
  const frameWidth = width - outerGutter * 2;
  const frameInnerWidth = Math.max(0, frameWidth - framePadValue * 2);
  const contentInset = frameEnabled
    ? Math.max(0, innerGutter - framePad)
    : innerGutter;
  const columnsWidth = Math.max(0, frameInnerWidth - contentInset * 2);
  const columnsLayoutWidth = columnsWidth;
  const saveWidthLandscape =
    columnsLayoutWidth > 0
      ? Math.min(saveWidth, columnsLayoutWidth)
      : saveWidth;
  const saveWidthPortrait =
    columnsLayoutWidth > 0
      ? Math.min(saveWidth, columnsLayoutWidth)
      : saveWidth;
  const columnCount = isWide ? 3 : isTablet ? 2 : 1;
  const columnWidth =
    columnsLayoutWidth <= 0
      ? 0
      : Math.max(
          0,
          (columnsLayoutWidth - columnsGap * (columnCount - 1)) / columnCount,
        );
  const cardColumnStyle = {
    width: columnWidth,
    flexBasis: columnWidth,
    maxWidth: columnWidth,
    flexGrow: 0,
    flexShrink: 0,
  };
  const cardBaseStyle = [
    styles.card,
    styles.columnCard,
    {
      padding: cardPad,
      borderRadius: cardRadius,
      ...cardColumnStyle,
    },
  ];
  const heroColumnsWidth = Math.max(0, columnsWidth - heroOuterPad * 2);
  const heroColumnWidth = Math.max(
    0,
    isWide
      ? (heroColumnsWidth - heroGap * (columnCount - 1)) / columnCount
      : heroColumnsWidth,
  );
  const heroColumnStyle = {
    width: heroColumnWidth,
    flexBasis: heroColumnWidth,
    maxWidth: heroColumnWidth,
  };
  const heroPanelStyle = {
    padding: heroPanelPad,
    borderRadius: heroPanelRadius,
  };
  const headerRowLayout: ViewStyle = {
    paddingHorizontal: headerSidePad,
    gap: headerGap,
  };
  const headerRowStyle: StyleProp<ViewStyle> = [styles.top, headerRowLayout];
  const iconButtonLayout: ViewStyle = {
    width: iconSize,
    height: iconSize,
    borderRadius: iconRadius,
  };
  const iconButtonStyle: StyleProp<ViewStyle> = [
    styles.iconBtn,
    iconButtonLayout,
  ];
  const frameStyle: StyleProp<ViewStyle> = [
    styles.frameFill,
    isWide ? styles.fullFrame : null,
    outerGutter > 0 ? { marginBottom: outerGutter } : null,
  ];
  const headerWrapLayout: ViewStyle = {
    paddingHorizontal: contentInset,
    paddingTop: headerTopPad,
  };
  const headerWrapStyle: StyleProp<ViewStyle> = [
    styles.headerWrap,
    headerWrapLayout,
  ];
  const scrollContentStyle: ViewStyle = {
    paddingTop: scrollTopPad,
    paddingBottom: scrollBottomPad,
    paddingHorizontal: contentInset,
  };
  const heroCardLayout: ViewStyle = { padding: 0, borderRadius: cardRadius };
  const heroCardStyle: StyleProp<ViewStyle> = [
    styles.card,
    styles.heroCard,
    heroCardLayout,
  ];
  const heroContentLayout: ViewStyle = {
    paddingHorizontal: heroOuterPad,
    paddingVertical: cardPad,
  };
  const heroContentStyle: StyleProp<ViewStyle> = [
    styles.heroContent,
    heroContentLayout,
  ];
  const heroLayoutLayout: ViewStyle = { gap: heroGap };
  const heroLayoutStyle: StyleProp<ViewStyle> = [
    styles.heroLayout,
    isWide && styles.heroLayoutLandscape,
    heroLayoutLayout,
  ];
  const heroIdentityPanelStyle: StyleProp<ViewStyle> = [
    styles.heroPanel,
    styles.heroIdentity,
    heroPanelStyle,
    heroColumnStyle,
  ];
  const heroMetaPanelStyle: StyleProp<ViewStyle> = [
    styles.heroPanel,
    styles.heroMeta,
    heroPanelStyle,
    heroColumnStyle,
  ];
  const heroActionsPanelStyle: StyleProp<ViewStyle> = [
    styles.heroPanel,
    styles.heroActions,
    heroPanelStyle,
    heroColumnStyle,
  ];
  const columnsGridLayout: ViewStyle | null =
    columnsLayoutWidth > 0
      ? { width: columnsLayoutWidth, alignSelf: "center" }
      : null;
  const columnsGridStyle: StyleProp<ViewStyle> = [
    styles.columnsGrid,
    columnsGridLayout,
  ];
  const columnsRowLayout: ViewStyle = { gap: columnsGap };
  const columnsRowStyle: StyleProp<ViewStyle> = [
    styles.columnsRow,
    columnsRowLayout,
  ];
  const columnStackLayout: ViewStyle = { gap: columnsGap };
  const columnStackStyle: StyleProp<ViewStyle> = [
    styles.columnStack,
    columnStackLayout,
  ];
  const columnStackItemStyle: StyleProp<ViewStyle> =
    columnWidth > 0
      ? [styles.columnStack, columnStackLayout, { width: columnWidth }]
      : columnStackStyle;
  const saveWrapLayout: ViewStyle = { marginTop: columnsGap };
  const saveWrapStyle: StyleProp<ViewStyle> = [
    styles.fullSpan,
    columnsGridLayout,
    saveWrapLayout,
  ];
  const contentStyle: StyleProp<ViewStyle> = [
    styles.content,
    { paddingHorizontal: outerGutter, paddingTop: topPad },
  ];
  const headerSlotStyle: StyleProp<ViewStyle> = [
    styles.headerSlot,
    { width: headerSlotWidth },
  ];
  const titleTextStyle: StyleProp<TextStyle> = [
    styles.title,
    { fontSize: titleSize },
  ];
  const sectionTitleTextStyle: StyleProp<TextStyle> = [
    styles.sectionTitle,
    styles.sectionTitleTight,
    { fontSize: labelSize },
  ];
  const sectionSubTextStyle: StyleProp<TextStyle> = [
    styles.sectionSub,
    { fontSize: hintSize },
  ];
  const labelTextStyle: StyleProp<TextStyle> = [
    styles.label,
    { fontSize: labelSize },
  ];
  const inputFieldStyle: StyleProp<ViewStyle> = [
    styles.input,
    { height: inputHeight, borderRadius: inputRadius },
  ];
  const formGridStyle: StyleProp<ViewStyle> = [
    styles.formGrid,
    isWide && { flexDirection: "row", gap: gridGap },
  ];
  const formColumnStyle: StyleProp<ViewStyle> = [
    styles.formColumn,
    isWide && { flex: 1 },
  ];
  const cardHintTextStyle: StyleProp<TextStyle> = [
    styles.cardHint,
    { fontSize: hintSize },
  ];
  const cardHintTopTextStyle: StyleProp<TextStyle> = [
    styles.cardHint,
    { fontSize: hintSize, marginTop: 10 },
  ];
  const chipStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.chip,
    active && styles.chipActive,
  ];
  const chipTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.chipText,
    active && styles.chipTextActive,
  ];
  const rowLabelTextStyle: StyleProp<TextStyle> = [
    styles.rowLabel,
    { fontSize: labelSize },
  ];
  const rowActionTextStyle: StyleProp<TextStyle> = [
    styles.rowActionText,
    { fontSize: labelSize },
  ];
  const settingLabelTextStyle: StyleProp<TextStyle> = [
    styles.settingLabel,
    { fontSize: labelSize },
  ];
  const settingSubTextStyle: StyleProp<TextStyle> = [
    styles.settingSub,
    { fontSize: hintSize },
  ];
  const memberNameTextStyle: StyleProp<TextStyle> = [
    styles.memberName,
    { fontSize: labelSize },
  ];
  const memberRoleTextStyle: StyleProp<TextStyle> = [
    styles.memberRole,
    { fontSize: hintSize },
  ];
  const memberBadgeTextStyle: StyleProp<TextStyle> = [
    styles.memberBadgeText,
    { fontSize: hintSize },
  ];
  const avatarBtnTextStyle: StyleProp<TextStyle> = [
    styles.avatarBtnText,
    { fontSize: hintSize },
  ];
  const heroSwatchLabelStyle: StyleProp<TextStyle> = [
    styles.heroSwatchLabel,
    { fontSize: hintSize },
  ];
  const saveTextStyle: StyleProp<TextStyle> = [
    styles.saveText,
    { fontSize: labelSize },
  ];
  const secondaryBtnTextStyle: StyleProp<TextStyle> = [
    styles.secondaryBtnText,
    { fontSize: labelSize },
  ];
  const heroIdentityRowStyle: StyleProp<ViewStyle> = [
    styles.heroIdentityRow,
    { gap: heroIdentityGap },
  ];
  const heroAvatarHaloStyle: StyleProp<ViewStyle> = [
    styles.heroAvatarHalo,
    {
      width: heroHaloSize,
      height: heroHaloSize,
      borderRadius: heroHaloSize / 2,
    },
  ];
  const heroNameTextStyle: StyleProp<TextStyle> = [
    styles.heroName,
    { fontSize: heroNameSize },
  ];
  const heroSubTextStyle: StyleProp<TextStyle> = [
    styles.heroSub,
    { fontSize: heroSubSize },
  ];
  const badgeTextStyle: StyleProp<TextStyle> = [
    styles.badgeText,
    { fontSize: hintSize },
  ];
  const statPillStyle: StyleProp<ViewStyle> = [
    styles.statPill,
    { height: statPillHeight, borderRadius: Math.round(statPillHeight / 2) },
  ];
  const statTextStyle: StyleProp<TextStyle> = [
    styles.statText,
    { fontSize: statTextSize },
  ];
  const heroHintTextStyle: StyleProp<TextStyle> = [
    styles.hint,
    styles.heroHint,
    { fontSize: hintSize },
  ];
  const avatarBtnGhostStyle: StyleProp<ViewStyle> = [
    styles.avatarBtn,
    styles.avatarBtnGhost,
  ];
  const flex1Style: StyleProp<ViewStyle> = { flex: 1 };
  const switchScaleStyle: StyleProp<ViewStyle> = {
    transform: [{ scale: isTablet ? 1.05 : 1 }],
  };
  const servicePillStyle = (
    linked: boolean,
    disabled: boolean,
  ): StyleProp<ViewStyle> => [
    styles.servicePill,
    linked && styles.servicePillActive,
    disabled && styles.servicePillDisabled,
  ];
  const servicePillTextStyle = (linked: boolean): StyleProp<TextStyle> => [
    styles.servicePillText,
    { fontSize: hintSize },
    linked && styles.servicePillTextActive,
  ];
  const settingRowStyle = (showDivider: boolean): StyleProp<ViewStyle> => [
    styles.settingRow,
    showDivider && styles.settingRowDivider,
  ];
  const secondaryButtonDisabledStyle: ViewStyle = { opacity: 0.6 };
  const secondaryButtonStyle = (disabled: boolean): StyleProp<ViewStyle> => [
    styles.secondaryBtn,
    disabled && secondaryButtonDisabledStyle,
  ];
  const profile = useHomeStore((s) => s.profile);
  const setProfile = useHomeStore((s) => s.setProfile);
  const prefs = useHomeStore((s) => s.preferences);
  const setPreferences = useHomeStore((s) => s.setPreferences);
  const integrations = useHomeStore((s) => s.integrations);
  const roomsCount = useHomeStore((s) => selectVisibleRooms(s).length);
  const devicesCount = useHomeStore((s) => selectVisibleDevices(s).length);
  const household = useHomeStore((s) => s.household);
  const rooms = useHomeStore(selectVisibleRooms);
  const activeMember = useHomeStore(selectActiveMember);
  const activeMemberId = useHomeStore((s) => s.activeMemberId);
  const setActiveMember = useHomeStore((s) => s.setActiveMember);
  const setHouseholdFromRemote = useHomeStore((s) => s.setHouseholdFromRemote);
  const setRoomMembersFromRemote = useHomeStore(
    (s) => s.setRoomMembersFromRemote,
  );
  const roomMembers = useHomeStore((s) => s.roomMembers);
  const setRoomMembership = useHomeStore((s) => s.setRoomMembership);
  const addHouseholdMember = useHomeStore((s) => s.addHouseholdMember);
  const removeHouseholdMember = useHomeStore((s) => s.removeHouseholdMember);

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [homeName, setHomeName] = useState(profile.homeName ?? "");
  const [avatarColor, setAvatarColor] = useState(
    profile.avatarColor ?? "#B46BFF",
  );
  const [avatarUri, setAvatarUri] = useState(profile.avatarUri ?? "");
  const [timeFormat, setTimeFormat] = useState(profile.timeFormat ?? "12h");
  const [tempUnit, setTempUnit] = useState(profile.tempUnit ?? "C");
  const [timezone, setTimezone] = useState(profile.timezone ?? "Auto");
  const [utilityLocation, setUtilityLocation] = useState<UtilityLocationId>(
    profile.utilityLocation ?? DEFAULT_UTILITY_LOCATION_ID,
  );
  const [utilityLocationManual, setUtilityLocationManual] =
    useState<UtilityLocationId>(
      profile.utilityLocationManual ??
        profile.utilityLocation ??
        DEFAULT_UTILITY_LOCATION_ID,
    );
  const [utilityLocationMode, setUtilityLocationMode] =
    useState<UtilityLocationMode>(profile.utilityLocationMode ?? "manual");
  const [utilityLocationResolvedLabel, setUtilityLocationResolvedLabel] =
    useState(profile.utilityLocationResolvedLabel ?? "");
  const [utilityLocationStatus, setUtilityLocationStatus] =
    useState<UtilityLocationStatus>(profile.utilityLocationStatus ?? "fallback");
  const [utilityLocationBusy, setUtilityLocationBusy] = useState(false);
  const [presenceGeofenceEnabled, setPresenceGeofenceEnabled] = useState(
    profile.presenceGeofenceEnabled ?? false,
  );
  const [presenceGeofenceRadiusM, setPresenceGeofenceRadiusM] = useState(
    profile.presenceGeofenceRadiusM ?? DEFAULT_PRESENCE_GEOFENCE_RADIUS_M,
  );
  const [presenceGeofenceLabel, setPresenceGeofenceLabel] = useState(
    profile.presenceGeofenceLabel ?? "",
  );
  const [presenceGeofenceBusy, setPresenceGeofenceBusy] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<
    "Owner" | "Admin" | "Member" | "Guest" | "Tenant"
  >("Guest");
  const [newMemberAvatar, setNewMemberAvatar] = useState("");
  const [pendingInvites, setPendingInvites] = useState<HomeInvite[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const canManageRooms = activeMember
    ? ["Owner", "Admin"].includes(activeMember.role)
    : false;
  const canManageHousehold = canManageRooms;
  const resolveRoomRole = (
    role: typeof household[number]["role"],
  ): RoomMemberRole | null => {
    if (role === "Member") return "member";
    if (role === "Guest") return "guest";
    if (role === "Tenant") return "tenant";
    return null;
  };
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  const updateRoomAccess = async (
    memberId: string,
    userId: string | undefined,
    role: typeof household[number]["role"],
    prevRoomIds: string[],
    nextRoomIds: string[],
  ) => {
    setRoomMembership(memberId, nextRoomIds);
    const roomRole = resolveRoomRole(role);
    if (
      !userId ||
      !roomRole ||
      !isUuid(userId) ||
      !nextRoomIds.every(isUuid)
    )
      return;
    try {
      await setRoomMembershipRemote(userId, nextRoomIds, roomRole);
    } catch (err) {
      setRoomMembership(memberId, prevRoomIds);
      Alert.alert(
        "Room access update failed",
        (err as Error).message ?? "Unable to update room access.",
      );
    }
  };
  const refreshInvites = useCallback(async () => {
    if (!supabase) {
      setPendingInvites([]);
      return;
    }
    try {
      const invites = await listPendingInvites();
      setPendingInvites(invites);
    } catch {
      setPendingInvites([]);
    }
  }, []);
  useEffect(() => {
    refreshInvites();
  }, [refreshInvites]);
  const [biometricLock, setBiometricLock] = useState(true);
  const [locationSharing, setLocationSharing] = useState(
    profile.locationSharingEnabled ?? true,
  );
  const [activitySharing, setActivitySharing] = useState(false);
  const [autoUpdates, setAutoUpdates] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const saveButtonLayout: ViewStyle = {
    height: saveHeight,
    borderRadius: saveRadius,
    marginTop: 0,
    width: isLandscape ? saveWidthLandscape : saveWidthPortrait,
    alignSelf: isLandscape ? "flex-end" : "center",
  };
  const saveDisabledStyle: ViewStyle | null = !name.trim()
    ? { opacity: 0.6 }
    : null;
  const saveButtonStyle: StyleProp<ViewStyle> = [
    styles.save,
    saveButtonLayout,
    saveDisabledStyle,
  ];
  const swatchStyleFor = (color: string): StyleProp<ViewStyle> => [
    styles.swatch,
    {
      width: swatchSize,
      height: swatchSize,
      borderRadius: swatchRadius,
      backgroundColor: color,
    },
    avatarColor === color && styles.swatchActive,
  ];

  const completionSteps = [
    name.trim(),
    email.trim(),
    phone.trim(),
    homeName.trim(),
    timezone.trim(),
    avatarUri || avatarColor,
  ];
  const completionCount = completionSteps.filter(Boolean).length;
  const completionPct = Math.round(
    (completionCount / completionSteps.length) * 100,
  );
  const progressFillStyle: StyleProp<ViewStyle> = [
    styles.progressFill,
    { width: `${completionPct}%` },
  ];
  const progressTextStyle: StyleProp<TextStyle> = [
    styles.progressText,
    { fontSize: hintSize },
  ];
  const utilityPreset = getUtilityRatePreset(utilityLocation);
  const manualUtilityPreset = getUtilityRatePreset(utilityLocationManual);
  const serviceItems: Array<{
    provider: IntegrationProvider;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    {
      provider: "alexa",
      label: "Amazon Alexa",
      icon: "logo-amazon",
    },
    {
      provider: "google",
      label: "Google Home",
      icon: "logo-google",
    },
    {
      provider: "homekit",
      label: "Apple HomeKit",
      icon: "logo-apple",
    },
    {
      provider: "matter",
      label: "Matter Bridge",
      icon: "link-outline",
    },
  ];
  const securityItems = [
    {
      id: "biometric",
      label: "Biometric lock",
      sub: "Face ID / Touch ID",
      value: biometricLock,
      onChange: setBiometricLock,
    },
    {
      id: "location",
      label: "Location sharing",
      sub: "Used for presence automations",
      value: locationSharing,
      onChange: (value: boolean) => handleLocationSharingChange(value),
    },
    {
      id: "activity",
      label: "Activity sharing",
      sub: "Share usage with household",
      value: activitySharing,
      onChange: setActivitySharing,
    },
  ];
  const reportItems = [
    {
      id: "updates",
      label: "Auto updates",
      sub: "Install overnight",
      value: autoUpdates,
      onChange: setAutoUpdates,
    },
    {
      id: "digest",
      label: "Weekly digest",
      sub: "Energy and safety summary",
      value: weeklyDigest,
      onChange: setWeeklyDigest,
    },
  ];

  const setManualUtilityRates = (locationId: UtilityLocationId) => {
    setUtilityLocation(locationId);
    setUtilityLocationManual(locationId);
    setUtilityLocationMode("manual");
    setUtilityLocationResolvedLabel("");
    setUtilityLocationStatus(locationId === "us-average" ? "fallback" : "matched");
  };

  const useManualUtilityMode = () => {
    setUtilityLocation(utilityLocationManual);
    setUtilityLocationMode("manual");
    setUtilityLocationResolvedLabel("");
    setUtilityLocationStatus(
      utilityLocationManual === "us-average" ? "fallback" : "matched",
    );
  };

  const handleUseCurrentLocation = async () => {
    if (utilityLocationBusy) return;
    setUtilityLocationBusy(true);
    try {
      const result = await requestUtilityLocationFromDevice();
      if (result.kind === "permission-denied") {
        Alert.alert(
          "Location permission needed",
          "Allow location access to match your utility rates automatically.",
        );
        return;
      }
      if (result.kind === "unavailable") {
        Alert.alert(
          "Location unavailable",
          "VantaHome couldn't read your current location right now. Your manual rate will stay in place.",
        );
        return;
      }

      const patch = buildUtilityLocationPatchFromDeviceResult(
        result,
        utilityLocationManual,
      );
      setUtilityLocation(patch.utilityLocation);
      setUtilityLocationMode("device");
      setUtilityLocationResolvedLabel(patch.utilityLocationResolvedLabel);
      setUtilityLocationStatus(patch.utilityLocationStatus);

      if (patch.utilityLocationStatus === "unsupported") {
        Alert.alert(
          "Manual backup in use",
          patch.utilityLocationResolvedLabel
            ? `${patch.utilityLocationResolvedLabel} is not mapped to a local utility preset yet, so VantaHome is using your manual backup rate instead.`
            : "Your current location is not mapped to a local utility preset yet, so VantaHome is using your manual backup rate instead.",
        );
      }
    } finally {
      setUtilityLocationBusy(false);
    }
  };

  const utilitySummaryText =
    utilityLocationMode === "device"
      ? utilityLocationStatus === "matched"
        ? utilityLocationResolvedLabel
          ? `Auto mode is using ${utilityPreset.label} based on ${utilityLocationResolvedLabel}.`
          : `Auto mode is using ${utilityPreset.label}.`
        : utilityLocationStatus === "fallback"
          ? utilityLocationResolvedLabel
            ? `Auto mode is using ${utilityPreset.label} for ${utilityLocationResolvedLabel}.`
            : `Auto mode is using ${utilityPreset.label}.`
          : utilityLocationResolvedLabel
            ? `${utilityLocationResolvedLabel} is not mapped yet, so VantaHome is using your manual backup rate: ${manualUtilityPreset.label}.`
            : `Your current location is not mapped yet, so VantaHome is using your manual backup rate: ${manualUtilityPreset.label}.`
      : `Manual mode is using ${manualUtilityPreset.label}.`;

  const utilityActionLabel = utilityLocationBusy
    ? "Locating..."
    : utilityLocationMode === "device"
      ? "Refresh current location"
      : "Use current location";

  const handleLocationSharingChange = (value: boolean) => {
    setLocationSharing(value);
    if (!value) {
      setPresenceGeofenceEnabled(false);
      setProfile({
        locationSharingEnabled: false,
        presenceGeofenceEnabled: false,
      });
      void syncPresenceGeofencingFromProfile();
      return;
    }

    setProfile({ locationSharingEnabled: true });
    void syncPresenceGeofencingFromProfile();
    void syncPresenceFromCurrentLocationIfAuthorized();
  };

  const handlePresenceRadiusSelect = (radius: number) => {
    setPresenceGeofenceRadiusM(radius);
    setProfile({ presenceGeofenceRadiusM: radius });
    if (locationSharing && presenceGeofenceEnabled) {
      void syncPresenceGeofencingFromProfile();
      void syncPresenceFromCurrentLocationIfAuthorized();
    }
  };

  const handleSetCurrentLocationAsHome = async () => {
    if (presenceGeofenceBusy) return;
    setPresenceGeofenceBusy(true);
    try {
      const result = await configurePresenceGeofenceFromCurrentLocation(
        presenceGeofenceRadiusM,
      );

      if (result.kind === "task-unavailable") {
        Alert.alert(
          "Background presence unavailable",
          "Use a development build or installed app to run home geofencing in the background.",
        );
        return;
      }

      if (result.kind === "permission-denied") {
        Alert.alert(
          "Location permission needed",
          "Allow location access to set your home zone.",
        );
        return;
      }

      if (result.kind === "background-permission-denied") {
        Alert.alert(
          "Always Allow needed",
          "Enable Always location access so VantaHome can update your presence after you leave home.",
        );
        return;
      }

      if (result.kind === "location-unavailable") {
        Alert.alert(
          "Location unavailable",
          "VantaHome couldn't read your current location right now.",
        );
        return;
      }

      setLocationSharing(true);
      setPresenceGeofenceEnabled(true);
      setPresenceGeofenceRadiusM(result.radiusM);
      setPresenceGeofenceLabel(result.label);
    } finally {
      setPresenceGeofenceBusy(false);
    }
  };

  const handleDisableHomeZone = () => {
    setPresenceGeofenceEnabled(false);
    setProfile({ presenceGeofenceEnabled: false });
    void syncPresenceGeofencingFromProfile();
  };

  const presenceSummaryText = !locationSharing
    ? "Location sharing is off, so presence automations are paused."
    : presenceGeofenceEnabled
      ? presenceGeofenceLabel
        ? `Home zone active at ${presenceGeofenceLabel} with a ${presenceGeofenceRadiusM}m radius.`
        : `Home zone active with a ${presenceGeofenceRadiusM}m radius.`
      : presenceGeofenceLabel
        ? `Home zone saved at ${presenceGeofenceLabel}. Turn it back on to resume automatic away/home detection.`
        : "No home zone saved yet. Set your current location as home to enable automatic away/home detection.";

  const presenceActionLabel = presenceGeofenceBusy
    ? "Setting home zone..."
    : presenceGeofenceEnabled
      ? "Refresh home zone"
      : "Set current location as home";

  const onSave = () => {
    setProfile({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      homeName: homeName.trim(),
      avatarColor,
      avatarUri,
      timeFormat,
      tempUnit,
      timezone: timezone.trim() || "Auto",
      utilityLocation,
      utilityLocationManual,
      utilityLocationMode,
      utilityLocationResolvedLabel,
      utilityLocationStatus,
      locationSharingEnabled: locationSharing,
      presenceGeofenceEnabled,
      presenceGeofenceRadiusM,
      presenceGeofenceLabel,
    });
    navigation.goBack();
  };

  const pickAvatar = async () => {
    // Request library access at runtime to avoid startup permission prompts.
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Enable photo access to upload a profile avatar.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const pickHouseholdAvatar = async () => {
    // Reuse the image picker for household members to keep uploads consistent.
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Enable photo access to add a household member.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setNewMemberAvatar(result.assets[0].uri);
    }
  };

  const handleAddMember = async () => {
    const trimmed = newMemberName.trim();
    const email = newMemberEmail.trim().toLowerCase();
    if (!trimmed) return;
    if (!email) {
      Alert.alert("Email required", "Add an email to invite this member.");
      return;
    }
    const addMemberLocally = () => {
      const localId = `m${Date.now()}`;
      const initialRoomIds =
        newMemberRole === "Guest" || newMemberRole === "Tenant"
          ? rooms.map((room) => room.id).slice(0, 1)
          : [];
      addHouseholdMember({
        id: localId,
        userId: localId,
        name: trimmed,
        role: newMemberRole,
        status: "away",
        avatarUri: newMemberAvatar,
        avatarColor: avatarColor,
      });
      if (initialRoomIds.length) {
        setRoomMembership(localId, initialRoomIds);
      }
      setNewMemberName("");
      setNewMemberEmail("");
      setNewMemberRole("Guest");
      setNewMemberAvatar("");
    };
    if (!supabase) {
      addMemberLocally();
      Alert.alert(
        "Invite added locally",
        "Sign in to send real invites from the cloud.",
      );
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        addMemberLocally();
        Alert.alert(
          "Invite added locally",
          "Sign in to send real invites from the cloud.",
        );
        return;
      }
    } catch {
      addMemberLocally();
      Alert.alert(
        "Invite added locally",
        "Sign in to send real invites from the cloud.",
      );
      return;
    }
    try {
      setInviteLoading(true);
      const roleLower = newMemberRole.toLowerCase() as
        | "admin"
        | "member"
        | "guest"
        | "tenant";
      const initialRoomIds =
        newMemberRole === "Guest" || newMemberRole === "Tenant"
          ? rooms.map((room) => room.id).slice(0, 1)
          : [];
      const { member } = await inviteHomeMember({
        email,
        name: trimmed,
        role: roleLower,
        roomIds: initialRoomIds.length ? initialRoomIds : undefined,
      });
      addHouseholdMember({
        id: member.userId,
        userId: member.userId,
        name: member.name,
        role: newMemberRole,
        status: "away",
        avatarUri: newMemberAvatar,
        avatarColor: avatarColor,
      });
      if (initialRoomIds.length) {
        setRoomMembership(member.userId, initialRoomIds);
      }
      setNewMemberName("");
      setNewMemberEmail("");
      setNewMemberRole("Guest");
      setNewMemberAvatar("");
      await refreshInvites();
    } catch (err) {
      const message = (err as Error).message ?? "Unable to invite member.";
      addMemberLocally();
      Alert.alert(
        "Invite added locally",
        `Invite failed to send: ${message}. You can resend after signing in.`,
      );
    }
    setInviteLoading(false);
  };

  const handleRespondInvite = async (
    inviteId: string,
    action: "accept" | "decline",
  ) => {
    try {
      await respondHomeInvite(inviteId, action);
      setPendingInvites((prev) => prev.filter((item) => item.id !== inviteId));
      if (action === "accept") {
        const result = await syncMembershipFromSupabase();
        if (result) {
          setHouseholdFromRemote(result.household);
          setRoomMembersFromRemote(result.roomMembers);
          setActiveMember(result.activeMemberId);
        }
      }
    } catch (err) {
      Alert.alert(
        "Invite response failed",
        (err as Error).message ?? "Unable to respond to invite.",
      );
    }
  };

  const openSettings = () => {
    navigation.navigate("Main", { screen: "Settings" });
  };

  const handleSignOut = () => {
    Alert.alert("Sign out", "You will need to sign in again to access the home.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          if (supabase) {
            try {
              await disableRemotePushRegistration();
            } finally {
              await supabase.auth.signOut();
            }
          }
        },
      },
    ]);
  };

  const pendingInvitesCard =
    pendingInvites.length >= 0 ? (
      <View key="pending-invites" style={cardBaseStyle}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={sectionTitleTextStyle}>Pending invites</Text>
            <Text style={sectionSubTextStyle}>
              Accept or decline invitations
            </Text>
          </View>
          <Ionicons
            name="mail-unread-outline"
            size={Math.round(18 * scale)}
            color={theme.colors.subtext}
          />
        </View>
        {pendingInvites.length ? (
          pendingInvites.map((invite) => (
            <View key={invite.id} style={styles.inviteRow}>
              <View style={flex1Style}>
                <Text style={styles.inviteTitle}>
                  Invite to join as {invite.role}
                </Text>
                <Text style={styles.inviteSub}>{invite.email}</Text>
              </View>
              <View style={styles.inviteActions}>
                <Pressable
                  style={styles.inviteActionPrimary}
                  onPress={() => handleRespondInvite(invite.id, "accept")}
                >
                  <Text style={styles.inviteActionText}>Accept</Text>
                </Pressable>
                <Pressable
                  style={styles.inviteActionSecondary}
                  onPress={() => handleRespondInvite(invite.id, "decline")}
                >
                  <Text style={styles.inviteActionText}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.memberAccessText}>No pending invites.</Text>
        )}
      </View>
    ) : null;

  const profileCards = [
    <View key="profile-details" style={cardBaseStyle}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={sectionTitleTextStyle}>Profile details</Text>
          <Text style={sectionSubTextStyle}>Identity and home info</Text>
        </View>
        <Ionicons
          name="person-outline"
          size={Math.round(18 * scale)}
          color={theme.colors.subtext}
        />
      </View>
      <View style={formGridStyle}>
        <View style={formColumnStyle}>
          <Text style={labelTextStyle}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={inputFieldStyle}
          />

          <Text style={labelTextStyle}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={inputFieldStyle}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        <View style={formColumnStyle}>
          <Text style={labelTextStyle}>Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 (555) 000-0000"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={inputFieldStyle}
            keyboardType="phone-pad"
          />

          <Text style={labelTextStyle}>Home name</Text>
          <TextInput
            value={homeName}
            onChangeText={setHomeName}
            placeholder="Vanta Home"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={inputFieldStyle}
          />
        </View>
      </View>
    </View>,
    <View key="personalization" style={cardBaseStyle}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={sectionTitleTextStyle}>Personalization</Text>
          <Text style={sectionSubTextStyle}>Units, time, and locale</Text>
        </View>
        <Ionicons
          name="color-palette-outline"
          size={Math.round(18 * scale)}
          color={theme.colors.subtext}
        />
      </View>
      <Text style={cardHintTextStyle}>Temperature unit</Text>
      <View style={styles.chipRow}>
        {(["C", "F"] as const).map((unit) => {
          const active = tempUnit === unit;
          return (
            <Pressable
              key={unit}
              style={chipStyle(active)}
              onPress={() => setTempUnit(unit)}
            >
              <Text style={chipTextStyle(active)}>
                {unit === "C" ? "Celsius" : "Fahrenheit"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={cardHintTopTextStyle}>Time format</Text>
      <View style={styles.chipRow}>
        {(["12h", "24h"] as const).map((fmt) => {
          const active = timeFormat === fmt;
          return (
            <Pressable
              key={fmt}
              style={chipStyle(active)}
              onPress={() => setTimeFormat(fmt)}
            >
              <Text style={chipTextStyle(active)}>
                {fmt === "12h" ? "12-hour" : "24-hour"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={cardHintTopTextStyle}>Timezone</Text>
      <TextInput
        value={timezone}
        onChangeText={setTimezone}
        placeholder="Auto"
        placeholderTextColor="rgba(255,255,255,0.45)"
        style={inputFieldStyle}
      />

      <Text style={cardHintTopTextStyle}>Utility rates</Text>
      <View style={styles.chipRow}>
        {UTILITY_RATE_OPTIONS.map((option) => {
          const active = utilityLocationManual === option.id;
          return (
            <Pressable
              key={option.id}
              style={chipStyle(active)}
              onPress={() => setManualUtilityRates(option.id)}
            >
              <Text style={chipTextStyle(active)}>{option.chipLabel}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.utilityActionGroup}>
        <Pressable
          style={[styles.avatarBtn, utilityLocationBusy && secondaryButtonDisabledStyle]}
          onPress={handleUseCurrentLocation}
          disabled={utilityLocationBusy}
          testID="utility-use-current-location-button"
        >
          <Ionicons
            name={
              utilityLocationBusy
                ? "time-outline"
                : utilityLocationMode === "device"
                  ? "refresh-outline"
                  : "locate-outline"
            }
            size={Math.round(16 * scale)}
            color={theme.colors.text}
          />
          <Text style={secondaryBtnTextStyle}>{utilityActionLabel}</Text>
        </Pressable>
        {utilityLocationMode === "device" ? (
          <Pressable
            style={[styles.avatarBtn, styles.avatarBtnGhost]}
            onPress={useManualUtilityMode}
            testID="utility-use-manual-rates-button"
          >
            <Ionicons
              name="options-outline"
              size={Math.round(16 * scale)}
              color={theme.colors.subtext}
            />
            <Text style={secondaryBtnTextStyle}>Use manual rates</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={cardHintTextStyle}>
        Used for estimated daily energy and water cost.
      </Text>
      <Text style={cardHintTextStyle} testID="utility-summary-text">
        {utilitySummaryText}
      </Text>
      <Text style={cardHintTextStyle}>
        {formatElectricityRate(utilityPreset.electricityUsdPerKwh)} electricity
        {" · "}
        {formatWaterRate(utilityPreset.waterUsdPerLiter)} water
      </Text>
    </View>,
    <View key="quick-preferences" style={cardBaseStyle}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={sectionTitleTextStyle}>Quick preferences</Text>
          <Text style={sectionSubTextStyle}>Haptics and alerts</Text>
        </View>
        <Ionicons
          name="options-outline"
          size={Math.round(18 * scale)}
          color={theme.colors.subtext}
        />
      </View>
      <View style={styles.row}>
        <Text style={rowLabelTextStyle}>Haptics</Text>
        <Switch
          value={prefs.haptics}
          onValueChange={(v) => setPreferences({ haptics: v })}
          thumbColor={
            prefs.haptics
              ? theme.colors.accent
              : "rgba(255,255,255,0.8)"
          }
          trackColor={{
            true: "rgba(180,107,255,0.45)",
            false: "rgba(255,255,255,0.24)",
          }}
          style={switchScaleStyle}
        />
      </View>
      <View style={styles.row}>
        <Text style={rowLabelTextStyle}>Notifications</Text>
        <Switch
          value={prefs.notifications}
          onValueChange={(v) => setPreferences({ notifications: v })}
          thumbColor={
            prefs.notifications
              ? theme.colors.accent
              : "rgba(255,255,255,0.8)"
          }
          trackColor={{
            true: "rgba(180,107,255,0.45)",
            false: "rgba(255,255,255,0.24)",
          }}
          style={switchScaleStyle}
        />
      </View>
    </View>,
    <View key="connected-services" style={cardBaseStyle}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={sectionTitleTextStyle}>Connected services</Text>
          <Text style={sectionSubTextStyle}>
            Voice assistants and bridges
          </Text>
        </View>
        <Ionicons
          name="link-outline"
          size={Math.round(18 * scale)}
          color={theme.colors.subtext}
        />
      </View>
      {serviceItems.map((item) => {
        const state = integrations[item.provider];
        const status = state?.status ?? "not-linked";
        const linked = status === "linked";
        const statusLabel =
          state?.accountName ??
          (status === "linked"
            ? "Linked"
            : status === "linking"
              ? "Linking…"
              : status === "error"
                ? "Error"
                : "Not linked");
        const pillLabel = linked
          ? "Manage"
          : status === "linking"
            ? "Linking…"
            : status === "error"
              ? "Retry"
              : "Connect";
        const pillDisabled = status === "linking";
        return (
          <View key={item.provider} style={styles.serviceRow}>
            <View style={styles.serviceIcon}>
              <Ionicons
                name={item.icon}
                size={Math.round(16 * scale)}
                color={theme.colors.text}
              />
            </View>
            <View style={flex1Style}>
              <Text style={settingLabelTextStyle}>{item.label}</Text>
              <Text style={settingSubTextStyle}>{statusLabel}</Text>
            </View>
            <Pressable
              style={servicePillStyle(linked, pillDisabled)}
              onPress={openSettings}
              disabled={pillDisabled}
            >
              <Text style={servicePillTextStyle(linked)}>
                {pillLabel}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>,
    <View key="security-privacy" style={cardBaseStyle}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={sectionTitleTextStyle}>Security & privacy</Text>
          <Text style={sectionSubTextStyle}>Protect access and data</Text>
        </View>
        <Ionicons
          name="shield-checkmark-outline"
          size={Math.round(18 * scale)}
          color={theme.colors.subtext}
        />
      </View>
      {securityItems.map((item, index) => (
        <View
          key={item.id}
          style={settingRowStyle(index < securityItems.length - 1)}
        >
          <View style={styles.settingText}>
            <Text style={settingLabelTextStyle}>{item.label}</Text>
            <Text style={settingSubTextStyle}>{item.sub}</Text>
          </View>
          <Switch
            value={item.value}
            onValueChange={item.onChange}
            thumbColor={
              item.value ? theme.colors.accent : "rgba(255,255,255,0.8)"
            }
            trackColor={{
              true: "rgba(180,107,255,0.45)",
              false: "rgba(255,255,255,0.24)",
            }}
            style={switchScaleStyle}
          />
        </View>
      ))}
      <Text style={cardHintTextStyle}>Home zone radius</Text>
      <View style={styles.chipRow}>
        {PRESENCE_GEOFENCE_RADIUS_OPTIONS.map((radius) => {
          const active = presenceGeofenceRadiusM === radius;
          return (
            <Pressable
              key={radius}
              style={chipStyle(active)}
              onPress={() => handlePresenceRadiusSelect(radius)}
            >
              <Text style={chipTextStyle(active)}>{radius}m</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={cardHintTextStyle}>{presenceSummaryText}</Text>
      <View style={styles.utilityActionGroup}>
        <Pressable
          style={[
            styles.avatarBtn,
            presenceGeofenceBusy && secondaryButtonDisabledStyle,
          ]}
          onPress={handleSetCurrentLocationAsHome}
          disabled={presenceGeofenceBusy}
        >
          <Ionicons
            name={presenceGeofenceBusy ? "time-outline" : "locate-outline"}
            size={Math.round(16 * scale)}
            color={theme.colors.text}
          />
          <Text style={secondaryBtnTextStyle}>{presenceActionLabel}</Text>
        </Pressable>
        {presenceGeofenceEnabled ? (
          <Pressable
            style={[styles.avatarBtn, styles.avatarBtnGhost]}
            onPress={handleDisableHomeZone}
          >
            <Ionicons
              name="pause-circle-outline"
              size={Math.round(16 * scale)}
              color={theme.colors.subtext}
            />
            <Text style={secondaryBtnTextStyle}>Pause home zone</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable style={styles.rowAction}>
        <Text style={rowActionTextStyle}>Manage trusted devices</Text>
        <Ionicons
          name="chevron-forward"
          size={Math.round(16 * scale)}
          color={theme.colors.subtext}
        />
      </Pressable>
    </View>,
    <View key="updates-reports" style={cardBaseStyle}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={sectionTitleTextStyle}>Updates & reports</Text>
          <Text style={sectionSubTextStyle}>Stay in sync automatically</Text>
        </View>
        <Ionicons
          name="pulse-outline"
          size={Math.round(18 * scale)}
          color={theme.colors.subtext}
        />
      </View>
      {reportItems.map((item, index) => (
        <View
          key={item.id}
          style={settingRowStyle(index < reportItems.length - 1)}
        >
          <View style={styles.settingText}>
            <Text style={settingLabelTextStyle}>{item.label}</Text>
            <Text style={settingSubTextStyle}>{item.sub}</Text>
          </View>
          <Switch
            value={item.value}
            onValueChange={item.onChange}
            thumbColor={
              item.value ? theme.colors.accent : "rgba(255,255,255,0.8)"
            }
            trackColor={{
              true: "rgba(180,107,255,0.45)",
              false: "rgba(255,255,255,0.24)",
            }}
            style={switchScaleStyle}
          />
        </View>
      ))}
      <Pressable style={styles.rowAction}>
        <Text style={rowActionTextStyle}>View weekly report</Text>
        <Ionicons
          name="chevron-forward"
          size={Math.round(16 * scale)}
          color={theme.colors.subtext}
        />
      </Pressable>
    </View>,
    pendingInvitesCard,
    <View key="household" style={cardBaseStyle}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={sectionTitleTextStyle}>Household</Text>
          <Text style={sectionSubTextStyle}>
            {household.length} members connected
          </Text>
        </View>
        <Ionicons
          name="people-outline"
          size={Math.round(18 * scale)}
          color={theme.colors.subtext}
        />
      </View>
      {household.map((member) => (
        <View key={member.id} style={styles.memberBlock}>
          <View style={styles.memberRow}>
            <AvatarChip
              name={member.name}
              size={Math.round(36 * scale)}
              color={member.avatarColor}
              uri={member.avatarUri}
            />
            <View style={flex1Style}>
              <Text style={memberNameTextStyle}>{member.name}</Text>
              <Text style={memberRoleTextStyle}>{member.role}</Text>
            </View>
            <View style={styles.memberBadge}>
              <Text style={memberBadgeTextStyle}>
                {member.status === "home" ? "Home" : "Away"}
              </Text>
            </View>
            <Pressable
              style={styles.memberRemove}
              onPress={() => {
                if (!canManageHousehold || member.role === "Owner") return;
                removeHouseholdMember(member.id);
              }}
              hitSlop={8}
              disabled={!canManageHousehold || member.role === "Owner"}
            >
              <Ionicons
                name="close"
                size={Math.round(14 * scale)}
                color={theme.colors.subtext}
              />
            </Pressable>
          </View>
          {member.role === "Guest" || member.role === "Tenant" ? (
            <View style={styles.memberAccess}>
              <Text style={cardHintTextStyle}>Room access</Text>
              {canManageRooms ? (
                <View style={styles.chipRow}>
                  {rooms.map((room) => {
                    const currentRoomIds =
                      roomMembers.find((entry) => entry.memberId === member.id)
                        ?.roomIds ?? [];
                    const assigned = currentRoomIds.includes(room.id);
                    return (
                      <Pressable
                        key={`${member.id}-${room.id}`}
                        style={chipStyle(Boolean(assigned))}
                        onPress={() => {
                          if (!canManageRooms) return;
                          const nextRoomIds = assigned
                            ? currentRoomIds.filter((id) => id !== room.id)
                            : [...currentRoomIds, room.id];
                          void updateRoomAccess(
                            member.id,
                            member.userId,
                            member.role,
                            currentRoomIds,
                            nextRoomIds,
                          );
                        }}
                        disabled={!canManageRooms}
                      >
                        <Text style={chipTextStyle(Boolean(assigned))}>
                          {room.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.memberAccessText}>
                  {(roomMembers
                    .find((entry) => entry.memberId === member.id)
                    ?.roomIds.map(
                      (id) => rooms.find((room) => room.id === id)?.name,
                    )
                    .filter(Boolean) as string[]).join(", ") || "No rooms"}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      ))}

      <View style={styles.addMemberCard}>
        <Text style={cardHintTextStyle}>Add person</Text>
        {!canManageHousehold ? (
          <Text style={styles.readOnlyNote}>
            Only admins can add or remove members.
          </Text>
        ) : null}
        <TextInput
          value={newMemberName}
          onChangeText={setNewMemberName}
          placeholder="Full name"
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={inputFieldStyle}
          editable={canManageHousehold}
        />
        <TextInput
          value={newMemberEmail}
          onChangeText={setNewMemberEmail}
          placeholder="Email address"
          placeholderTextColor="rgba(255,255,255,0.45)"
          style={inputFieldStyle}
          editable={canManageHousehold}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <View style={styles.chipRow}>
          {(["Owner", "Admin", "Member", "Guest", "Tenant"] as const).map(
            (role) => {
            const active = newMemberRole === role;
            return (
              <Pressable
                key={role}
                style={chipStyle(active)}
                onPress={() => setNewMemberRole(role)}
                disabled={!canManageHousehold}
              >
                <Text style={chipTextStyle(active)}>
                  {role}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.avatarActions}>
          <Pressable
            style={styles.avatarBtn}
            onPress={pickHouseholdAvatar}
            disabled={!canManageHousehold}
          >
            <Ionicons
              name="image-outline"
              size={Math.round(16 * scale)}
              color={theme.colors.text}
            />
            <Text style={avatarBtnTextStyle}>
              {newMemberAvatar ? "Change photo" : "Add photo"}
            </Text>
          </Pressable>
          {newMemberAvatar ? (
            <Pressable
              style={avatarBtnGhostStyle}
              onPress={() => setNewMemberAvatar("")}
              disabled={!canManageHousehold}
            >
              <Ionicons
                name="close"
                size={Math.round(16 * scale)}
                color={theme.colors.subtext}
              />
              <Text style={avatarBtnTextStyle}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={secondaryButtonStyle(
            inviteLoading ||
              !canManageHousehold ||
              !newMemberName.trim() ||
              !newMemberEmail.trim(),
          )}
          onPress={handleAddMember}
          disabled={
            inviteLoading ||
            !canManageHousehold ||
            !newMemberName.trim() ||
            !newMemberEmail.trim()
          }
        >
          <Ionicons
            name="person-add"
            size={Math.round(16 * scale)}
            color={theme.colors.text}
          />
          <Text style={secondaryBtnTextStyle}>Add person</Text>
        </Pressable>
      </View>
    </View>,
    <View key="sign-out" style={cardBaseStyle}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={sectionTitleTextStyle}>Account</Text>
          <Text style={sectionSubTextStyle}>
            End your current session
          </Text>
        </View>
        <Ionicons
          name="log-out-outline"
          size={Math.round(18 * scale)}
          color={theme.colors.subtext}
        />
      </View>
      <Pressable
        style={[styles.rowAction, styles.signOutAction]}
        onPress={handleSignOut}
      >
        <Text style={[rowActionTextStyle, styles.signOutText]}>Sign out</Text>
        <Ionicons
          name="log-out-outline"
          size={Math.round(16 * scale)}
          color="#B74B5A"
        />
      </Pressable>
    </View>,
  ].filter(Boolean) as React.ReactNode[];

  const orderedCards = profileCards.map((card, index) => ({
    card,
    weight: 1,
    index,
  }));
  const cardColumnBuckets = Array.from({ length: columnCount }, () => ({
    weight: 0,
    cards: [] as React.ReactNode[],
  }));
  orderedCards.forEach((item) => {
    const target = cardColumnBuckets.reduce(
      (lightest, column) =>
        column.weight < lightest.weight ? column : lightest,
      cardColumnBuckets[0],
    );
    target.cards.push(item.card);
    target.weight += item.weight;
  });
  const cardColumns = cardColumnBuckets.map((column) => column.cards);

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <View
        style={contentStyle}
      >
        <View style={styles.frameWrap}>
          <FrameComponent
            enabled={frameEnabled}
            width="100%"
            pad={isWide ? 0 : framePad}
            radius={frameRadius}
            style={frameStyle}
          >
            <View style={styles.frameInner}>
              <View style={headerWrapStyle}>
                <View style={headerRowStyle}>
                  <View style={headerSlotStyle}>
                    <Pressable
                      style={iconButtonStyle}
                      onPress={() => navigation.goBack()}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={20}
                        color={theme.colors.text}
                      />
                    </Pressable>
                  </View>
                  <View style={styles.headerTitleWrap}>
                    <Text style={titleTextStyle}>Profile</Text>
                  </View>
                  <View style={headerSlotStyle} />
                </View>
              </View>

              {isWide ? (
                <View style={styles.headerDividerWrap}>
                  <View style={styles.headerDivider} />
                </View>
              ) : null}

                <ScrollView
                  style={styles.sectionsScroll}
                  contentContainerStyle={scrollContentStyle}
                  showsVerticalScrollIndicator={false}
                >
                <View style={heroCardStyle}>
                  <LinearGradient
                    colors={[
                      "rgba(122,92,255,0.22)",
                      "rgba(255,255,255,0.06)",
                    ]}
                    start={{ x: 0.1, y: 0.1 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroBackdrop}
                    pointerEvents="none"
                  />
                  <View style={styles.heroGlow} pointerEvents="none" />
                  <View style={styles.heroGlowSecondary} pointerEvents="none" />
                  <View style={heroContentStyle}>
                    <View style={heroLayoutStyle}>
                      <View
                        style={heroIdentityPanelStyle}
                      >
                        <View style={heroIdentityRowStyle}>
                          <View style={styles.heroAvatarWrap}>
                            <View style={heroAvatarHaloStyle} />
                            <View style={styles.heroAvatarRing}>
                              <AvatarChip
                                name={name || "Vanta Home"}
                                size={avatarSize}
                                color={avatarColor}
                                uri={avatarUri}
                              />
                            </View>
                          </View>
                          <View style={styles.heroIdentityText}>
                            <Text style={heroNameTextStyle}>
                              {name || profile.name || "Vanta Home"}
                            </Text>
                            <Text style={heroSubTextStyle}>
                              {homeName || profile.homeName || "Vanta Home"}
                            </Text>
                            <View style={styles.heroBadges}>
                              <View style={styles.badgePill}>
                                <Ionicons
                                  name="ribbon-outline"
                                  size={Math.round(12 * scale)}
                                  color={theme.colors.text}
                                />
                                <Text style={badgeTextStyle}>Owner</Text>
                              </View>
                              <View style={styles.badgePill}>
                                <Ionicons
                                  name={
                                    email.trim()
                                      ? "checkmark-circle"
                                      : "alert-circle"
                                  }
                                  size={Math.round(12 * scale)}
                                  color={
                                    email.trim()
                                      ? "rgba(122,92,255,0.9)"
                                      : "rgba(255,190,120,0.9)"
                                  }
                                />
                                <Text style={badgeTextStyle}>
                                  {email.trim() ? "Email verified" : "Add email"}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      </View>

                      <View
                        style={heroMetaPanelStyle}
                      >
                        <View style={styles.heroStatsRow}>
                          {[
                            { label: "Rooms", value: roomsCount },
                            { label: "Devices", value: devicesCount },
                            { label: "Household", value: household.length },
                          ].map((stat) => (
                            <View
                              key={stat.label}
                              style={statPillStyle}
                            >
                              <Text style={statTextStyle}>
                                {stat.label} {stat.value}
                              </Text>
                            </View>
                          ))}
                        </View>

                        <View style={styles.progressWrap}>
                          <View style={styles.progressTrack}>
                            <View style={progressFillStyle} />
                          </View>
                          <View style={styles.progressMeta}>
                            <Text style={progressTextStyle}>
                              Profile {completionPct}% complete
                            </Text>
                            <Text style={progressTextStyle}>
                              {completionCount}/{completionSteps.length}
                            </Text>
                          </View>
                        </View>

                        <Text style={heroHintTextStyle}>
                          Add a photo or pick a glow color for your avatar.
                        </Text>
                      </View>

                      <View
                        style={heroActionsPanelStyle}
                      >
                        <View style={styles.heroActionGroup}>
                          <Pressable
                            style={styles.avatarBtn}
                            onPress={pickAvatar}
                          >
                            <Ionicons
                              name="cloud-upload-outline"
                              size={Math.round(16 * scale)}
                              color={theme.colors.text}
                            />
                            <Text style={avatarBtnTextStyle}>
                              Upload photo
                            </Text>
                          </Pressable>
                          {avatarUri ? (
                            <Pressable
                              style={avatarBtnGhostStyle}
                              onPress={() => setAvatarUri("")}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={Math.round(16 * scale)}
                                color={theme.colors.subtext}
                              />
                              <Text style={avatarBtnTextStyle}>Remove</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={styles.heroSwatchGroup}>
                          <Text style={heroSwatchLabelStyle}>
                            Glow color
                          </Text>
                          <View style={styles.swatchRow}>
                            {[
                              "#B46BFF",
                              "#7A5CFF",
                              "#FF9AA2",
                              "#A0E9FF",
                              "#FFD166",
                              "#A5FF9B",
                            ].map((c) => (
                              <Pressable
                                key={c}
                                onPress={() => setAvatarColor(c)}
                                style={swatchStyleFor(c)}
                              />
                            ))}
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={columnsGridStyle}>
                  {columnCount > 1 ? (
                    <View style={columnsRowStyle}>
                      {cardColumns.map((column, columnIndex) => (
                        <View
                          key={`profile-column-${columnIndex}`}
                          style={columnStackItemStyle}
                        >
                          {column}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={columnStackStyle}>{cardColumns[0]}</View>
                  )}
                </View>

                <View style={saveWrapStyle}>
                  <Pressable
                    style={saveButtonStyle}
                    onPress={onSave}
                    disabled={!name.trim()}
                  >
                    <Text style={saveTextStyle}>Save profile</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </FrameComponent>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, alignItems: "center" },
  frameWrap: { width: "100%", flex: 1 },
  frameFill: { flex: 1, alignSelf: "stretch" },
  frameInner: { width: "100%", flex: 1 },
  sectionsScroll: { flex: 1 },
  headerWrap: { width: "100%" },
  headerDividerWrap: { width: "100%", paddingVertical: 12 },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900" },

  card: {
    width: "100%",
    borderRadius: 24,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.11)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    marginTop: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.16)",
  },
  inviteTitle: { color: theme.colors.text, fontWeight: "800" },
  inviteSub: { color: theme.colors.subtext, marginTop: 4, fontWeight: "700" },
  inviteActions: { flexDirection: "row", gap: 8 },
  inviteActionPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(122,92,255,0.85)",
  },
  inviteActionSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  inviteActionText: { color: theme.colors.text, fontWeight: "800" },
  columnsGrid: { width: "100%", marginTop: 12 },
  columnsRow: { width: "100%", flexDirection: "row", alignItems: "flex-start" },
  columnStack: { alignItems: "stretch", flexShrink: 0 },
  columnCard: { marginTop: 0 },
  fullSpan: { width: "100%", flexBasis: "100%" },
  heroCard: {
    marginTop: 0,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.38)",
    position: "relative",
    overflow: "hidden",
  },
  heroBackdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.9,
  },
  heroGlow: {
    position: "absolute",
    top: -80,
    right: -120,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(122,92,255,0.35)",
  },
  heroGlowSecondary: {
    position: "absolute",
    bottom: -110,
    left: -120,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(180,107,255,0.25)",
  },
  heroContent: { position: "relative", zIndex: 1 },
  heroPanel: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroLayout: {
    width: "100%",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 18,
  },
  heroLayoutLandscape: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  heroIdentity: {
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 8,
  },
  heroIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroIdentityText: {
    flex: 1,
    alignItems: "flex-start",
  },
  heroMeta: {
    width: "100%",
    alignItems: "flex-start",
    gap: 12,
  },
  heroActions: {
    width: "100%",
    alignItems: "flex-start",
    gap: 14,
  },
  heroAvatarWrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  heroAvatarHalo: {
    position: "absolute",
    backgroundColor: "rgba(122,92,255,0.35)",
    shadowColor: "#7A5CFF",
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  heroAvatarRing: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  heroName: {
    color: theme.colors.text,
    fontWeight: "900",
    textAlign: "left",
  },
  heroSub: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "left",
  },
  heroBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    justifyContent: "flex-start",
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  badgeText: { color: theme.colors.text, fontWeight: "800" },
  heroStatsRow: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-start",
  },
  statPill: {
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  statText: {
    color: theme.colors.text,
    fontWeight: "800",
  },
  progressWrap: {
    marginTop: 16,
    gap: 8,
    width: "100%",
    alignItems: "flex-start",
  },
  progressTrack: {
    height: 6,
    width: "100%",
    maxWidth: 520,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(122,92,255,0.9)",
  },
  progressMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  progressText: { color: theme.colors.subtext, fontWeight: "700" },
  hint: { color: theme.colors.subtext, fontWeight: "700", fontSize: 12 },
  heroHint: { textAlign: "left" },
  heroActionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-start",
  },
  heroSwatchGroup: { alignItems: "flex-start", gap: 6 },
  heroSwatchLabel: { color: theme.colors.subtext, fontWeight: "700" },
  avatarActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  avatarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  avatarBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  avatarBtnText: { color: theme.colors.text, fontWeight: "800" },
  swatchRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },
  formGrid: { gap: 12 },
  formColumn: { flexShrink: 0 },
  label: { color: theme.colors.subtext, fontWeight: "800", marginTop: 10 },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: "900",
    marginBottom: 10,
  },
  sectionTitleTight: { marginBottom: 2 },
  sectionSub: { color: theme.colors.subtext, fontWeight: "700" },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardHint: { color: theme.colors.subtext, fontWeight: "700", marginBottom: 6 },
  input: {
    marginTop: 6,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    color: theme.colors.text,
    fontWeight: "800",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  utilityActionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "rgba(180,107,255,0.32)",
    borderColor: "rgba(180,107,255,0.45)",
  },
  chipText: { color: theme.colors.subtext, fontWeight: "800" },
  chipTextActive: { color: theme.colors.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  rowLabel: { color: theme.colors.subtext, fontWeight: "800" },
  rowValue: { color: theme.colors.text, fontWeight: "800" },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  settingRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  settingText: { flex: 1, paddingRight: 12 },
  settingLabel: { color: theme.colors.text, fontWeight: "800" },
  settingSub: { color: theme.colors.subtext, fontWeight: "700", marginTop: 2 },
  rowAction: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  rowActionText: { color: theme.colors.text, fontWeight: "800" },
  signOutAction: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: "rgba(183,75,90,0.35)",
  },
  signOutText: { color: "#B74B5A" },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  serviceIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  servicePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  servicePillDisabled: { opacity: 0.6 },
  servicePillActive: {
    backgroundColor: "rgba(122,92,255,0.18)",
    borderColor: "rgba(122,92,255,0.45)",
  },
  servicePillText: { color: theme.colors.subtext, fontWeight: "800" },
  servicePillTextActive: { color: theme.colors.text },
  memberBlock: { marginTop: 6 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  memberAccess: {
    paddingBottom: 8,
    paddingLeft: 48,
  },
  memberAccessText: {
    color: theme.colors.subtext,
    marginTop: 6,
    fontWeight: "700",
  },
  memberSwitcher: { marginTop: 10 },
  readOnlyNote: {
    color: theme.colors.subtext,
    fontWeight: "700",
    marginTop: 6,
  },
  memberRemove: {
    marginLeft: 6,
    padding: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  memberName: { color: theme.colors.text, fontWeight: "900" },
  memberRole: { color: theme.colors.subtext, fontWeight: "700" },
  memberBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  memberBadgeText: { color: theme.colors.text, fontWeight: "800" },
  addMemberCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  secondaryBtnText: { color: theme.colors.text, fontWeight: "800" },
  save: {
    marginTop: 18,
    height: 50,
    borderRadius: 16,
    backgroundColor: "rgba(180,107,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  saveText: { color: "#fff", fontWeight: "900" },
  fullFrame: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.24)",
    shadowOpacity: 0.04,
  },
});
