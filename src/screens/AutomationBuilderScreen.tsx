import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Pressable from "../components/Pressable";
import BackgroundLines from "../components/BackgroundLines";
import ModalCard from "../components/ModalCard";
import ModalField from "../components/ModalField";
import { theme } from "../theme/theme";
import {
  AC_TEMP_MAX_C,
  AC_TEMP_MIN_C,
  selectVisibleDevices,
  selectVisibleRooms,
  useHomeStore,
  type AutomationFlow,
  type Device,
  type FlowAction,
  type FlowCondition,
  type FlowLeafAction,
  type FlowTrigger,
  type Weekday,
} from "../store/useHomeStore";
import { useResponsive } from "../theme/layout";
import type { RootStackParamList } from "../app/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "AutomationBuilder">;
type EditorSection = "trigger" | "condition" | "action";

const TRIGGER_TYPES = [
  { id: "time", label: "Time" },
  { id: "device", label: "Device" },
  { id: "presence", label: "Presence" },
  { id: "scene", label: "Scene" },
] as const;

const CONDITION_TYPES = [
  { id: "time-range", label: "Time Range" },
  { id: "device", label: "Device" },
  { id: "day", label: "Days" },
  { id: "household", label: "Household" },
  { id: "sun", label: "Sun" },
  { id: "open-for", label: "Open For" },
] as const;

const ACTION_TYPES = [
  { id: "toggle", label: "Toggle" },
  { id: "patch", label: "Patch" },
  { id: "set-ac", label: "Set AC" },
  { id: "set-brightness", label: "Brightness" },
  { id: "run-scene", label: "Run Scene" },
  { id: "delay", label: "Delay" },
  { id: "notify", label: "Notify" },
  { id: "branch", label: "Branch" },
] as const;

const WEEK_DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DELAY_PRESETS = [5, 15, 30, 60, 120, 300];
const OPEN_DURATION_PRESETS = [5, 10, 15, 30];
const PATCH_OPEN_PRESETS = [0, 25, 50, 100];
const DEVICE_STATE_OPTIONS: Array<{
  value: Extract<Extract<FlowTrigger, { type: "device" }>["state"], string>;
  label: string;
}> = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];
const HOUSEHOLD_MATCH_OPTIONS: Array<{
  value: Extract<Extract<FlowCondition, { type: "household" }>["match"], string>;
  label: string;
}> = [
  { value: "everyone-away", label: "Everyone away" },
  { value: "everyone-home", label: "Everyone home" },
  { value: "someone-home", label: "Someone home" },
];
const SUN_RELATION_OPTIONS: Array<{
  value: Extract<Extract<FlowCondition, { type: "sun" }>["relation"], string>;
  label: string;
}> = [
  { value: "after-sunset", label: "After sunset" },
  { value: "before-sunrise", label: "Before sunrise" },
];
const BRANCH_CONDITION_TYPES = [
  { id: "device", label: "Device" },
  { id: "household", label: "Household" },
  { id: "sun", label: "Sun" },
  { id: "open-for", label: "Open For" },
] as const;
const BRANCH_ACTION_TYPES = [
  { id: "run-scene", label: "Run Scene" },
  { id: "notify", label: "Notify" },
  { id: "delay", label: "Delay" },
  { id: "patch", label: "Patch" },
] as const;

type DeviceMatchState = Extract<
  Extract<FlowTrigger, { type: "device" }>["state"],
  string
>;
type HouseholdMatch = Extract<
  Extract<FlowCondition, { type: "household" }>["match"],
  string
>;
type SunRelation = Extract<
  Extract<FlowCondition, { type: "sun" }>["relation"],
  string
>;
type BranchConditionType = (typeof BRANCH_CONDITION_TYPES)[number]["id"];
type BranchActionType = (typeof BRANCH_ACTION_TYPES)[number]["id"];

type BranchActionDraft = {
  type: BranchActionType;
  deviceId: string;
  sceneId: string;
  delaySeconds: number;
  message: string;
  patchOpenPercent: number;
  patchArmed: boolean;
  patchRecording: boolean;
  patchMotionAlerts: boolean;
};

const createBranchActionDraft = (): BranchActionDraft => ({
  type: "run-scene",
  deviceId: "",
  sceneId: "",
  delaySeconds: 15,
  message: "Automation branch matched.",
  patchOpenPercent: 0,
  patchArmed: true,
  patchRecording: true,
  patchMotionAlerts: true,
});

export default function AutomationBuilderScreen({ navigation, route }: Props) {
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(920);
  const flowId = route.params?.flowId;
  const titleSize = Math.round((isTablet ? 28 : 24) * scale);
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const cardPad = Math.round((isTablet ? 18 : 16) * scale);
  const cardRadius = Math.round((isTablet ? 26 : 22) * scale);
  const inputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const inputRadius = Math.round(inputHeight * 0.28);
  const buttonHeight = Math.round((isTablet ? 42 : 38) * scale);
  const buttonRadius = Math.round(buttonHeight / 2);
  const chipHeight = Math.round((isTablet ? 34 : 30) * scale);
  const chipRadius = Math.round(chipHeight / 2);
  const sectionTitleSize = Math.round((isTablet ? 16 : 14) * scale);
  const sectionSubSize = Math.round((isTablet ? 13 : 12) * scale);
  const itemRowRadius = Math.round(cardRadius * 0.6);
  const itemRowStyle: StyleProp<ViewStyle> = [
    styles.itemRow,
    { borderRadius: itemRowRadius },
  ];
  const flex1Style: StyleProp<ViewStyle> = { flex: 1 };
  const itemLabelStyle: StyleProp<TextStyle> = [
    styles.itemLabel,
    { fontSize: labelSize },
  ];
  const itemValueStyle: StyleProp<TextStyle> = [
    styles.itemValue,
    { fontSize: sectionSubSize },
  ];
  const headerStyle: StyleProp<ViewStyle> = [
    styles.header,
    {
      paddingHorizontal: gutter,
      paddingTop: topPad,
      width: contentWidth,
      alignSelf: "center",
    },
  ];
  const headerButtonStyle: StyleProp<ViewStyle> = [
    styles.headerBtn,
    { height: buttonHeight, borderRadius: buttonRadius },
  ];
  const headerSaveButtonStyle = (disabled: boolean): StyleProp<ViewStyle> => [
    styles.headerBtn,
    styles.saveBtn,
    { height: buttonHeight, borderRadius: buttonRadius },
    disabled && styles.saveBtnDisabled,
  ];
  const headerTitleStyle: StyleProp<TextStyle> = [
    styles.headerTitle,
    { fontSize: titleSize },
  ];
  const contentStyle: StyleProp<ViewStyle> = [
    styles.content,
    {
      paddingBottom: Math.round(
        (isTablet ? (isLandscape ? 120 : 140) : 120) * scale,
      ),
    },
  ];
  const contentWrapStyle: StyleProp<ViewStyle> = {
    width: contentWidth,
    alignSelf: "center",
    paddingHorizontal: gutter,
  };
  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    { padding: cardPad, borderRadius: cardRadius },
  ];
  const sectionCardStyle: StyleProp<ViewStyle> = [
    styles.sectionCard,
    { padding: cardPad, borderRadius: cardRadius },
  ];
  const sectionTitleStyle: StyleProp<TextStyle> = [
    styles.sectionTitle,
    { fontSize: sectionTitleSize },
  ];
  const sectionSubStyle: StyleProp<TextStyle> = [
    styles.sectionSub,
    { fontSize: sectionSubSize },
  ];
  const inputLabelStyle: StyleProp<TextStyle> = [
    styles.inputLabel,
    { fontSize: labelSize },
  ];
  const inputStyle: StyleProp<TextStyle> = [
    styles.input,
    { height: inputHeight, borderRadius: inputRadius },
  ];
  const switchScaleStyle: StyleProp<ViewStyle> = {
    transform: [{ scale: isTablet ? 1.05 : 1 }],
  };
  const addButtonStyle: StyleProp<ViewStyle> = [
    styles.addBtn,
    { height: chipHeight, borderRadius: chipRadius },
  ];
  const addButtonTextStyle: StyleProp<TextStyle> = [
    styles.addBtnText,
    { fontSize: labelSize },
  ];
  const deleteButtonStyle: StyleProp<ViewStyle> = [
    styles.deleteBtn,
    { height: buttonHeight },
  ];
  const deleteTextStyle: StyleProp<TextStyle> = [
    styles.deleteText,
    { fontSize: labelSize },
  ];
  const modalCardStyle: StyleProp<ViewStyle> = [
    styles.modalCard,
    {
      padding: cardPad,
      borderRadius: Math.round(cardRadius * 0.9),
      width: isTablet ? Math.min(contentWidth - gutter * 2, 580) : undefined,
      alignSelf: "center",
    },
  ];
  const modalTitleStyle: StyleProp<TextStyle> = [
    styles.modalTitle,
    { fontSize: sectionTitleSize },
  ];
  const typeChipStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.typeChip,
    { height: chipHeight, borderRadius: chipRadius },
    active && styles.typeChipActive,
  ];
  const typeChipTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.typeChipText,
    active && styles.typeChipTextActive,
  ];
  const choiceChipStyle = (active: boolean): StyleProp<ViewStyle> => [
    styles.choiceChip,
    { height: chipHeight, borderRadius: chipRadius },
    active && styles.choiceChipActive,
  ];
  const choiceChipTextStyle = (active: boolean): StyleProp<TextStyle> => [
    styles.choiceChipText,
    active && styles.choiceChipTextActive,
  ];
  const modalScrollStyle: StyleProp<ViewStyle> = { maxHeight: 360 };
  const modalButtonStyle: StyleProp<ViewStyle> = [
    styles.modalBtn,
    { height: buttonHeight, borderRadius: buttonRadius },
  ];
  const modalButtonTextStyle: StyleProp<TextStyle> = [
    styles.modalBtnText,
    { fontSize: labelSize },
  ];

  const flows = useHomeStore((s) => s.flows);
  const addFlow = useHomeStore((s) => s.addFlow);
  const updateFlow = useHomeStore((s) => s.updateFlow);
  const removeFlow = useHomeStore((s) => s.removeFlow);
  const devices = useHomeStore(selectVisibleDevices);
  const visibleRooms = useHomeStore(selectVisibleRooms);
  const scenes = useHomeStore((s) => s.scenes);
  const household = useHomeStore((s) => s.household);

  const existing = flows.find((f) => f.id === flowId);
  const isEditing = Boolean(existing);

  const [name, setName] = useState(existing?.name ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [triggers, setTriggers] = useState<FlowTrigger[]>(
    existing?.triggers ?? [],
  );
  const [conditions, setConditions] = useState<FlowCondition[]>(
    existing?.conditions ?? [],
  );
  const [actions, setActions] = useState<FlowAction[]>(existing?.actions ?? []);

  const [editorSection, setEditorSection] = useState<EditorSection | null>(
    null,
  );
  const [editorType, setEditorType] = useState<string>("time");
  const [draftTime, setDraftTime] = useState({ hour: "07", minute: "00" });
  const [draftRange, setDraftRange] = useState({
    startHour: "18",
    startMinute: "00",
    endHour: "23",
    endMinute: "00",
  });
  const [draftDeviceId, setDraftDeviceId] = useState("");
  const [draftDeviceMatchState, setDraftDeviceMatchState] =
    useState<DeviceMatchState>("on");
  const [draftToggleOn, setDraftToggleOn] = useState(true);
  const [draftSceneId, setDraftSceneId] = useState("");
  const [draftMemberId, setDraftMemberId] = useState("");
  const [draftPresenceStatus, setDraftPresenceStatus] = useState<
    "home" | "away"
  >("home");
  const [draftDays, setDraftDays] = useState<Weekday[]>([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
  ]);
  const [draftBrightness, setDraftBrightness] = useState(60);
  const [draftTemp, setDraftTemp] = useState(22);
  const [draftDelaySeconds, setDraftDelaySeconds] = useState(10);
  const [draftMessage, setDraftMessage] = useState("Someone arrived.");
  const [draftHouseholdMatch, setDraftHouseholdMatch] =
    useState<HouseholdMatch>("everyone-away");
  const [draftSunRelation, setDraftSunRelation] =
    useState<SunRelation>("after-sunset");
  const [draftOpenMinutes, setDraftOpenMinutes] = useState(10);
  const [draftPatchOpenPercent, setDraftPatchOpenPercent] = useState(0);
  const [draftPatchArmed, setDraftPatchArmed] = useState(true);
  const [draftPatchRecording, setDraftPatchRecording] = useState(true);
  const [draftPatchMotionAlerts, setDraftPatchMotionAlerts] = useState(true);
  const [draftBranchConditionType, setDraftBranchConditionType] =
    useState<BranchConditionType>("household");
  const [draftBranchConditionDeviceId, setDraftBranchConditionDeviceId] =
    useState("");
  const [draftBranchConditionDeviceState, setDraftBranchConditionDeviceState] =
    useState<DeviceMatchState>("open");
  const [draftBranchConditionHouseholdMatch, setDraftBranchConditionHouseholdMatch] =
    useState<HouseholdMatch>("everyone-away");
  const [draftBranchConditionSunRelation, setDraftBranchConditionSunRelation] =
    useState<SunRelation>("after-sunset");
  const [draftBranchConditionOpenDeviceId, setDraftBranchConditionOpenDeviceId] =
    useState("");
  const [draftBranchConditionOpenMinutes, setDraftBranchConditionOpenMinutes] =
    useState(10);
  const [draftBranchIfAction, setDraftBranchIfAction] =
    useState<BranchActionDraft>(createBranchActionDraft);
  const [draftBranchElseEnabled, setDraftBranchElseEnabled] = useState(true);
  const [draftBranchElseAction, setDraftBranchElseAction] =
    useState<BranchActionDraft>(createBranchActionDraft);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setEnabled(existing.enabled);
    setTriggers(existing.triggers);
    setConditions(existing.conditions);
    setActions(existing.actions);
  }, [existing]);

  const deviceMap = useMemo(
    () => new Map(devices.map((d) => [d.id, d])),
    [devices],
  );
  const accessibleScenes = useMemo(() => {
    const roomIds = new Set(visibleRooms.map((room) => room.id));
    return scenes.filter((scene) => roomIds.has(scene.roomId));
  }, [scenes, visibleRooms]);
  const sceneMap = useMemo(
    () => new Map(accessibleScenes.map((s) => [s.id, s])),
    [accessibleScenes],
  );
  const memberMap = useMemo(
    () => new Map(household.map((m) => [m.id, m])),
    [household],
  );

  const acDevices = useMemo(
    () => devices.filter((d) => d.kind === "ac"),
    [devices],
  );
  const lightDevices = useMemo(
    () => devices.filter((d) => d.kind === "light"),
    [devices],
  );
  const openableDevices = useMemo(
    () =>
      devices.filter((device) =>
        ["door", "window", "garage", "gate"].includes(device.kind),
      ),
    [devices],
  );
  const patchableDevices = useMemo(
    () =>
      devices.filter((device) =>
        ["door", "window", "garage", "gate", "camera"].includes(device.kind),
      ),
    [devices],
  );

  const flowName =
    name.trim() || (isEditing ? (existing?.name ?? "Flow") : "New Flow");
  const canSave = triggers.length > 0 && actions.length > 0;

  const openEditor = (section: EditorSection) => {
    setEditorSection(section);
    const type =
      section === "trigger"
        ? TRIGGER_TYPES[0].id
        : section === "condition"
          ? CONDITION_TYPES[0].id
          : ACTION_TYPES[0].id;
    setEditorType(type);
    setDraftTime({ hour: "07", minute: "00" });
    setDraftRange({
      startHour: "18",
      startMinute: "00",
      endHour: "23",
      endMinute: "00",
    });
    setDraftDeviceMatchState("on");
    setDraftToggleOn(true);
    setDraftPresenceStatus("home");
    setDraftDays(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    setDraftBrightness(60);
    setDraftTemp(22);
    setDraftDelaySeconds(10);
    setDraftMessage("Someone arrived.");
    setDraftHouseholdMatch("everyone-away");
    setDraftSunRelation("after-sunset");
    setDraftOpenMinutes(10);
    setDraftPatchOpenPercent(0);
    setDraftPatchArmed(true);
    setDraftPatchRecording(true);
    setDraftPatchMotionAlerts(true);
    setDraftBranchConditionType("household");
    setDraftBranchConditionDeviceState("open");
    setDraftBranchConditionHouseholdMatch("everyone-away");
    setDraftBranchConditionSunRelation("after-sunset");
    setDraftBranchConditionOpenMinutes(10);
    setDraftBranchIfAction(createBranchActionDraft());
    setDraftBranchElseEnabled(true);
    setDraftBranchElseAction(createBranchActionDraft());

    const firstDevice = devices[0]?.id ?? "";
    const firstOpenableDevice = openableDevices[0]?.id ?? firstDevice;
    const firstPatchableDevice = patchableDevices[0]?.id ?? firstDevice;
    const firstScene = accessibleScenes[0]?.id ?? "";
    const firstMember = household[0]?.id ?? "";
    setDraftDeviceId(firstDevice);
    setDraftSceneId(firstScene);
    setDraftMemberId(firstMember);
    setDraftBranchConditionDeviceId(firstDevice);
    setDraftBranchConditionOpenDeviceId(firstOpenableDevice);
    setDraftBranchIfAction((prev) => ({
      ...prev,
      deviceId: firstPatchableDevice,
      sceneId: firstScene,
    }));
    setDraftBranchElseAction((prev) => ({
      ...prev,
      deviceId: firstPatchableDevice,
      sceneId: firstScene,
    }));
  };

  useEffect(() => {
    if (!editorSection) return;
    if (editorSection !== "action") return;
    const options =
      editorType === "set-ac"
        ? acDevices
        : editorType === "set-brightness"
          ? lightDevices
          : editorType === "patch"
            ? patchableDevices
            : editorSection === "condition" && editorType === "open-for"
              ? openableDevices
          : devices;
    if (!options.length) return;
    if (!options.find((d) => d.id === draftDeviceId)) {
      setDraftDeviceId(options[0].id);
    }
  }, [
    editorSection,
    editorType,
    devices,
    acDevices,
    lightDevices,
    openableDevices,
    patchableDevices,
    draftDeviceId,
  ]);

  const clamp = (value: number, min: number, max: number) => {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  };
  const parseTime = (hour: string, minute: string) => {
    const h = clamp(parseInt(hour || "0", 10), 0, 23);
    const m = clamp(parseInt(minute || "0", 10), 0, 59);
    return { hour: h, minute: m };
  };
  const buildPatchForDevice = (
    deviceId: string,
    patch: {
      openPercent: number;
      armed: boolean;
      recording: boolean;
      motionAlerts: boolean;
    },
  ) => {
    const device = deviceMap.get(deviceId);
    if (!device) return null;
    if (["door", "window", "garage", "gate"].includes(device.kind)) {
      const openPercent = clamp(patch.openPercent, 0, 100);
      return {
        openPercent,
        isOn: openPercent > 0,
      } satisfies Partial<Device>;
    }
    if (device.kind === "camera") {
      return {
        armed: patch.armed,
        recording: patch.recording,
        motionAlerts: patch.motionAlerts,
        isOn: patch.armed || patch.recording || patch.motionAlerts,
      } satisfies Partial<Device>;
    }
    return null;
  };
  const buildBranchCondition = (): FlowCondition | null => {
    if (draftBranchConditionType === "device" && draftBranchConditionDeviceId) {
      return {
        type: "device",
        deviceId: draftBranchConditionDeviceId,
        state: draftBranchConditionDeviceState,
      };
    }
    if (draftBranchConditionType === "household") {
      return {
        type: "household",
        match: draftBranchConditionHouseholdMatch,
      };
    }
    if (draftBranchConditionType === "sun") {
      return {
        type: "sun",
        relation: draftBranchConditionSunRelation,
      };
    }
    if (
      draftBranchConditionType === "open-for" &&
      draftBranchConditionOpenDeviceId
    ) {
      return {
        type: "open-for",
        deviceId: draftBranchConditionOpenDeviceId,
        minutes: clamp(draftBranchConditionOpenMinutes, 1, 120),
      };
    }
    return null;
  };
  const buildBranchLeafAction = (
    draft: BranchActionDraft,
  ): FlowLeafAction | null => {
    if (draft.type === "run-scene" && draft.sceneId) {
      return { type: "run-scene", sceneId: draft.sceneId };
    }
    if (draft.type === "notify") {
      return {
        type: "notify",
        message: draft.message.trim() || "Automation branch matched.",
      };
    }
    if (draft.type === "delay") {
      return {
        type: "delay",
        seconds: clamp(draft.delaySeconds, 1, 600),
      };
    }
    if (draft.type === "patch" && draft.deviceId) {
      const patch = buildPatchForDevice(draft.deviceId, {
        openPercent: draft.patchOpenPercent,
        armed: draft.patchArmed,
        recording: draft.patchRecording,
        motionAlerts: draft.patchMotionAlerts,
      });
      if (!patch) return null;
      return {
        type: "patch",
        deviceId: draft.deviceId,
        patch,
      };
    }
    return null;
  };

  const addItem = () => {
    if (!editorSection) return;
    if (editorSection === "trigger") {
      if (editorType === "time") {
        const { hour, minute } = parseTime(draftTime.hour, draftTime.minute);
        setTriggers((prev) => [...prev, { type: "time", hour, minute }]);
      }
      if (editorType === "device" && draftDeviceId) {
        setTriggers((prev) => [
          ...prev,
          {
            type: "device",
            deviceId: draftDeviceId,
            state: draftDeviceMatchState,
          },
        ]);
      }
      if (editorType === "presence" && draftMemberId) {
        setTriggers((prev) => [
          ...prev,
          {
            type: "presence",
            memberId: draftMemberId,
            status: draftPresenceStatus,
          },
        ]);
      }
      if (editorType === "scene" && draftSceneId) {
        setTriggers((prev) => [
          ...prev,
          { type: "scene", sceneId: draftSceneId },
        ]);
      }
    }

    if (editorSection === "condition") {
      if (editorType === "time-range") {
        const start = parseTime(draftRange.startHour, draftRange.startMinute);
        const end = parseTime(draftRange.endHour, draftRange.endMinute);
        setConditions((prev) => [
          ...prev,
          {
            type: "time-range",
            startHour: start.hour,
            startMinute: start.minute,
            endHour: end.hour,
            endMinute: end.minute,
          },
        ]);
      }
      if (editorType === "device" && draftDeviceId) {
        setConditions((prev) => [
          ...prev,
          {
            type: "device",
            deviceId: draftDeviceId,
            state: draftDeviceMatchState,
          },
        ]);
      }
      if (editorType === "day") {
        const days = draftDays.length ? draftDays : WEEK_DAYS;
        setConditions((prev) => [...prev, { type: "day", days }]);
      }
      if (editorType === "household") {
        setConditions((prev) => [
          ...prev,
          { type: "household", match: draftHouseholdMatch },
        ]);
      }
      if (editorType === "sun") {
        setConditions((prev) => [
          ...prev,
          { type: "sun", relation: draftSunRelation },
        ]);
      }
      if (editorType === "open-for" && draftDeviceId) {
        setConditions((prev) => [
          ...prev,
          {
            type: "open-for",
            deviceId: draftDeviceId,
            minutes: clamp(draftOpenMinutes, 1, 120),
          },
        ]);
      }
    }

    if (editorSection === "action") {
      if (editorType === "toggle" && draftDeviceId) {
        setActions((prev) => [
          ...prev,
          { type: "toggle", deviceId: draftDeviceId, on: draftToggleOn },
        ]);
      }
      if (editorType === "patch" && draftDeviceId) {
        const patch = buildPatchForDevice(draftDeviceId, {
          openPercent: draftPatchOpenPercent,
          armed: draftPatchArmed,
          recording: draftPatchRecording,
          motionAlerts: draftPatchMotionAlerts,
        });
        if (patch) {
          setActions((prev) => [
            ...prev,
            { type: "patch", deviceId: draftDeviceId, patch },
          ]);
        }
      }
      if (editorType === "set-ac" && draftDeviceId) {
        setActions((prev) => [
          ...prev,
          {
            type: "set-ac",
            deviceId: draftDeviceId,
            tempC: clamp(draftTemp, AC_TEMP_MIN_C, AC_TEMP_MAX_C),
            mode: "cold",
          },
        ]);
      }
      if (editorType === "set-brightness" && draftDeviceId) {
        setActions((prev) => [
          ...prev,
          {
            type: "set-brightness",
            deviceId: draftDeviceId,
            brightness: clamp(draftBrightness, 0, 100),
          },
        ]);
      }
      if (editorType === "run-scene" && draftSceneId) {
        setActions((prev) => [
          ...prev,
          { type: "run-scene", sceneId: draftSceneId },
        ]);
      }
      if (editorType === "delay") {
        const seconds = clamp(draftDelaySeconds, 1, 600);
        setActions((prev) => [...prev, { type: "delay", seconds }]);
      }
      if (editorType === "notify") {
        const message = draftMessage.trim() || "Notification";
        setActions((prev) => [...prev, { type: "notify", message }]);
      }
      if (editorType === "branch") {
        const condition = buildBranchCondition();
        const ifAction = buildBranchLeafAction(draftBranchIfAction);
        const elseAction = draftBranchElseEnabled
          ? buildBranchLeafAction(draftBranchElseAction)
          : null;
        if (condition && ifAction) {
          setActions((prev) => [
            ...prev,
            {
              type: "branch",
              condition,
              ifActions: [ifAction],
              ...(elseAction ? { elseActions: [elseAction] } : {}),
            },
          ]);
        }
      }
    }

    setEditorSection(null);
  };

  const handleSave = () => {
    if (!canSave) return;
    const payload: Omit<AutomationFlow, "id"> = {
      name: flowName,
      enabled,
      triggers,
      conditions,
      actions,
    };
    if (isEditing && existing) {
      updateFlow(existing.id, payload);
    } else {
      addFlow(payload);
    }
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!existing) return;
    removeFlow(existing.id);
    navigation.goBack();
  };

  const renderRow = (
    key: string,
    label: string,
    text: string,
    onRemove: () => void,
  ) => (
    <View key={key} style={itemRowStyle}>
      <View style={flex1Style}>
        <Text style={itemLabelStyle}>{label}</Text>
        <Text style={itemValueStyle}>{text}</Text>
      </View>
      <Pressable style={styles.removeBtn} onPress={onRemove}>
        <Ionicons
          name="close"
          size={Math.round(16 * scale)}
          color={theme.colors.text}
        />
      </Pressable>
    </View>
  );

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <BackgroundLines />

      <View style={headerStyle}>
        <Pressable
          style={headerButtonStyle}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="chevron-back"
            size={Math.round(18 * scale)}
            color={theme.colors.text}
          />
        </Pressable>
        <Text style={headerTitleStyle}>
          {isEditing ? "Edit Flow" : "New Flow"}
        </Text>
        <Pressable
          style={headerSaveButtonStyle(!canSave)}
          onPress={handleSave}
          disabled={!canSave}
          testID="automation-save-button"
        >
          <Ionicons
            name="checkmark"
            size={Math.round(18 * scale)}
            color={theme.colors.text}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={contentStyle}>
        <View style={contentWrapStyle}>
          <View style={cardStyle}>
            <Text style={sectionTitleStyle}>Flow details</Text>
            <Text style={sectionSubStyle}>
              Triggers start the flow, conditions filter it, and actions run
              when everything matches.
            </Text>

            <Text style={inputLabelStyle}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="New flow"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={inputStyle}
              testID="automation-name-input"
            />

            <View style={styles.switchRow}>
              <Text style={inputLabelStyle}>Enabled</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                thumbColor={
                  enabled ? theme.colors.accent : "rgba(255,255,255,0.8)"
                }
                trackColor={{
                  true: "rgba(180,107,255,0.45)",
                  false: "rgba(255,255,255,0.24)",
                }}
                style={switchScaleStyle}
              />
            </View>
          </View>

          <View style={sectionCardStyle}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={sectionTitleStyle}>Triggers</Text>
                <Text style={sectionSubStyle}>Start this flow when...</Text>
              </View>
              <Pressable
                style={addButtonStyle}
                onPress={() => openEditor("trigger")}
                testID="automation-add-trigger-button"
              >
                <Ionicons
                  name="add"
                  size={Math.round(16 * scale)}
                  color={theme.colors.text}
                />
                <Text style={addButtonTextStyle}>Add</Text>
              </Pressable>
            </View>
            {triggers.length === 0 ? (
              <Text style={styles.emptyText}>Add a trigger to get started.</Text>
            ) : (
              triggers.map((trigger, index) =>
                renderRow(
                  `trigger-${index}`,
                  "Trigger",
                  describeTrigger(trigger, deviceMap, sceneMap, memberMap),
                  () =>
                    setTriggers((prev) => prev.filter((_, i) => i !== index)),
                ),
              )
            )}
          </View>

          <View style={sectionCardStyle}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={sectionTitleStyle}>Conditions</Text>
                <Text style={sectionSubStyle}>Only run when...</Text>
              </View>
              <Pressable
                style={addButtonStyle}
                onPress={() => openEditor("condition")}
                testID="automation-add-condition-button"
              >
                <Ionicons
                  name="add"
                  size={Math.round(16 * scale)}
                  color={theme.colors.text}
                />
                <Text style={addButtonTextStyle}>Add</Text>
              </Pressable>
            </View>
            {conditions.length === 0 ? (
              <Text style={styles.emptyText}>Optional: add a condition.</Text>
            ) : (
              conditions.map((condition, index) =>
                renderRow(
                  `condition-${index}`,
                  "Condition",
                  describeCondition(condition, deviceMap),
                  () =>
                    setConditions((prev) => prev.filter((_, i) => i !== index)),
                ),
              )
            )}
          </View>

          <View style={sectionCardStyle}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={sectionTitleStyle}>Actions</Text>
                <Text style={sectionSubStyle}>Then do this...</Text>
              </View>
              <Pressable
                style={addButtonStyle}
                onPress={() => openEditor("action")}
                testID="automation-add-action-button"
              >
                <Ionicons
                  name="add"
                  size={Math.round(16 * scale)}
                  color={theme.colors.text}
                />
                <Text style={addButtonTextStyle}>Add</Text>
              </Pressable>
            </View>
            {actions.length === 0 ? (
              <Text style={styles.emptyText}>Add at least one action to run.</Text>
            ) : (
              actions.map((action, index) =>
                renderRow(
                  `action-${index}`,
                  "Action",
                  describeAction(action, deviceMap, sceneMap),
                  () =>
                    setActions((prev) => prev.filter((_, i) => i !== index)),
                ),
              )
            )}
          </View>

          {isEditing && (
            <Pressable
              style={deleteButtonStyle}
              onPress={handleDelete}
            >
              <Ionicons
                name="trash"
                size={Math.round(16 * scale)}
                color="#FFD0D8"
              />
              <Text style={deleteTextStyle}>Delete flow</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <ModalCard
        visible={editorSection !== null}
        onRequestClose={() => setEditorSection(null)}
        onBackdropPress={() => setEditorSection(null)}
        colors={["rgba(255,255,255,0.98)", "rgba(236,228,255,0.95)"]}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 1 }}
        cardStyle={modalCardStyle}
        overlayStyle={styles.modalOverlay}
        backdropStyle={styles.modalBackdrop}
      >
        <Text style={modalTitleStyle}>
          {editorSection ? `Add ${editorSection}` : ""}
        </Text>

        <View style={styles.typeRow}>
          {(editorSection === "trigger"
            ? TRIGGER_TYPES
            : editorSection === "condition"
              ? CONDITION_TYPES
              : ACTION_TYPES
          ).map((item) => (
            <Pressable
              key={item.id}
              style={typeChipStyle(editorType === item.id)}
              onPress={() => setEditorType(item.id)}
              testID={`automation-editor-type-${item.id}`}
            >
              <Text style={typeChipTextStyle(editorType === item.id)}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          style={modalScrollStyle}
          showsVerticalScrollIndicator={false}
        >
          {editorSection === "trigger" && editorType === "time" && (
            <View style={styles.formRow}>
              <ModalField
                label="Hour"
                labelStyle={inputLabelStyle}
                containerStyle={flex1Style}
              >
                <TextInput
                  value={draftTime.hour}
                  onChangeText={(value) =>
                    setDraftTime((prev) => ({ ...prev, hour: value }))
                  }
                  keyboardType="number-pad"
                  style={inputStyle}
                  testID="automation-trigger-hour-input"
                />
              </ModalField>
              <ModalField
                label="Minute"
                labelStyle={inputLabelStyle}
                containerStyle={flex1Style}
              >
                <TextInput
                  value={draftTime.minute}
                  onChangeText={(value) =>
                    setDraftTime((prev) => ({ ...prev, minute: value }))
                  }
                  keyboardType="number-pad"
                  style={inputStyle}
                  testID="automation-trigger-minute-input"
                />
              </ModalField>
            </View>
          )}

          {editorSection === "trigger" && editorType === "device" && (
            <View>
              <ModalField label="Device" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {devices.map((d) => (
                    <Pressable
                      key={d.id}
                      style={choiceChipStyle(draftDeviceId === d.id)}
                      onPress={() => setDraftDeviceId(d.id)}
                    >
                      <Text style={choiceChipTextStyle(draftDeviceId === d.id)}>
                        {d.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </ModalField>
              <ModalField label="State" labelStyle={inputLabelStyle}>
                <View style={styles.dayGrid}>
                  {DEVICE_STATE_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={choiceChipStyle(draftDeviceMatchState === option.value)}
                      onPress={() => setDraftDeviceMatchState(option.value)}
                    >
                      <Text
                        style={choiceChipTextStyle(
                          draftDeviceMatchState === option.value,
                        )}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ModalField>
            </View>
          )}

          {editorSection === "trigger" && editorType === "presence" && (
            <View>
              <ModalField label="Household member" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {household.map((m) => (
                    <Pressable
                      key={m.id}
                      style={choiceChipStyle(draftMemberId === m.id)}
                      onPress={() => setDraftMemberId(m.id)}
                    >
                      <Text style={choiceChipTextStyle(draftMemberId === m.id)}>
                        {m.name.split(" ")[0]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </ModalField>
              <View style={styles.switchRow}>
                <Text style={inputLabelStyle}>
                  Status:{" "}
                  {draftPresenceStatus === "home" ? "Home" : "Away"}
                </Text>
                <Switch
                  value={draftPresenceStatus === "home"}
                  onValueChange={(v) =>
                    setDraftPresenceStatus(v ? "home" : "away")
                  }
                  thumbColor={
                    draftPresenceStatus === "home"
                      ? theme.colors.accent
                      : "rgba(255,255,255,0.8)"
                  }
                  trackColor={{
                    true: "rgba(180,107,255,0.45)",
                    false: "rgba(255,255,255,0.24)",
                  }}
                />
              </View>
            </View>
          )}

          {editorSection === "trigger" && editorType === "scene" && (
            <View>
              <ModalField label="Scene" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {accessibleScenes.map((s) => (
                    <Pressable
                      key={s.id}
                      style={choiceChipStyle(draftSceneId === s.id)}
                      onPress={() => setDraftSceneId(s.id)}
                    >
                      <Text style={choiceChipTextStyle(draftSceneId === s.id)}>
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </ModalField>
            </View>
          )}

          {editorSection === "condition" &&
            editorType === "time-range" && (
              <>
                <ModalField label="Start time" labelStyle={inputLabelStyle}>
                  <View style={styles.formRow}>
                    <TextInput
                      value={draftRange.startHour}
                      onChangeText={(value) =>
                        setDraftRange((prev) => ({
                          ...prev,
                          startHour: value,
                        }))
                      }
                      keyboardType="number-pad"
                      style={inputStyle}
                    />
                    <TextInput
                      value={draftRange.startMinute}
                      onChangeText={(value) =>
                        setDraftRange((prev) => ({
                          ...prev,
                          startMinute: value,
                        }))
                      }
                      keyboardType="number-pad"
                      style={inputStyle}
                    />
                  </View>
                </ModalField>
                <ModalField label="End time" labelStyle={inputLabelStyle}>
                  <View style={styles.formRow}>
                    <TextInput
                      value={draftRange.endHour}
                      onChangeText={(value) =>
                        setDraftRange((prev) => ({
                          ...prev,
                          endHour: value,
                        }))
                      }
                      keyboardType="number-pad"
                      style={inputStyle}
                    />
                    <TextInput
                      value={draftRange.endMinute}
                      onChangeText={(value) =>
                        setDraftRange((prev) => ({
                          ...prev,
                          endMinute: value,
                        }))
                      }
                      keyboardType="number-pad"
                      style={inputStyle}
                    />
                  </View>
                </ModalField>
              </>
            )}

          {editorSection === "condition" && editorType === "device" && (
            <View>
              <ModalField label="Device" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {devices.map((d) => (
                    <Pressable
                      key={d.id}
                      style={choiceChipStyle(draftDeviceId === d.id)}
                      onPress={() => setDraftDeviceId(d.id)}
                    >
                      <Text style={choiceChipTextStyle(draftDeviceId === d.id)}>
                        {d.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </ModalField>
              <ModalField label="State" labelStyle={inputLabelStyle}>
                <View style={styles.dayGrid}>
                  {DEVICE_STATE_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={choiceChipStyle(draftDeviceMatchState === option.value)}
                      onPress={() => setDraftDeviceMatchState(option.value)}
                    >
                      <Text
                        style={choiceChipTextStyle(
                          draftDeviceMatchState === option.value,
                        )}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ModalField>
            </View>
          )}

          {editorSection === "condition" && editorType === "day" && (
            <View>
              <ModalField label="Days" labelStyle={inputLabelStyle}>
                <View style={styles.dayGrid}>
                  {WEEK_DAYS.map((day) => {
                    const active = draftDays.includes(day);
                    return (
                      <Pressable
                        key={day}
                        style={choiceChipStyle(active)}
                        onPress={() =>
                          setDraftDays((prev) =>
                            prev.includes(day)
                              ? prev.filter((d) => d !== day)
                              : [...prev, day],
                          )
                        }
                      >
                        <Text style={choiceChipTextStyle(active)}>
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ModalField>
            </View>
          )}

          {editorSection === "condition" && editorType === "household" && (
            <View>
              <ModalField label="Household" labelStyle={inputLabelStyle}>
                <View style={styles.dayGrid}>
                  {HOUSEHOLD_MATCH_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={choiceChipStyle(draftHouseholdMatch === option.value)}
                      onPress={() => setDraftHouseholdMatch(option.value)}
                    >
                      <Text
                        style={choiceChipTextStyle(
                          draftHouseholdMatch === option.value,
                        )}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ModalField>
            </View>
          )}

          {editorSection === "condition" && editorType === "sun" && (
            <View>
              <ModalField label="Sun timing" labelStyle={inputLabelStyle}>
                <View style={styles.dayGrid}>
                  {SUN_RELATION_OPTIONS.map((option) => (
                    <Pressable
                      key={option.value}
                      style={choiceChipStyle(draftSunRelation === option.value)}
                      onPress={() => setDraftSunRelation(option.value)}
                    >
                      <Text
                        style={choiceChipTextStyle(
                          draftSunRelation === option.value,
                        )}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ModalField>
            </View>
          )}

          {editorSection === "condition" && editorType === "open-for" && (
            <View>
              <ModalField label="Entry device" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {openableDevices.map((device) => (
                    <Pressable
                      key={device.id}
                      style={choiceChipStyle(draftDeviceId === device.id)}
                      onPress={() => setDraftDeviceId(device.id)}
                    >
                      <Text style={choiceChipTextStyle(draftDeviceId === device.id)}>
                        {device.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </ModalField>
              <ModalField label="Open for" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {OPEN_DURATION_PRESETS.map((minutes) => {
                    const active = draftOpenMinutes === minutes;
                    return (
                      <Pressable
                        key={minutes}
                        style={choiceChipStyle(active)}
                        onPress={() => setDraftOpenMinutes(minutes)}
                      >
                        <Text style={choiceChipTextStyle(active)}>
                          {minutes}m
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <TextInput
                  value={String(draftOpenMinutes)}
                  onChangeText={(value) =>
                    setDraftOpenMinutes(parseInt(value || "0", 10))
                  }
                  keyboardType="number-pad"
                  style={inputStyle}
                />
              </ModalField>
            </View>
          )}

          {editorSection === "action" && editorType === "toggle" && (
            <View>
              <ModalField label="Device" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {devices.map((d) => (
                    <Pressable
                      key={d.id}
                      style={choiceChipStyle(draftDeviceId === d.id)}
                      onPress={() => setDraftDeviceId(d.id)}
                    >
                      <Text style={choiceChipTextStyle(draftDeviceId === d.id)}>
                        {d.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </ModalField>
              <View style={styles.switchRow}>
                <Text style={inputLabelStyle}>
                  Turn {draftToggleOn ? "On" : "Off"}
                </Text>
                <Switch
                  value={draftToggleOn}
                  onValueChange={setDraftToggleOn}
                  thumbColor={
                    draftToggleOn
                      ? theme.colors.accent
                      : "rgba(255,255,255,0.8)"
                  }
                  trackColor={{
                    true: "rgba(180,107,255,0.45)",
                    false: "rgba(255,255,255,0.24)",
                  }}
                />
              </View>
            </View>
          )}

          {editorSection === "action" && editorType === "patch" && (
            <View>
              <ModalField label="Patchable device" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {patchableDevices.map((device) => (
                    <Pressable
                      key={device.id}
                      style={choiceChipStyle(draftDeviceId === device.id)}
                      onPress={() => setDraftDeviceId(device.id)}
                    >
                      <Text style={choiceChipTextStyle(draftDeviceId === device.id)}>
                        {device.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </ModalField>
              {["door", "window", "garage", "gate"].includes(
                deviceMap.get(draftDeviceId)?.kind ?? "",
              ) && (
                <ModalField label="Open %" labelStyle={inputLabelStyle}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {PATCH_OPEN_PRESETS.map((value) => {
                      const active = draftPatchOpenPercent === value;
                      return (
                        <Pressable
                          key={value}
                          style={choiceChipStyle(active)}
                          onPress={() => setDraftPatchOpenPercent(value)}
                        >
                          <Text style={choiceChipTextStyle(active)}>
                            {value}%
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <TextInput
                    value={String(draftPatchOpenPercent)}
                    onChangeText={(value) =>
                      setDraftPatchOpenPercent(parseInt(value || "0", 10))
                    }
                    keyboardType="number-pad"
                    style={inputStyle}
                  />
                </ModalField>
              )}
              {deviceMap.get(draftDeviceId)?.kind === "camera" && (
                <>
                  <View style={styles.switchRow}>
                    <Text style={inputLabelStyle}>Armed</Text>
                    <Switch
                      value={draftPatchArmed}
                      onValueChange={setDraftPatchArmed}
                      thumbColor={
                        draftPatchArmed
                          ? theme.colors.accent
                          : "rgba(255,255,255,0.8)"
                      }
                      trackColor={{
                        true: "rgba(180,107,255,0.45)",
                        false: "rgba(255,255,255,0.24)",
                      }}
                    />
                  </View>
                  <View style={styles.switchRow}>
                    <Text style={inputLabelStyle}>Recording</Text>
                    <Switch
                      value={draftPatchRecording}
                      onValueChange={setDraftPatchRecording}
                      thumbColor={
                        draftPatchRecording
                          ? theme.colors.accent
                          : "rgba(255,255,255,0.8)"
                      }
                      trackColor={{
                        true: "rgba(180,107,255,0.45)",
                        false: "rgba(255,255,255,0.24)",
                      }}
                    />
                  </View>
                  <View style={styles.switchRow}>
                    <Text style={inputLabelStyle}>Motion alerts</Text>
                    <Switch
                      value={draftPatchMotionAlerts}
                      onValueChange={setDraftPatchMotionAlerts}
                      thumbColor={
                        draftPatchMotionAlerts
                          ? theme.colors.accent
                          : "rgba(255,255,255,0.8)"
                      }
                      trackColor={{
                        true: "rgba(180,107,255,0.45)",
                        false: "rgba(255,255,255,0.24)",
                      }}
                    />
                  </View>
                </>
              )}
            </View>
          )}

          {editorSection === "action" && editorType === "set-ac" && (
            <View>
              <ModalField label="AC device" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {(acDevices.length ? acDevices : devices).map((d) => (
                    <Pressable
                      key={d.id}
                      style={choiceChipStyle(draftDeviceId === d.id)}
                      onPress={() => setDraftDeviceId(d.id)}
                    >
                      <Text style={choiceChipTextStyle(draftDeviceId === d.id)}>
                        {d.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </ModalField>
              <ModalField label="Temperature" labelStyle={inputLabelStyle}>
                <TextInput
                  value={String(draftTemp)}
                  onChangeText={(value) =>
                    setDraftTemp(parseInt(value || "0", 10))
                  }
                  keyboardType="number-pad"
                  style={inputStyle}
                />
              </ModalField>
            </View>
          )}

          {editorSection === "action" &&
            editorType === "set-brightness" && (
              <View>
                <ModalField label="Light device" labelStyle={inputLabelStyle}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {(lightDevices.length ? lightDevices : devices).map(
                      (d) => (
                        <Pressable
                          key={d.id}
                          style={choiceChipStyle(draftDeviceId === d.id)}
                          onPress={() => setDraftDeviceId(d.id)}
                        >
                          <Text
                            style={choiceChipTextStyle(draftDeviceId === d.id)}
                          >
                            {d.name}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </ScrollView>
                </ModalField>
                <ModalField label="Brightness %" labelStyle={inputLabelStyle}>
                  <TextInput
                    value={String(draftBrightness)}
                    onChangeText={(value) =>
                      setDraftBrightness(parseInt(value || "0", 10))
                    }
                    keyboardType="number-pad"
                    style={inputStyle}
                  />
                </ModalField>
              </View>
            )}

          {editorSection === "action" && editorType === "run-scene" && (
            <View>
              <ModalField label="Scene" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {accessibleScenes.map((s) => (
                    <Pressable
                      key={s.id}
                      style={choiceChipStyle(draftSceneId === s.id)}
                      onPress={() => setDraftSceneId(s.id)}
                    >
                      <Text style={choiceChipTextStyle(draftSceneId === s.id)}>
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </ModalField>
            </View>
          )}

          {editorSection === "action" && editorType === "notify" && (
            <View>
              <ModalField label="Message" labelStyle={inputLabelStyle}>
                  <TextInput
                    value={draftMessage}
                    onChangeText={setDraftMessage}
                    placeholder="Send a notification"
                    placeholderTextColor="rgba(12,12,18,0.45)"
                    style={inputStyle}
                    testID="automation-notify-message-input"
                  />
              </ModalField>
            </View>
          )}

          {editorSection === "action" && editorType === "delay" && (
            <View>
              <ModalField label="Delay (seconds)" labelStyle={inputLabelStyle}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {DELAY_PRESETS.map((seconds) => {
                    const active = draftDelaySeconds === seconds;
                    return (
                      <Pressable
                        key={seconds}
                        style={choiceChipStyle(active)}
                        onPress={() => setDraftDelaySeconds(seconds)}
                      >
                        <Text style={choiceChipTextStyle(active)}>
                          {formatDelayLabel(seconds)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <TextInput
                  value={String(draftDelaySeconds)}
                  onChangeText={(value) =>
                    setDraftDelaySeconds(parseInt(value || "0", 10))
                  }
                  keyboardType="number-pad"
                  style={inputStyle}
                />
              </ModalField>
            </View>
          )}

          {editorSection === "action" && editorType === "branch" && (
            <View>
              <ModalField label="If" labelStyle={inputLabelStyle}>
                <View style={styles.dayGrid}>
                  {BRANCH_CONDITION_TYPES.map((option) => (
                    <Pressable
                      key={option.id}
                      style={choiceChipStyle(draftBranchConditionType === option.id)}
                      onPress={() => setDraftBranchConditionType(option.id)}
                    >
                      <Text
                        style={choiceChipTextStyle(
                          draftBranchConditionType === option.id,
                        )}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ModalField>

              {draftBranchConditionType === "device" && (
                <>
                  <ModalField label="Device" labelStyle={inputLabelStyle}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                    >
                      {devices.map((device) => (
                        <Pressable
                          key={device.id}
                          style={choiceChipStyle(
                            draftBranchConditionDeviceId === device.id,
                          )}
                          onPress={() => setDraftBranchConditionDeviceId(device.id)}
                        >
                          <Text
                            style={choiceChipTextStyle(
                              draftBranchConditionDeviceId === device.id,
                            )}
                          >
                            {device.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </ModalField>
                  <ModalField label="State" labelStyle={inputLabelStyle}>
                    <View style={styles.dayGrid}>
                      {DEVICE_STATE_OPTIONS.map((option) => (
                        <Pressable
                          key={option.value}
                          style={choiceChipStyle(
                            draftBranchConditionDeviceState === option.value,
                          )}
                          onPress={() =>
                            setDraftBranchConditionDeviceState(option.value)
                          }
                        >
                          <Text
                            style={choiceChipTextStyle(
                              draftBranchConditionDeviceState === option.value,
                            )}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ModalField>
                </>
              )}

              {draftBranchConditionType === "household" && (
                <ModalField label="Household" labelStyle={inputLabelStyle}>
                  <View style={styles.dayGrid}>
                    {HOUSEHOLD_MATCH_OPTIONS.map((option) => (
                      <Pressable
                        key={option.value}
                        style={choiceChipStyle(
                          draftBranchConditionHouseholdMatch === option.value,
                        )}
                        onPress={() =>
                          setDraftBranchConditionHouseholdMatch(option.value)
                        }
                      >
                        <Text
                          style={choiceChipTextStyle(
                            draftBranchConditionHouseholdMatch === option.value,
                          )}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ModalField>
              )}

              {draftBranchConditionType === "sun" && (
                <ModalField label="Sun timing" labelStyle={inputLabelStyle}>
                  <View style={styles.dayGrid}>
                    {SUN_RELATION_OPTIONS.map((option) => (
                      <Pressable
                        key={option.value}
                        style={choiceChipStyle(
                          draftBranchConditionSunRelation === option.value,
                        )}
                        onPress={() =>
                          setDraftBranchConditionSunRelation(option.value)
                        }
                      >
                        <Text
                          style={choiceChipTextStyle(
                            draftBranchConditionSunRelation === option.value,
                          )}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ModalField>
              )}

              {draftBranchConditionType === "open-for" && (
                <>
                  <ModalField label="Entry device" labelStyle={inputLabelStyle}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                    >
                      {openableDevices.map((device) => (
                        <Pressable
                          key={device.id}
                          style={choiceChipStyle(
                            draftBranchConditionOpenDeviceId === device.id,
                          )}
                          onPress={() =>
                            setDraftBranchConditionOpenDeviceId(device.id)
                          }
                        >
                          <Text
                            style={choiceChipTextStyle(
                              draftBranchConditionOpenDeviceId === device.id,
                            )}
                          >
                            {device.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </ModalField>
                  <ModalField label="Open for" labelStyle={inputLabelStyle}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                    >
                      {OPEN_DURATION_PRESETS.map((minutes) => {
                        const active = draftBranchConditionOpenMinutes === minutes;
                        return (
                          <Pressable
                            key={minutes}
                            style={choiceChipStyle(active)}
                            onPress={() =>
                              setDraftBranchConditionOpenMinutes(minutes)
                            }
                          >
                            <Text style={choiceChipTextStyle(active)}>
                              {minutes}m
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <TextInput
                      value={String(draftBranchConditionOpenMinutes)}
                      onChangeText={(value) =>
                        setDraftBranchConditionOpenMinutes(
                          parseInt(value || "0", 10),
                        )
                      }
                      keyboardType="number-pad"
                      style={inputStyle}
                    />
                  </ModalField>
                </>
              )}

              <ModalField label="Then" labelStyle={inputLabelStyle}>
                <View style={styles.dayGrid}>
                  {BRANCH_ACTION_TYPES.map((option) => (
                    <Pressable
                      key={option.id}
                      style={choiceChipStyle(draftBranchIfAction.type === option.id)}
                      onPress={() =>
                        setDraftBranchIfAction((prev) => ({
                          ...prev,
                          type: option.id,
                        }))
                      }
                    >
                      <Text
                        style={choiceChipTextStyle(
                          draftBranchIfAction.type === option.id,
                        )}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ModalField>

              {draftBranchIfAction.type === "run-scene" && (
                <ModalField label="Scene" labelStyle={inputLabelStyle}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {accessibleScenes.map((scene) => (
                      <Pressable
                        key={scene.id}
                        style={choiceChipStyle(
                          draftBranchIfAction.sceneId === scene.id,
                        )}
                        onPress={() =>
                          setDraftBranchIfAction((prev) => ({
                            ...prev,
                            sceneId: scene.id,
                          }))
                        }
                      >
                        <Text
                          style={choiceChipTextStyle(
                            draftBranchIfAction.sceneId === scene.id,
                          )}
                        >
                          {scene.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </ModalField>
              )}

              {draftBranchIfAction.type === "notify" && (
                <ModalField label="Message" labelStyle={inputLabelStyle}>
                  <TextInput
                    value={draftBranchIfAction.message}
                    onChangeText={(value) =>
                      setDraftBranchIfAction((prev) => ({
                        ...prev,
                        message: value,
                      }))
                    }
                    placeholder="Send a notification"
                    placeholderTextColor="rgba(12,12,18,0.45)"
                    style={inputStyle}
                  />
                </ModalField>
              )}

              {draftBranchIfAction.type === "delay" && (
                <ModalField label="Delay (seconds)" labelStyle={inputLabelStyle}>
                  <TextInput
                    value={String(draftBranchIfAction.delaySeconds)}
                    onChangeText={(value) =>
                      setDraftBranchIfAction((prev) => ({
                        ...prev,
                        delaySeconds: parseInt(value || "0", 10),
                      }))
                    }
                    keyboardType="number-pad"
                    style={inputStyle}
                  />
                </ModalField>
              )}

              {draftBranchIfAction.type === "patch" && (
                <>
                  <ModalField label="Device" labelStyle={inputLabelStyle}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                    >
                      {patchableDevices.map((device) => (
                        <Pressable
                          key={device.id}
                          style={choiceChipStyle(
                            draftBranchIfAction.deviceId === device.id,
                          )}
                          onPress={() =>
                            setDraftBranchIfAction((prev) => ({
                              ...prev,
                              deviceId: device.id,
                            }))
                          }
                        >
                          <Text
                            style={choiceChipTextStyle(
                              draftBranchIfAction.deviceId === device.id,
                            )}
                          >
                            {device.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </ModalField>
                  {["door", "window", "garage", "gate"].includes(
                    deviceMap.get(draftBranchIfAction.deviceId)?.kind ?? "",
                  ) && (
                    <ModalField label="Open %" labelStyle={inputLabelStyle}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipRow}
                      >
                        {PATCH_OPEN_PRESETS.map((value) => {
                          const active = draftBranchIfAction.patchOpenPercent === value;
                          return (
                            <Pressable
                              key={value}
                              style={choiceChipStyle(active)}
                              onPress={() =>
                                setDraftBranchIfAction((prev) => ({
                                  ...prev,
                                  patchOpenPercent: value,
                                }))
                              }
                            >
                              <Text style={choiceChipTextStyle(active)}>
                                {value}%
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </ModalField>
                  )}
                </>
              )}

              <View style={styles.switchRow}>
                <Text style={inputLabelStyle}>Else branch</Text>
                <Switch
                  value={draftBranchElseEnabled}
                  onValueChange={setDraftBranchElseEnabled}
                  thumbColor={
                    draftBranchElseEnabled
                      ? theme.colors.accent
                      : "rgba(255,255,255,0.8)"
                  }
                  trackColor={{
                    true: "rgba(180,107,255,0.45)",
                    false: "rgba(255,255,255,0.24)",
                  }}
                />
              </View>

              {draftBranchElseEnabled && (
                <>
                  <ModalField label="Else" labelStyle={inputLabelStyle}>
                    <View style={styles.dayGrid}>
                      {BRANCH_ACTION_TYPES.map((option) => (
                        <Pressable
                          key={option.id}
                          style={choiceChipStyle(
                            draftBranchElseAction.type === option.id,
                          )}
                          onPress={() =>
                            setDraftBranchElseAction((prev) => ({
                              ...prev,
                              type: option.id,
                            }))
                          }
                        >
                          <Text
                            style={choiceChipTextStyle(
                              draftBranchElseAction.type === option.id,
                            )}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ModalField>

                  {draftBranchElseAction.type === "run-scene" && (
                    <ModalField label="Scene" labelStyle={inputLabelStyle}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipRow}
                      >
                        {accessibleScenes.map((scene) => (
                          <Pressable
                            key={scene.id}
                            style={choiceChipStyle(
                              draftBranchElseAction.sceneId === scene.id,
                            )}
                            onPress={() =>
                              setDraftBranchElseAction((prev) => ({
                                ...prev,
                                sceneId: scene.id,
                              }))
                            }
                          >
                            <Text
                              style={choiceChipTextStyle(
                                draftBranchElseAction.sceneId === scene.id,
                              )}
                            >
                              {scene.name}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </ModalField>
                  )}

                  {draftBranchElseAction.type === "notify" && (
                    <ModalField label="Message" labelStyle={inputLabelStyle}>
                      <TextInput
                        value={draftBranchElseAction.message}
                        onChangeText={(value) =>
                          setDraftBranchElseAction((prev) => ({
                            ...prev,
                            message: value,
                          }))
                        }
                        placeholder="Send a notification"
                        placeholderTextColor="rgba(12,12,18,0.45)"
                        style={inputStyle}
                      />
                    </ModalField>
                  )}

                  {draftBranchElseAction.type === "delay" && (
                    <ModalField
                      label="Delay (seconds)"
                      labelStyle={inputLabelStyle}
                    >
                      <TextInput
                        value={String(draftBranchElseAction.delaySeconds)}
                        onChangeText={(value) =>
                          setDraftBranchElseAction((prev) => ({
                            ...prev,
                            delaySeconds: parseInt(value || "0", 10),
                          }))
                        }
                        keyboardType="number-pad"
                        style={inputStyle}
                      />
                    </ModalField>
                  )}

                  {draftBranchElseAction.type === "patch" && (
                    <>
                      <ModalField label="Device" labelStyle={inputLabelStyle}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.chipRow}
                        >
                          {patchableDevices.map((device) => (
                            <Pressable
                              key={device.id}
                              style={choiceChipStyle(
                                draftBranchElseAction.deviceId === device.id,
                              )}
                              onPress={() =>
                                setDraftBranchElseAction((prev) => ({
                                  ...prev,
                                  deviceId: device.id,
                                }))
                              }
                            >
                              <Text
                                style={choiceChipTextStyle(
                                  draftBranchElseAction.deviceId === device.id,
                                )}
                              >
                                {device.name}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </ModalField>
                      {["door", "window", "garage", "gate"].includes(
                        deviceMap.get(draftBranchElseAction.deviceId)?.kind ?? "",
                      ) && (
                        <ModalField label="Open %" labelStyle={inputLabelStyle}>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.chipRow}
                          >
                            {PATCH_OPEN_PRESETS.map((value) => {
                              const active =
                                draftBranchElseAction.patchOpenPercent === value;
                              return (
                                <Pressable
                                  key={value}
                                  style={choiceChipStyle(active)}
                                  onPress={() =>
                                    setDraftBranchElseAction((prev) => ({
                                      ...prev,
                                      patchOpenPercent: value,
                                    }))
                                  }
                                >
                                  <Text style={choiceChipTextStyle(active)}>
                                    {value}%
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </ScrollView>
                        </ModalField>
                      )}
                    </>
                  )}
                </>
              )}
            </View>
          )}
        </ScrollView>

        <Pressable
          style={modalButtonStyle}
          onPress={addItem}
          testID="automation-editor-submit-button"
        >
          <Text style={modalButtonTextStyle}>Add {editorSection}</Text>
        </Pressable>
      </ModalCard>
    </LinearGradient>
  );
}

function describeTrigger(
  trigger: FlowTrigger,
  devices: Map<string, Device>,
  scenes: Map<string, { id: string; name: string }>,
  members: Map<string, { id: string; name: string }>,
) {
  switch (trigger.type) {
    case "time":
      return `At ${formatTime(trigger.hour, trigger.minute)}`;
    case "device":
      return `${devices.get(trigger.deviceId)?.name ?? "Device"} is ${formatDeviceStateLabel(trigger.state)}`;
    case "scene":
      return `${scenes.get(trigger.sceneId)?.name ?? "Scene"} starts`;
    case "presence":
      return `${members.get(trigger.memberId)?.name ?? "Someone"} is ${trigger.status}`;
    default:
      return "Trigger";
  }
}

function describeCondition(
  condition: FlowCondition,
  devices: Map<string, Device>,
) {
  switch (condition.type) {
    case "time-range":
      return `${formatTime(condition.startHour, condition.startMinute)} - ${formatTime(
        condition.endHour,
        condition.endMinute,
      )}`;
    case "device":
      return `${devices.get(condition.deviceId)?.name ?? "Device"} is ${formatDeviceStateLabel(condition.state)}`;
    case "day":
      return `Days: ${condition.days.join(", ")}`;
    case "household":
      return formatHouseholdMatchLabel(condition.match);
    case "sun":
      return formatSunRelationLabel(condition.relation);
    case "open-for":
      return `${devices.get(condition.deviceId)?.name ?? "Entry"} open for ${condition.minutes}m`;
    default:
      return "Condition";
  }
}

function describeAction(
  action: FlowAction,
  devices: Map<string, Device>,
  scenes: Map<string, { id: string; name: string }>,
) {
  switch (action.type) {
    case "patch": {
      const device = devices.get(action.deviceId);
      if (typeof action.patch.openPercent === "number") {
        return `${device?.name ?? "Device"} to ${Math.round(action.patch.openPercent)}% open`;
      }
      if (device?.kind === "camera") {
        return `${device.name} camera updated`;
      }
      return `${device?.name ?? "Device"} patched`;
    }
    case "toggle":
      return `${devices.get(action.deviceId)?.name ?? "Device"} ${action.on ? "ON" : "OFF"}`;
    case "set-ac":
      return `Set ${devices.get(action.deviceId)?.name ?? "AC"} to ${action.tempC}C`;
    case "set-brightness":
      return `Brightness ${action.brightness}% on ${devices.get(action.deviceId)?.name ?? "Light"}`;
    case "run-scene":
      return `Run scene: ${scenes.get(action.sceneId)?.name ?? "Scene"}`;
    case "delay":
      return `Wait ${action.seconds}s`;
    case "notify":
      return `Notify: ${action.message}`;
    case "branch": {
      const thenLabel = action.ifActions
        .map((item) => describeLeafAction(item, devices, scenes))
        .join(", ");
      const elseLabel = (action.elseActions ?? [])
        .map((item) => describeLeafAction(item, devices, scenes))
        .join(", ");
      return elseLabel
        ? `If ${describeCondition(action.condition, devices)} → ${thenLabel}; else ${elseLabel}`
        : `If ${describeCondition(action.condition, devices)} → ${thenLabel}`;
    }
    default:
      return "Action";
  }
}

function describeLeafAction(
  action: FlowLeafAction,
  devices: Map<string, Device>,
  scenes: Map<string, { id: string; name: string }>,
) {
  return describeAction(action, devices, scenes);
}

function formatDeviceStateLabel(state: DeviceMatchState) {
  switch (state) {
    case "open":
      return "OPEN";
    case "closed":
      return "CLOSED";
    case "on":
      return "ON";
    case "off":
      return "OFF";
    default:
      return state.toUpperCase();
  }
}

function formatHouseholdMatchLabel(match: HouseholdMatch) {
  switch (match) {
    case "everyone-away":
      return "Everyone is away";
    case "everyone-home":
      return "Everyone is home";
    case "someone-home":
      return "Someone is home";
    default:
      return "Household";
  }
}

function formatSunRelationLabel(relation: SunRelation) {
  return relation === "after-sunset" ? "After sunset" : "Before sunrise";
}

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDelayLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  return `${mins}m`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    color: theme.colors.text,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  headerBtn: {
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card,
  },
  saveBtn: { backgroundColor: "rgba(180,107,255,0.55)" },
  saveBtnDisabled: { opacity: 0.5 },
  content: { paddingTop: 12 },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card,
    marginBottom: 12,
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card2,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { color: theme.colors.text, fontWeight: "900" },
  sectionSub: { color: theme.colors.subtext, marginTop: 4 },
  inputLabel: { color: theme.colors.subtext, fontWeight: "700", marginTop: 12 },
  input: {
    marginTop: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    color: theme.colors.text,
    fontWeight: "700",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "rgba(180,107,255,0.3)",
    borderWidth: 1,
    borderColor: "rgba(180,107,255,0.45)",
  },
  addBtnText: { color: theme.colors.text, fontWeight: "800" },
  emptyText: { color: theme.colors.muted, fontWeight: "700" },
  itemRow: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 12,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemLabel: { color: theme.colors.subtext, fontWeight: "700" },
  itemValue: { color: theme.colors.text, fontWeight: "800", marginTop: 4 },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  deleteBtn: {
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,120,140,0.45)",
    backgroundColor: "rgba(255,120,140,0.18)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deleteText: { color: "#FFD0D8", fontWeight: "800" },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    padding: 0,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,8,30,0.6)",
  },
  modalCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    shadowColor: "rgba(10,8,30,0.4)",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
  },
  modalTitle: { color: "#15101E", fontWeight: "900", marginBottom: 10 },
  modalBtn: {
    marginTop: 14,
    backgroundColor: "rgba(107,60,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnText: { color: "#fff", fontWeight: "800" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  typeChip: {
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.15)",
    backgroundColor: "rgba(12,12,18,0.05)",
  },
  typeChipActive: {
    backgroundColor: "rgba(107,60,255,0.15)",
    borderColor: "rgba(107,60,255,0.35)",
  },
  typeChipText: { color: "#24202E", fontWeight: "700", fontSize: 12 },
  typeChipTextActive: { color: "#2B0A73", fontWeight: "900" },
  formRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  chipRow: { gap: 8, marginTop: 8 },
  choiceChip: {
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(12,12,18,0.15)",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  choiceChipActive: {
    backgroundColor: "rgba(107,60,255,0.18)",
    borderColor: "rgba(107,60,255,0.35)",
  },
  choiceChipText: { color: "#24202E", fontWeight: "700", fontSize: 12 },
  choiceChipTextActive: { color: "#2B0A73", fontWeight: "900" },
  dayGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
});
