import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Pressable from '../components/Pressable';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../app/AppNavigator';
import { theme } from '../theme/theme';
import { AC_TEMP_MAX_C, AC_TEMP_MIN_C, useHomeStore, type Device, type SprinklerSchedule } from '../store/useHomeStore';
import RadialDial from '../components/RadialDial';
import BackgroundLines from '../components/BackgroundLines';
import ModeTiles from '../components/ModeTiles';
import DeviceCapabilityControls from '../components/DeviceCapabilityControls';
import AvatarChip from '../components/AvatarChip';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deviceClient } from '../services/deviceClient';
import { useResponsive } from '../theme/layout';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceDetail'>;

function genericIconFor(kind: string): keyof typeof Ionicons.glyphMap {
  if (kind === 'light') return 'bulb';
  if (kind === 'tv') return 'tv';
  if (kind === 'coffee') return 'cafe';
  if (kind === 'fan') return 'aperture';
  if (kind === 'fridge') return 'thermometer';
  if (kind === 'garage') return 'car-sport';
  if (kind === 'gate') return 'exit';
  if (kind === 'door') return 'home';
  if (kind === 'vacuum') return 'sparkles';
  if (kind === 'camera') return 'videocam';
  if (kind === 'window') return 'copy';
  if (kind === 'stove') return 'flame';
  if (kind === 'washer') return 'sync';
  if (kind === 'dryer') return 'sync';
  if (kind === 'microwave') return 'timer';
  if (kind === 'energy') return 'stats-chart';
  if (kind === 'water') return 'water';
  if (kind === 'air') return 'leaf';
  if (kind === 'sprinkler') return 'rainy';
  if (kind === 'speaker') return 'volume-high';
  if (kind === 'smoke') return 'alert-circle';
  return 'cube';
}

function hexToRgb(hex: string) {
  const cleaned = hex.trim().replace('#', '');
  if (cleaned.length !== 3 && cleaned.length !== 6) return null;
  const full =
    cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

function isLightColor(hex: string, threshold = 0.9) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance >= threshold;
}

const LIGHT_TEMP_PRESETS: Array<{ label: string; value: number }> = [
  { label: 'Warm', value: 2400 },
  { label: 'Soft', value: 3000 },
  { label: 'Neutral', value: 4000 },
  { label: 'Daylight', value: 5200 },
];

const LIGHT_EFFECTS: Array<{
  label: string;
  value: NonNullable<Device['lightEffect']>;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { label: 'Focus', value: 'focus', icon: 'flash' as const },
  { label: 'Relax', value: 'relax', icon: 'moon' as const },
  { label: 'Sunset', value: 'sunset', icon: 'sunny' as const },
  { label: 'Party', value: 'party', icon: 'color-palette' as const },
];

const LIGHT_AUTO_OFF = [0, 15, 30, 60];

export default function DeviceDetailScreen({ route, navigation }: Props) {
  const { gutter, isTablet, isLandscape, scale, contentWidth, height } = useResponsive(960);
  // Scale all measurements together so layouts stay balanced across device sizes.
  const panelPad = Math.round((isTablet ? 22 : 18) * scale);
  const panelRadius = Math.round((isTablet ? 44 : 42) * scale);
  const headerHeight = Math.round((isTablet ? 62 : 56) * scale);
  const headerBtnSize = Math.round((isTablet ? 48 : 44) * scale);
  const headerBtnRadius = Math.round(headerBtnSize / 2);
  const headerTitleSize = Math.round((isTablet ? 18 : 16) * scale);
  const moodLabelSize = Math.round((isTablet ? 13 : 12) * scale);
  const moodValueSize = Math.round((isTablet ? 24 : 22) * scale);
  const dialSize = Math.round((isTablet ? (isLandscape ? 320 : 340) : 280) * scale);
  const compactDialSize = Math.round((isTablet ? 280 : 240) * scale);
  const controlCardPad = Math.round((isTablet ? 16 : 12) * scale);
  const controlCardRadius = Math.round((isTablet ? 20 : 18) * scale);
  const controlCardRowGap = Math.round((isTablet ? 12 : 10) * scale);
  const isLightCompact = !isTablet;
  const lightDialSize = Math.round(
    Math.min(
      dialSize * (isLightCompact ? 0.86 : 1),
      contentWidth - panelPad * 2,
      height * (isLandscape ? 0.58 : isTablet ? 0.48 : 0.36)
    )
  );
  const lightCenterSize = Math.min(
    260,
    Math.max(130, Math.round(lightDialSize * (isLightCompact ? 0.84 : 0.88)))
  );
  const lightCenterIcon = Math.max(22, Math.round(lightCenterSize * 0.2));
  const lightCenterValueSize = Math.max(18, Math.round(lightCenterSize * 0.11));
  const lightCenterRoomSize = Math.max(11, Math.round(lightCenterSize * 0.068));
  const lightCenterValueMargin = Math.max(6, Math.round(lightCenterSize * 0.05));
  const lightCenterRoomMargin = Math.max(2, Math.round(lightCenterSize * 0.025));
  const lightSwatchSize = Math.round((isTablet ? 36 : 28) * scale);
  const lightSwatchRadius = Math.round(lightSwatchSize * 0.35);
  const lightSceneItemHeight = Math.round((isTablet ? 54 : 44) * scale);
  const lightSceneItemRadius = Math.round(lightSceneItemHeight * 0.28);
  const lightSceneIconSize = Math.round((isTablet ? 16 : 13) * scale);
  const lightCardGap = Math.round((isTablet ? 14 : 8) * scale);
  const lightSubLabelSize = Math.round((isTablet ? 12 : 10) * scale);
  const lightCardPad = Math.round((isTablet ? 16 : 9) * scale);
  const lightCardRadius = Math.round((isTablet ? 20 : 16) * scale);
  const editPad = Math.round((isTablet ? 20 : 16) * scale);
  const editRadius = Math.round((isTablet ? 24 : 22) * scale);
  const editTitleSize = Math.round((isTablet ? 20 : 18) * scale);
  const editSubSize = Math.round((isTablet ? 14 : 12) * scale);
  const editLabelSize = Math.round((isTablet ? 13 : 12) * scale);
  const editInputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const editButtonHeight = Math.round((isTablet ? 46 : 44) * scale);
  const controlCardStyle = isTablet
    ? [styles.controlCard, { padding: controlCardPad, borderRadius: controlCardRadius }]
    : styles.controlCard;
  const controlCardRowStyle = isTablet
    ? [styles.controlCardRow, { gap: controlCardRowGap }]
    : styles.controlCardRow;
  const lightLayoutRow = isLandscape || isTablet;
  const lightCardBaseStyle = { padding: lightCardPad, borderRadius: lightCardRadius, marginTop: 0 };
  const lightDialCardStyle = [
    styles.controlCard,
    lightCardBaseStyle,
    styles.lightDialCard,
    { marginTop: lightLayoutRow ? 0 : Math.round((isLightCompact ? 12 : 16) * scale), gap: lightCardGap },
  ];
  const lightControlCardStyle = [styles.controlCard, lightCardBaseStyle, styles.lightControlCard];
  const lightControlsColumnStyle = [styles.lightControlsColumn, { gap: lightCardGap }];
  const lightSwatchStyle = { width: lightSwatchSize, height: lightSwatchSize, borderRadius: lightSwatchRadius };
  const lightSceneItemStyle = { height: lightSceneItemHeight, borderRadius: lightSceneItemRadius };
  const { deviceId } = route.params;
  const device = useHomeStore((s) => s.devices.find((d) => d.id === deviceId));
  const roomName = useHomeStore((s) => s.rooms.find((r) => r.id === device?.roomId)?.name ?? '');
  const removeDevice = useHomeStore((s) => s.removeDevice);
  const household = useHomeStore((s) => s.household);
  const setHouseholdPresence = useHomeStore((s) => s.setHouseholdPresence);
  const gateDevice = useHomeStore((s) => s.devices.find((d) => d.kind === 'gate'));
  const roomTemp = useHomeStore((s) => s.indoor.tempC);
  const rooms = useHomeStore((s) => s.rooms);
  const coffeeFill = useRef(new Animated.Value(device?.kind === 'coffee' && device.isOn ? 1 : 0)).current;
  const coffeeLoop = useRef<Animated.CompositeAnimation | null>(null);
  const doorSwing = useRef(new Animated.Value(device?.kind === 'door' && device.isOn ? 1 : 0)).current;

  if (!device) return null;

  const isAC = device.kind === 'ac';
  const showCapabilities = false;
  const temp = Math.max(AC_TEMP_MIN_C, Math.min(AC_TEMP_MAX_C, device.tempC ?? 22));
  const mode = (device.mode ?? 'cold') as 'cold' | 'fan' | 'dry';
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const brightness = clamp(device.brightness ?? 60, 0, 100);
  const colorTempK = clamp(device.colorTempK ?? 3200, 2000, 6500);
  const lightEffect = device.lightEffect ?? 'focus';
  const adaptiveLighting = device.adaptiveLighting ?? false;
  const motionBoost = device.motionBoost ?? false;
  const nightShift = device.nightShift ?? false;
  const autoOffMin = clamp(device.autoOffMin ?? 0, 0, 120);
  const bulbColor = device.color ?? '#FFD166';
  const bulbIsLight = isLightColor(bulbColor);
  const bulbGradient = bulbIsLight
    ? [bulbColor, 'rgba(200,200,216,0.96)']
    : [bulbColor, 'rgba(255,255,255,0.92)'];
  const bulbTextColor = bulbIsLight ? stylesVars.ink : '#fff';
  const bulbSubColor = bulbIsLight ? stylesVars.subtext : 'rgba(255,255,255,0.85)';
  const bulbIconColor = bulbIsLight ? stylesVars.ink : '#fff';
  const bulbInnerBorder = bulbIsLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)';
  const volume = clamp(device.volume ?? 20, 0, 100);
  const channel = clamp(device.channel ?? 1, 1, 999);
  const source = device.source ?? 'Live TV';
  const fridgeTemp = clamp(device.tempC ?? 4, 1, 8);
  const fanSpeed = clamp(device.speed ?? 50, 0, 100);
  const windowOpen = clamp(device.openPercent ?? 0, 0, 100);
  const gateOpen = clamp(device.openPercent ?? 0, 0, 100);
  const gateAutoOpen = gateDevice?.autoOpenEnabled ?? false;
  const stoveLevel = clamp(device.burnerLevel ?? 0, 0, 10);
  const washerProgress = clamp(device.progress ?? 0, 0, 100);
  const microwaveSeconds = clamp(device.timeRemainingSec ?? 0, 0, 1800);
  const sprinklerDuration = clamp(device.durationMin ?? 15, 0, 60);
  const speakerVolume = clamp(device.volume ?? 20, 0, 100);
  const energyPower = device.powerW ?? 0;
  const energyToday = device.energyTodayKwh ?? 0;
  const energyPeak = device.energyPeakW ?? 0;
  const energyMonth = device.energyMonthKwh ?? 0;
  const energyCostToday = device.energyCostToday ?? 0;
  const energyBudget = device.energyBudgetKwh ?? 0;
  const waterFlow = device.waterLpm ?? 0;
  const waterToday = device.waterTodayL ?? 0;
  const waterPressure = device.waterPressurePsi ?? 0;
  const waterTemp = device.waterTempC ?? 0;
  const waterLeakDetected = device.waterLeakDetected ?? false;
  const waterLeakAlerts = device.waterLeakAlerts ?? true;
  const waterAutoShutoff = device.waterAutoShutoff ?? false;
  const waterBudget = device.waterBudgetL ?? 0;
  const nightVision = device.nightVision ?? false;
  const motionAlerts = device.motionAlerts ?? true;
  const motionSensitivity = clamp(device.motionSensitivity ?? 6, 1, 10);
  const micMuted = device.micMuted ?? false;
  const twoWayAudio = device.twoWayAudio ?? true;
  const airQuality = device.airQualityIndex ?? 0;
  const humidity = device.humidity ?? 0;
  const formatClock = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };
  const sendPatch = (patch: Partial<Device>) => {
    deviceClient.sendCommand({ op: 'patch', deviceId: device.id, patch }).catch(() => {});
  };
  const hasCustom = [
    'light',
    'garage',
    'gate',
    'door',
    'fridge',
    'fan',
    'window',
    'vacuum',
    'camera',
    'stove',
    'washer',
    'dryer',
    'microwave',
    'energy',
    'water',
    'air',
    'sprinkler',
    'speaker',
    'smoke',
    'tv',
    'coffee',
  ].includes(device.kind);
  const bulbScale = useRef(new Animated.Value(1)).current;
  const [showEdit, setShowEdit] = useState(false);
  const [draftName, setDraftName] = useState(device.name);
  const [draftRoomId, setDraftRoomId] = useState(device.roomId);
  const [showSchedule, setShowSchedule] = useState(false);
  const [cameraEvents, setCameraEvents] = useState<
    Array<{ id: string; label: string; kind: 'known' | 'unknown'; ts: number }>
  >([]);
  const [schedHour, setSchedHour] = useState('06');
  const [schedMinute, setSchedMinute] = useState('00');
  const [schedDays, setSchedDays] = useState<Array<SprinklerSchedule['days'][number]>>([
    'Mon',
    'Wed',
    'Fri',
  ]);

  useEffect(() => {
    setDraftName(device.name);
    setDraftRoomId(device.roomId);
  }, [device.id, device.name, device.roomId, showEdit]);

  useEffect(() => {
    if (!showSchedule) return;
    setSchedHour('06');
    setSchedMinute('00');
    setSchedDays(['Mon', 'Wed', 'Fri']);
  }, [showSchedule]);

  const logCameraEvent = (label: string, kind: 'known' | 'unknown') => {
    // Maintain a short, most-recent-first log for the UI preview.
    setCameraEvents((prev) => [
      { id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label, kind, ts: Date.now() },
      ...prev,
    ].slice(0, 6));
  };

  const openGate = () => {
    if (!gateDevice) return;
    deviceClient
      .sendCommand({ op: 'patch', deviceId: gateDevice.id, patch: { openPercent: 100, isOn: true } })
      .catch(() => {});
  };

  const closeGate = () => {
    if (!gateDevice) return;
    deviceClient
      .sendCommand({ op: 'patch', deviceId: gateDevice.id, patch: { openPercent: 0, isOn: false } })
      .catch(() => {});
  };

  const handleKnownFace = (memberId: string, name: string) => {
    setHouseholdPresence(memberId, 'home');
    logCameraEvent(`${name} recognized`, 'known');
    // Auto-open only when a known face is detected and the gate toggle is enabled.
    if (gateDevice?.autoOpenEnabled) {
      openGate();
      logCameraEvent('Front gate auto-opened', 'known');
    }
  };

  const handleUnknownFace = () => {
    logCameraEvent('Unrecognized visitor detected', 'unknown');
  };

  useEffect(() => {
    if (device.kind !== 'door') return;
    Animated.timing(doorSwing, {
      toValue: device.isOn ? 1 : 0,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [device.kind, device.isOn, doorSwing]);

  const animateBulb = () => {
    Animated.sequence([
      Animated.timing(bulbScale, { toValue: 1.05, duration: 120, useNativeDriver: true }),
      Animated.spring(bulbScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  };

  const animateCoffee = (on: boolean) => {
    if (device.kind !== 'coffee') return;

    if (!on) {
      coffeeLoop.current?.stop();
      coffeeLoop.current = null;
      coffeeFill.stopAnimation();
      Animated.timing(coffeeFill, { toValue: 0, duration: 400, useNativeDriver: false }).start();
      return;
    }
    if (coffeeLoop.current) return;
    coffeeFill.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(coffeeFill, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(coffeeFill, { toValue: 0.15, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ])
    );
    coffeeLoop.current = loop;
    loop.start();
  };

  useEffect(() => {
    if (device.kind !== 'coffee') return;
    animateCoffee(device.isOn);
    return () => {
      coffeeLoop.current?.stop();
      coffeeLoop.current = null;
    };
  }, [device.kind, device.isOn]);

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={[styles.outer, { padding: gutter }, isTablet && styles.outerTablet]}
    >
      <BackgroundLines />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <LinearGradient
          colors={['rgba(255,255,255,0.92)', 'rgba(246,238,255,0.88)', 'rgba(238,228,255,0.86)']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.panel,
            {
              paddingTop: panelPad,
              paddingHorizontal: panelPad,
              paddingBottom: Math.round(panelPad * 1.1),
              borderRadius: panelRadius,
            },
            isTablet && {
              maxWidth: Math.min(isLandscape ? 980 : 860, contentWidth),
              width: '100%',
              alignSelf: 'center',
            },
          ]}
        >
          <View
            style={[
              styles.headerPill,
              {
                height: headerHeight,
                borderRadius: Math.round(headerHeight / 2),
                paddingHorizontal: Math.round(10 * scale),
              },
            ]}
          >
            <Pressable
              onPress={() => navigation.goBack()}
              style={[styles.headerBtn, { width: headerBtnSize, height: headerBtnSize, borderRadius: headerBtnRadius }]}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={Math.round(20 * scale)} color={stylesVars.ink} />
            </Pressable>

            <Text style={[styles.headerTitle, { fontSize: headerTitleSize }]} numberOfLines={1} pointerEvents="none">
              {device.name}
            </Text>

            <Pressable
              style={[styles.headerBtn, { width: headerBtnSize, height: headerBtnSize, borderRadius: headerBtnRadius }]}
              hitSlop={10}
              onPress={() => setShowEdit(true)}
              testID="device-options-button"
            >
              <Ionicons name="options-outline" size={Math.round(20 * scale)} color={stylesVars.ink} />
            </Pressable>
          </View>

          {showCapabilities ? (
            <View style={{ marginTop: 28 }}>
              <View style={styles.genericHero}>
                <View style={styles.genericIcon}>
                  <Ionicons name={genericIconFor(device.kind)} size={32} color={stylesVars.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>{device.name}</Text>
                  <Text style={styles.heroSub}>
                    {device.isOn ? 'Running' : 'Off'}
                    {roomName ? ` • ${roomName}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.capabilitiesWrap}>
                <DeviceCapabilityControls device={device} context="detail" variant="light" layout="cards" />
              </View>
            </View>
          ) : isAC ? (
            <>
              <RadialDial
                size={dialSize}
                value={temp}
                min={AC_TEMP_MIN_C}
                max={AC_TEMP_MAX_C}
                tickValues={[AC_TEMP_MIN_C, AC_TEMP_MIN_C + 2, AC_TEMP_MIN_C + 4, AC_TEMP_MAX_C - 5]}
                centerValue={roomTemp}
                centerLabel="Room Temperature"
                dimmed={!device.isOn}
                onChange={(v) => sendPatch({ tempC: v, isOn: true })}
              />

              <Text style={[styles.moodLabel, { fontSize: moodLabelSize }]}>Mood</Text>
              <Text style={[styles.moodValue, { fontSize: moodValueSize }]}>
                {mode[0].toUpperCase() + mode.slice(1)}
              </Text>

              <ModeTiles value={mode} onChange={(m) => sendPatch({ mode: m, isOn: true })} />
            </>
          ) : (
            <View style={{ marginTop: 28 }}>
              {!hasCustom && (
                <View style={styles.genericHero}>
                  <View style={styles.genericIcon}>
                    <Ionicons name={genericIconFor(device.kind)} size={32} color={stylesVars.ink} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroTitle}>{device.name}</Text>
                    <Text style={styles.heroSub}>{device.isOn ? 'Running' : 'Off'}</Text>
                  </View>
                </View>
              )}

              {device.kind === 'light' && (
                <View style={[styles.lightLayout, lightLayoutRow && styles.lightLayoutRow, { gap: lightCardGap }]}>
                  <View style={styles.lightDialColumn}>
                    <View style={lightDialCardStyle}>
                      <RadialDial
                        size={lightDialSize}
                        value={brightness}
                        min={0}
                        max={100}
                        tickValues={[0, 25, 50, 75, 100]}
                        centerContent={
                          <Animated.View
                            style={[
                              styles.lightCenterOrb,
                              { width: lightCenterSize, height: lightCenterSize, borderRadius: lightCenterSize / 2 },
                              bulbIsLight && styles.lightCenterOrbLight,
                              { transform: [{ scale: bulbScale }] },
                            ]}
                          >
                            <LinearGradient
                              colors={bulbGradient}
                              start={{ x: 0.2, y: 0.1 }}
                              end={{ x: 0.9, y: 1 }}
                              style={[
                                styles.lightCenterInner,
                                bulbIsLight && styles.lightCenterInnerLight,
                                { borderColor: bulbInnerBorder, borderRadius: lightCenterSize / 2 },
                              ]}
                            >
                              <Ionicons name="bulb" size={lightCenterIcon} color={bulbIconColor} />
                              <Text
                                style={[
                                  styles.lightCenterValue,
                                  { color: bulbTextColor, fontSize: lightCenterValueSize, marginTop: lightCenterValueMargin },
                                ]}
                              >
                                {device.brightness ?? 60}%
                              </Text>
                              <Text
                                style={[
                                  styles.lightCenterRoom,
                                  { color: bulbSubColor, fontSize: lightCenterRoomSize, marginTop: lightCenterRoomMargin },
                                ]}
                              >
                                {roomName || 'Light'}
                              </Text>
                            </LinearGradient>
                          </Animated.View>
                        }
                        formatTick={(v) => `${v}`}
                        formatValue={(v) => `${v}%`}
                        formatCenterValue={(v) => `${v}%`}
                        dimmed={!device.isOn}
                        onChange={(v) => {
                          animateBulb();
                          sendPatch({ brightness: clamp(v, 0, 100), isOn: v > 0 });
                        }}
                      />

                      <Text style={[styles.cardHint, { fontSize: lightSubLabelSize }]}>Color</Text>
                      <View style={[styles.colorRow, { gap: lightCardGap }]}>
                        {['#FFD166', '#A0E9FF', '#FF9AA2', '#B69CFF', '#A5FF9B', '#FFFFFF'].map((c) => (
                          <Pressable
                            key={c}
                            onPress={() => sendPatch({ color: c, isOn: true })}
                            style={[
                              styles.swatch,
                              lightSwatchStyle,
                              { backgroundColor: c },
                              device.color === c && styles.swatchActive,
                            ]}
                          />
                        ))}
                      </View>

                      <Text style={[styles.cardHint, { fontSize: lightSubLabelSize }]}>Scenes</Text>
                      <View style={[styles.sceneRow, { gap: lightCardGap }]}>
                        {[
                          { label: 'Warm', brightness: 60, color: '#FFD166', icon: 'sunny' as const },
                          { label: 'Cool', brightness: 70, color: '#A0E9FF', icon: 'snow' as const },
                          { label: 'Focus', brightness: 80, color: '#FFFFFF', icon: 'flash' as const },
                        ].map((scene) => (
                          <Pressable
                            key={scene.label}
                            style={[styles.sceneCardItem, lightSceneItemStyle]}
                            onPress={() => {
                              animateBulb();
                              sendPatch({
                                brightness: scene.brightness,
                                color: scene.color,
                                isOn: true,
                              });
                            }}
                          >
                            <View
                              style={[
                                styles.sceneIconWrap,
                                {
                                  width: lightSceneIconSize + 18,
                                  height: lightSceneIconSize + 18,
                                  borderRadius: Math.round((lightSceneIconSize + 18) / 2),
                                },
                              ]}
                            >
                              <Ionicons name={scene.icon} size={lightSceneIconSize} color={stylesVars.ink} />
                            </View>
                            <Text style={[styles.sceneText, { fontSize: lightSubLabelSize }]}>{scene.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>

                  <View style={lightControlsColumnStyle}>
                    {isTablet ? (
                      <>
                        <View style={lightControlCardStyle}>
                          <Text style={styles.cardLabel}>Temperature</Text>
                          <Text style={[styles.cardHint, { fontSize: lightSubLabelSize }]}>{colorTempK}K</Text>
                          <View style={styles.chipRow}>
                            {LIGHT_TEMP_PRESETS.map((preset) => {
                              const active = Math.abs(colorTempK - preset.value) <= 200;
                              return (
                                <Pressable
                                  key={preset.label}
                                  style={[styles.chip, active && styles.chipActive]}
                                  onPress={() => sendPatch({ colorTempK: preset.value, isOn: true })}
                                >
                                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          <Text style={[styles.cardHint, { fontSize: lightSubLabelSize, marginTop: 6 }]}>Effects</Text>
                          <View style={[styles.chipRow, { marginTop: 6 }]}>
                            {LIGHT_EFFECTS.map((effect) => {
                              const active = lightEffect === effect.value;
                              return (
                                <Pressable
                                  key={effect.value}
                                  style={[styles.chip, styles.chipRowItem, active && styles.chipActive]}
                                  onPress={() => sendPatch({ lightEffect: effect.value, isOn: true })}
                                >
                                  <Ionicons
                                    name={effect.icon}
                                    size={lightSceneIconSize}
                                    color={active ? stylesVars.ink : stylesVars.subtext}
                                  />
                                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{effect.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>

                        <View style={lightControlCardStyle}>
                          <Text style={styles.cardLabel}>Automation</Text>
                          <View style={styles.chipRow}>
                            <Pressable
                              style={[styles.chip, adaptiveLighting && styles.chipActive]}
                              onPress={() => sendPatch({ adaptiveLighting: !adaptiveLighting })}
                            >
                              <Text style={[styles.chipText, adaptiveLighting && styles.chipTextActive]}>Adaptive</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.chip, motionBoost && styles.chipActive]}
                              onPress={() => sendPatch({ motionBoost: !motionBoost })}
                            >
                              <Text style={[styles.chipText, motionBoost && styles.chipTextActive]}>Motion</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.chip, nightShift && styles.chipActive]}
                              onPress={() => sendPatch({ nightShift: !nightShift })}
                            >
                              <Text style={[styles.chipText, nightShift && styles.chipTextActive]}>Night Shift</Text>
                            </Pressable>
                          </View>

                          <Text style={[styles.cardHint, { fontSize: lightSubLabelSize, marginTop: 6 }]}>Auto-off</Text>
                          <View style={[styles.chipRow, { marginTop: 6 }]}>
                            {LIGHT_AUTO_OFF.map((minutes) => {
                              const active = autoOffMin === minutes;
                              return (
                                <Pressable
                                  key={minutes}
                                  style={[styles.chip, active && styles.chipActive]}
                                  onPress={() => sendPatch({ autoOffMin: minutes })}
                                >
                                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                    {minutes === 0 ? 'Off' : `${minutes}m`}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      </>
                    ) : (
                      <View style={lightControlCardStyle}>
                        <Text style={styles.cardLabel}>Temperature</Text>
                        <Text style={[styles.cardHint, { fontSize: lightSubLabelSize }]}>{colorTempK}K</Text>
                        <View style={styles.chipRow}>
                          {LIGHT_TEMP_PRESETS.map((preset) => {
                            const active = Math.abs(colorTempK - preset.value) <= 200;
                            return (
                              <Pressable
                                key={preset.label}
                                style={[styles.chip, active && styles.chipActive]}
                                onPress={() => sendPatch({ colorTempK: preset.value, isOn: true })}
                              >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset.label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <Text style={[styles.cardHint, { fontSize: lightSubLabelSize, marginTop: 6 }]}>Effects</Text>
                        <View style={[styles.chipRow, { marginTop: 6 }]}>
                          {LIGHT_EFFECTS.map((effect) => {
                            const active = lightEffect === effect.value;
                            return (
                              <Pressable
                                key={effect.value}
                                style={[styles.chip, styles.chipRowItem, active && styles.chipActive]}
                                onPress={() => sendPatch({ lightEffect: effect.value, isOn: true })}
                              >
                                <Ionicons
                                  name={effect.icon}
                                  size={lightSceneIconSize}
                                  color={active ? stylesVars.ink : stylesVars.subtext}
                                />
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>{effect.label}</Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <Text style={[styles.cardHint, { fontSize: lightSubLabelSize, marginTop: 6 }]}>Automation</Text>
                        <View style={styles.chipRow}>
                          <Pressable
                            style={[styles.chip, adaptiveLighting && styles.chipActive]}
                            onPress={() => sendPatch({ adaptiveLighting: !adaptiveLighting })}
                          >
                            <Text style={[styles.chipText, adaptiveLighting && styles.chipTextActive]}>Adaptive</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.chip, motionBoost && styles.chipActive]}
                            onPress={() => sendPatch({ motionBoost: !motionBoost })}
                          >
                            <Text style={[styles.chipText, motionBoost && styles.chipTextActive]}>Motion</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.chip, nightShift && styles.chipActive]}
                            onPress={() => sendPatch({ nightShift: !nightShift })}
                          >
                            <Text style={[styles.chipText, nightShift && styles.chipTextActive]}>Night Shift</Text>
                          </Pressable>
                        </View>

                        <Text style={[styles.cardHint, { fontSize: lightSubLabelSize, marginTop: 6 }]}>Auto-off</Text>
                        <View style={[styles.chipRow, { marginTop: 6 }]}>
                          {LIGHT_AUTO_OFF.map((minutes) => {
                            const active = autoOffMin === minutes;
                            return (
                              <Pressable
                                key={minutes}
                                style={[styles.chip, active && styles.chipActive]}
                                onPress={() => sendPatch({ autoOffMin: minutes })}
                              >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                  {minutes === 0 ? 'Off' : `${minutes}m`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {device.kind === 'garage' && (
                <>
                  <View style={styles.garageHero}>
                    <View style={styles.garageIcon}>
                      <Ionicons name="car-sport" size={32} color={stylesVars.ink} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.heroTitle}>{device.name}</Text>
                      <Text style={styles.heroSub}>{device.isOn ? 'Open' : 'Closed'}</Text>
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.modeTile, device.isOn && styles.modeTileActive]}
                      onPress={() => sendPatch({ isOn: true })}
                    >
                      {device.isOn ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="arrow-up" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, device.isOn && styles.modeTextActive]}>Open</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeTile, !device.isOn && styles.modeTileActive]}
                      onPress={() => sendPatch({ isOn: false })}
                    >
                      {!device.isOn ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="arrow-down" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="arrow-down" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, !device.isOn && styles.modeTextActive]}>Close</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {device.kind === 'door' && (
                <>
                  <View style={styles.doorWrap}>
                    <View style={styles.doorFrame}>
                      <Animated.View
                        style={[
                          styles.doorPanel,
                          {
                            transform: [
                              { perspective: 800 },
                              {
                                rotateY: doorSwing.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ['0deg', '-62deg'],
                                }),
                              },
                            ],
                          },
                        ]}
                      >
                        <View style={styles.doorHandle} />
                      </Animated.View>
                    </View>
                    <Text style={styles.doorTitle}>{device.name}</Text>
                    <Text style={styles.doorStatus}>{device.isOn ? 'Open' : 'Closed'}</Text>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.modeTile, device.isOn && styles.modeTileActive]}
                      onPress={() => sendPatch({ isOn: true })}
                    >
                      {device.isOn ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="lock-open" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="lock-open" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, device.isOn && styles.modeTextActive]}>Open</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeTile, !device.isOn && styles.modeTileActive]}
                      onPress={() => sendPatch({ isOn: false })}
                    >
                      {!device.isOn ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="lock-closed" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, !device.isOn && styles.modeTextActive]}>Close</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {device.kind === 'gate' && (
                <>
                  <View style={styles.infoOrb}>
                    <LinearGradient
                      colors={['#D9F0FF', '#7A5CFF']}
                      start={{ x: 0.2, y: 0.1 }}
                      end={{ x: 0.9, y: 1 }}
                      style={styles.infoOrbInner}
                    >
                      <Ionicons name="exit" size={32} color="#fff" />
                      <Text style={styles.infoValue}>{gateOpen > 20 ? 'OPEN' : 'CLOSED'}</Text>
                      <Text style={styles.infoSub}>Front Gate</Text>
                    </LinearGradient>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable style={styles.modeTile} onPress={openGate}>
                      <View style={styles.modeIconBubble}>
                        <Ionicons name="lock-open" size={18} color="rgba(12,12,18,0.65)" />
                      </View>
                      <Text style={styles.modeText}>Open</Text>
                    </Pressable>
                    <Pressable style={styles.modeTile} onPress={closeGate}>
                      <View style={styles.modeIconBubble}>
                        <Ionicons name="lock-closed" size={18} color="rgba(12,12,18,0.65)" />
                      </View>
                      <Text style={styles.modeText}>Close</Text>
                    </Pressable>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Auto-open</Text>
                    <Text style={styles.cardHint}>Use recognition + proximity to unlock for known faces.</Text>
                    <View style={styles.chipRow}>
                      <Pressable
                        style={[styles.chip, gateAutoOpen && styles.chipActive]}
                        onPress={() =>
                          sendPatch({ autoOpenEnabled: !gateAutoOpen })
                        }
                      >
                        <Text style={[styles.chipText, gateAutoOpen && styles.chipTextActive]}>
                          {gateAutoOpen ? 'Enabled' : 'Disabled'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}

              {device.kind === 'fridge' && (
                <>
                  <RadialDial
                    size={compactDialSize}
                    value={fridgeTemp}
                    min={1}
                    max={8}
                    tickValues={[1, 3, 5, 7, 8]}
                    centerLabel="Fridge Temp"
                    centerIcon={
                      <View style={{ marginBottom: 6 }}>
                        <Ionicons name="thermometer" size={28} color={stylesVars.ink} />
                      </View>
                    }
                    formatTick={(v) => `${v}`}
                    formatValue={(v) => `${v}`}
                    formatCenterValue={(v) => `${v}°C`}
                    dimmed={!device.isOn}
                    onChange={(v) => sendPatch({ tempC: clamp(v, 1, 8), isOn: true })}
                  />

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Presets</Text>
                    <View style={styles.chipRow}>
                      {[
                        { label: 'Eco', value: 5 },
                        { label: 'Normal', value: 4 },
                        { label: 'Boost', value: 2 },
                      ].map((preset) => {
                        const active = fridgeTemp === preset.value;
                        return (
                          <Pressable
                            key={preset.label}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => sendPatch({ tempC: preset.value, isOn: true })}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}

              {device.kind === 'fan' && (
                <>
                  <RadialDial
                    size={compactDialSize}
                    value={fanSpeed}
                    min={0}
                    max={100}
                    tickValues={[0, 25, 50, 75, 100]}
                    centerLabel="Fan Speed"
                    centerIcon={
                      <View style={{ marginBottom: 6 }}>
                        <Ionicons name="aperture" size={28} color={stylesVars.ink} />
                      </View>
                    }
                    formatTick={(v) => `${v}`}
                    formatValue={(v) => `${v}%`}
                    formatCenterValue={(v) => `${v}%`}
                    dimmed={!device.isOn}
                    onChange={(v) => sendPatch({ speed: clamp(v, 0, 100), isOn: v > 0 })}
                  />

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Modes</Text>
                    <View style={styles.chipRow}>
                      {[
                        { label: 'Breeze', value: 35 },
                        { label: 'Standard', value: 60 },
                        { label: 'Turbo', value: 90 },
                      ].map((preset) => {
                        const active = fanSpeed === preset.value;
                        return (
                          <Pressable
                            key={preset.label}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => sendPatch({ speed: preset.value, isOn: true })}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}

              {device.kind === 'window' && (
                <>
                  <RadialDial
                    size={compactDialSize}
                    value={windowOpen}
                    min={0}
                    max={100}
                    tickValues={[0, 25, 50, 75, 100]}
                    centerLabel="Open"
                    centerIcon={
                      <View style={{ marginBottom: 6 }}>
                        <Ionicons name="copy" size={26} color={stylesVars.ink} />
                      </View>
                    }
                    formatTick={(v) => `${v}`}
                    formatValue={(v) => `${v}%`}
                    formatCenterValue={(v) => `${v}%`}
                    dimmed={!device.isOn}
                    onChange={(v) =>
                      sendPatch({ openPercent: clamp(v, 0, 100), isOn: v > 0 })
                    }
                  />

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Quick set</Text>
                    <View style={styles.chipRow}>
                      {[
                        { label: 'Open', value: 100 },
                        { label: 'Vent', value: 25 },
                        { label: 'Close', value: 0 },
                      ].map((preset) => {
                        const active = windowOpen === preset.value;
                        return (
                          <Pressable
                            key={preset.label}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() =>
                              sendPatch({ openPercent: preset.value, isOn: preset.value > 0 })
                            }
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}

              {device.kind === 'vacuum' && (
                <>
                  <View style={styles.infoOrb}>
                    <LinearGradient
                      colors={['#D6D1FF', '#8B5CFF']}
                      start={{ x: 0.2, y: 0.1 }}
                      end={{ x: 0.9, y: 1 }}
                      style={styles.infoOrbInner}
                    >
                      <Ionicons name="sparkles" size={32} color="#fff" />
                      <Text style={styles.infoValue}>{(device.status ?? 'docked').toUpperCase()}</Text>
                      <Text style={styles.infoSub}>Battery {device.battery ?? 0}%</Text>
                    </LinearGradient>
                  </View>

                  <View style={styles.actionRow}>
                    {[
                      { label: 'Clean', icon: 'play', status: 'cleaning' as const, on: true },
                      { label: 'Pause', icon: 'pause', status: 'paused' as const, on: false },
                      { label: 'Dock', icon: 'home', status: 'docked' as const, on: false },
                    ].map((action) => {
                      const active = (device.status ?? 'docked') === action.status;
                      return (
                        <Pressable
                          key={action.label}
                          style={[styles.modeTile, active && styles.modeTileActive]}
                          onPress={() =>
                            sendPatch({ status: action.status, isOn: action.on })
                          }
                        >
                          {active ? (
                            <LinearGradient
                              colors={[theme.colors.accent2, theme.colors.accent]}
                              start={{ x: 0.1, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.modeIconBubbleActive}
                            >
                              <Ionicons name={action.icon as any} size={18} color="#FFFFFF" />
                            </LinearGradient>
                          ) : (
                            <View style={styles.modeIconBubble}>
                              <Ionicons name={action.icon as any} size={18} color="rgba(12,12,18,0.65)" />
                            </View>
                          )}
                          <Text style={[styles.modeText, active && styles.modeTextActive]}>{action.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {device.kind === 'camera' && (
                <>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.9)', 'rgba(236,228,255,0.85)']}
                    start={{ x: 0.1, y: 0.1 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cameraFeed}
                  >
                    <View style={styles.cameraFeedHeader}>
                      <View style={styles.cameraLivePill}>
                        <View style={styles.cameraLiveDot} />
                        <Text style={styles.cameraLiveText}>Live</Text>
                      </View>
                      <Text style={styles.cameraStatusText}>{device.isOn ? 'Connected' : 'Offline'}</Text>
                      {gateDevice ? (
                        <View style={styles.gateStatusPill}>
                          <Text style={styles.gateStatusText}>
                            Gate {gateDevice.openPercent && gateDevice.openPercent > 20 ? 'Open' : 'Closed'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.cameraFeedBody}>
                      <Ionicons name="videocam" size={40} color="rgba(12,12,18,0.35)" />
                      <Text style={styles.cameraPreviewText}>Live feed (simulated)</Text>
                    </View>
                  </LinearGradient>

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.modeTile, device.armed && styles.modeTileActive]}
                      onPress={() => sendPatch({ armed: !device.armed })}
                    >
                      {device.armed ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="eye" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="eye" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, device.armed && styles.modeTextActive]}>
                        {device.armed ? 'Armed' : 'Arm'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeTile, device.recording && styles.modeTileActive]}
                      onPress={() => sendPatch({ recording: !device.recording })}
                    >
                      {device.recording ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="radio-button-on" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="radio-button-on" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, device.recording && styles.modeTextActive]}>
                        {device.recording ? 'Recording' : 'Record'}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Recognize faces</Text>
                    <View style={styles.cameraDetectRow}>
                      {household.map((member) => (
                        <Pressable
                          key={member.id}
                          style={styles.cameraDetectPill}
                          onPress={() => handleKnownFace(member.id, member.name)}
                        >
                          <Ionicons name="person" size={16} color={stylesVars.ink} />
                          <Text style={styles.cameraDetectText}>{member.name.split(' ')[0]}</Text>
                        </Pressable>
                      ))}
                      <Pressable style={styles.cameraDetectPillAlert} onPress={handleUnknownFace}>
                        <Ionicons name="alert" size={16} color="#C4384C" />
                        <Text style={[styles.cameraDetectText, { color: '#C4384C' }]}>Unknown</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Household presence</Text>
                    {household.map((member) => (
                      <View key={member.id} style={styles.cameraMemberRow}>
                        <AvatarChip
                          name={member.name}
                          size={32}
                          color={member.avatarColor}
                          uri={member.avatarUri}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cameraMemberName}>{member.name}</Text>
                          <Text style={styles.cameraMemberRole}>{member.role}</Text>
                        </View>
                        <Pressable
                          style={[
                            styles.cameraPresencePill,
                            member.status === 'home' ? styles.cameraPresenceHome : styles.cameraPresenceAway,
                          ]}
                          onPress={() =>
                            setHouseholdPresence(member.id, member.status === 'home' ? 'away' : 'home')
                          }
                        >
                          <Text style={styles.cameraPresenceText}>
                            {member.status === 'home' ? 'Home' : 'Away'}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>

                  {gateDevice ? (
                    <View style={controlCardStyle}>
                      <Text style={styles.cardLabel}>Front gate access</Text>
                      <View style={controlCardRowStyle}>
                        <Pressable style={styles.controlPill} onPress={openGate}>
                          <Text style={styles.controlPillText}>Open gate</Text>
                        </Pressable>
                        <Pressable style={styles.controlPill} onPress={closeGate}>
                          <Text style={styles.controlPillText}>Close gate</Text>
                        </Pressable>
                      </View>
                      <View style={styles.chipRow}>
                        <Pressable
                          style={[styles.chip, gateAutoOpen && styles.chipActive]}
                          onPress={() =>
                            deviceClient
                              .sendCommand({
                                op: 'patch',
                                deviceId: gateDevice.id,
                                patch: { autoOpenEnabled: !gateAutoOpen },
                              })
                              .catch(() => {})
                          }
                        >
                          <Text style={[styles.chipText, gateAutoOpen && styles.chipTextActive]}>
                            Auto-open {gateAutoOpen ? 'On' : 'Off'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  {cameraEvents.length > 0 ? (
                    <View style={controlCardStyle}>
                      <Text style={styles.cardLabel}>Recent detections</Text>
                      {cameraEvents.map((evt) => (
                        <View key={evt.id} style={styles.cameraEventRow}>
                          <View
                            style={[
                              styles.cameraEventDot,
                              evt.kind === 'known' ? styles.cameraEventDotKnown : styles.cameraEventDotUnknown,
                            ]}
                          />
                          <Text style={styles.cameraEventText}>{evt.label}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Security</Text>
                    <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                      <Pressable
                        style={[styles.controlPill, nightVision && styles.controlPillActive]}
                        onPress={() => sendPatch({ nightVision: !nightVision })}
                      >
                        <Text style={[styles.controlPillText, nightVision && styles.controlPillTextActive]}>
                          {nightVision ? 'Night On' : 'Night Off'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.controlPill, motionAlerts && styles.controlPillActive]}
                        onPress={() => sendPatch({ motionAlerts: !motionAlerts })}
                      >
                        <Text style={[styles.controlPillText, motionAlerts && styles.controlPillTextActive]}>
                          {motionAlerts ? 'Alerts On' : 'Alerts Off'}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={controlCardRowStyle}>
                      <Pressable
                        style={[styles.controlPill, micMuted && styles.controlPillActive]}
                        onPress={() => sendPatch({ micMuted: !micMuted })}
                      >
                        <Text style={[styles.controlPillText, micMuted && styles.controlPillTextActive]}>
                          {micMuted ? 'Mic Muted' : 'Mic Live'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.controlPill, twoWayAudio && styles.controlPillActive]}
                        onPress={() => sendPatch({ twoWayAudio: !twoWayAudio })}
                      >
                        <Text style={[styles.controlPillText, twoWayAudio && styles.controlPillTextActive]}>
                          {twoWayAudio ? 'Talk On' : 'Talk Off'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Motion sensitivity</Text>
                    <View style={styles.chipRow}>
                      {[
                        { label: 'Low', value: 3 },
                        { label: 'Med', value: 6 },
                        { label: 'High', value: 9 },
                      ].map((preset) => {
                        const active = motionSensitivity === preset.value;
                        return (
                          <Pressable
                            key={preset.label}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => sendPatch({ motionSensitivity: preset.value })}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {preset.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}

              {device.kind === 'stove' && (
                <>
                  <RadialDial
                    size={compactDialSize}
                    value={stoveLevel}
                    min={0}
                    max={10}
                    tickValues={[0, 2, 4, 6, 8, 10]}
                    centerLabel="Heat"
                    centerIcon={
                      <View style={{ marginBottom: 6 }}>
                        <Ionicons name="flame" size={28} color={stylesVars.ink} />
                      </View>
                    }
                    formatTick={(v) => `${v}`}
                    formatValue={(v) => `${v}`}
                    formatCenterValue={(v) => `Lv ${v}`}
                    dimmed={!device.isOn}
                    onChange={(v) =>
                      sendPatch({ burnerLevel: clamp(v, 0, 10), isOn: v > 0 })
                    }
                  />

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Presets</Text>
                    <View style={styles.chipRow}>
                      {[
                        { label: 'Off', value: 0 },
                        { label: 'Low', value: 3 },
                        { label: 'Med', value: 6 },
                        { label: 'High', value: 9 },
                      ].map((preset) => {
                        const active = stoveLevel === preset.value;
                        return (
                          <Pressable
                            key={preset.label}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() =>
                              sendPatch({ burnerLevel: preset.value, isOn: preset.value > 0 })
                            }
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </>
              )}

              {(device.kind === 'washer' || device.kind === 'dryer') && (
                <>
                  <RadialDial
                    size={compactDialSize}
                    value={washerProgress}
                    min={0}
                    max={100}
                    tickValues={[0, 25, 50, 75, 100]}
                    centerLabel="Cycle"
                    centerIcon={
                      <View style={{ marginBottom: 6 }}>
                        <Ionicons name="sync" size={28} color={stylesVars.ink} />
                      </View>
                    }
                    formatTick={(v) => `${v}`}
                    formatValue={(v) => `${v}%`}
                    formatCenterValue={(v) => `${v}%`}
                    dimmed={!device.isOn}
                    onChange={(v) =>
                      sendPatch({ progress: clamp(v, 0, 100), isOn: v > 0 })
                    }
                  />

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Cycle</Text>
                    <View style={styles.chipRow}>
                      {['Normal', 'Quick', 'Eco'].map((label) => {
                        const active = (device.cycle ?? 'Normal') === label;
                        return (
                          <Pressable
                            key={label}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => sendPatch({ cycle: label })}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.modeTile, device.isOn && styles.modeTileActive]}
                      onPress={() => sendPatch({ isOn: true })}
                    >
                      {device.isOn ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="play" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="play" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, device.isOn && styles.modeTextActive]}>Start</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeTile, !device.isOn && styles.modeTileActive]}
                      onPress={() => sendPatch({ isOn: false })}
                    >
                      {!device.isOn ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="pause" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="pause" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, !device.isOn && styles.modeTextActive]}>Pause</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {device.kind === 'microwave' && (
                <>
                  <RadialDial
                    size={compactDialSize}
                    value={Math.round(microwaveSeconds)}
                    min={0}
                    max={900}
                    tickValues={[0, 300, 600, 900]}
                    centerLabel="Time"
                    centerIcon={
                      <View style={{ marginBottom: 6 }}>
                        <Ionicons name="timer" size={28} color={stylesVars.ink} />
                      </View>
                    }
                    formatTick={(v) => `${Math.round(v / 60)}`}
                    formatValue={(v) => formatClock(v)}
                    formatCenterValue={(v) => formatClock(v)}
                    dimmed={!device.isOn}
                    onChange={(v) =>
                      sendPatch({ timeRemainingSec: clamp(v, 0, 900), isOn: v > 0 })
                    }
                  />

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.modeTile, device.isOn && styles.modeTileActive]}
                      onPress={() => sendPatch({ isOn: true })}
                    >
                      {device.isOn ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="play" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="play" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, device.isOn && styles.modeTextActive]}>Start</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeTile, !device.isOn && styles.modeTileActive]}
                      onPress={() => sendPatch({ isOn: false })}
                    >
                      {!device.isOn ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="stop" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="stop" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, !device.isOn && styles.modeTextActive]}>Stop</Text>
                    </Pressable>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Quick add</Text>
                    <View style={styles.chipRow}>
                      {[
                        { label: '+30s', value: 30 },
                        { label: '+1m', value: 60 },
                        { label: '+2m', value: 120 },
                      ].map((preset) => (
                        <Pressable
                          key={preset.label}
                          style={styles.chip}
                          onPress={() => {
                            const next = clamp(microwaveSeconds + preset.value, 0, 900);
                            sendPatch({ timeRemainingSec: next, isOn: next > 0 });
                          }}
                        >
                          <Text style={styles.chipText}>{preset.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </>
              )}

              {device.kind === 'energy' && (
                <>
                  <View style={styles.infoOrb}>
                    <LinearGradient
                      colors={['#CDE7FF', '#8B5CFF']}
                      start={{ x: 0.2, y: 0.1 }}
                      end={{ x: 0.9, y: 1 }}
                      style={styles.infoOrbInner}
                    >
                      <Ionicons name="stats-chart" size={32} color="#fff" />
                      <Text style={styles.infoValue}>{energyPower}W</Text>
                      <Text style={styles.infoSub}>{energyToday} kWh today</Text>
                    </LinearGradient>
                  </View>

                  <View style={styles.metricRow}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{energyPower}W</Text>
                      <Text style={styles.metricLabel}>Now</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{energyToday} kWh</Text>
                      <Text style={styles.metricLabel}>Today</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{energyPeak}W</Text>
                      <Text style={styles.metricLabel}>Peak</Text>
                    </View>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Monthly budget</Text>
                    <View style={styles.chipRow}>
                      {[80, 120, 160].map((value) => {
                        const active = energyBudget === value;
                        return (
                          <Pressable
                            key={value}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => sendPatch({ energyBudgetKwh: value })}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{value} kWh</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.budgetHint}>
                      {energyBudget ? `${energyMonth} / ${energyBudget} kWh used` : `${energyMonth} kWh this month`}
                    </Text>
                  </View>

                  <View style={styles.metricRow}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{energyMonth} kWh</Text>
                      <Text style={styles.metricLabel}>This month</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>${energyCostToday.toFixed(2)}</Text>
                      <Text style={styles.metricLabel}>Today cost</Text>
                    </View>
                  </View>
                </>
              )}

              {device.kind === 'water' && (
                <>
                  <View style={styles.infoOrb}>
                    <LinearGradient
                      colors={['#BFE7FF', '#6B3CFF']}
                      start={{ x: 0.2, y: 0.1 }}
                      end={{ x: 0.9, y: 1 }}
                      style={styles.infoOrbInner}
                    >
                      <Ionicons name="water" size={32} color="#fff" />
                      <Text style={styles.infoValue}>{waterFlow} L/min</Text>
                      <Text style={styles.infoSub}>{waterToday} L today</Text>
                    </LinearGradient>
                  </View>

                  <View style={styles.metricRow}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{waterFlow} L/min</Text>
                      <Text style={styles.metricLabel}>Flow</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{waterPressure} psi</Text>
                      <Text style={styles.metricLabel}>Pressure</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{waterTemp}C</Text>
                      <Text style={styles.metricLabel}>Temp</Text>
                    </View>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Daily budget</Text>
                    <View style={styles.chipRow}>
                      {[150, 220, 280].map((value) => {
                        const active = waterBudget === value;
                        return (
                          <Pressable
                            key={value}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => sendPatch({ waterBudgetL: value })}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{value} L</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.budgetHint}>
                      {waterBudget ? `${waterToday} / ${waterBudget} L used` : `${waterToday} L today`}
                    </Text>
                    {waterLeakDetected && (
                      <View style={styles.alertRow}>
                        <Ionicons name="warning" size={14} color="#D8465B" />
                        <Text style={styles.alertText}>Leak detected</Text>
                      </View>
                    )}
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Safety</Text>
                    <View style={[controlCardRowStyle, { marginTop: 8 }]}>
                      <Pressable
                        style={[styles.controlPill, waterLeakAlerts && styles.controlPillActive]}
                        onPress={() => sendPatch({ waterLeakAlerts: !waterLeakAlerts })}
                      >
                        <Text style={[styles.controlPillText, waterLeakAlerts && styles.controlPillTextActive]}>
                          {waterLeakAlerts ? 'Leak Alerts' : 'Alerts Off'}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.controlPill, waterAutoShutoff && styles.controlPillActive]}
                        onPress={() => sendPatch({ waterAutoShutoff: !waterAutoShutoff })}
                      >
                        <Text style={[styles.controlPillText, waterAutoShutoff && styles.controlPillTextActive]}>
                          {waterAutoShutoff ? 'Auto Shutoff' : 'Shutoff Off'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}

              {device.kind === 'air' && (
                <>
                  <View style={styles.infoOrb}>
                    <LinearGradient
                      colors={['#C8F3E4', '#6B3CFF']}
                      start={{ x: 0.2, y: 0.1 }}
                      end={{ x: 0.9, y: 1 }}
                      style={styles.infoOrbInner}
                    >
                      <Ionicons name="leaf" size={32} color="#fff" />
                      <Text style={styles.infoValue}>AQI {airQuality}</Text>
                      <Text style={styles.infoSub}>Humidity {humidity}%</Text>
                    </LinearGradient>
                  </View>

                  <View style={styles.metricRow}>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>
                        {airQuality <= 50 ? 'Good' : airQuality <= 100 ? 'Moderate' : 'Poor'}
                      </Text>
                      <Text style={styles.metricLabel}>Quality</Text>
                    </View>
                    <View style={styles.metricCard}>
                      <Text style={styles.metricValue}>{humidity}%</Text>
                      <Text style={styles.metricLabel}>Humidity</Text>
                    </View>
                  </View>
                </>
              )}

              {device.kind === 'sprinkler' && (
                <>
                  <RadialDial
                    size={compactDialSize}
                    value={sprinklerDuration}
                    min={0}
                    max={60}
                    tickValues={[0, 15, 30, 45, 60]}
                    centerLabel="Minutes"
                    centerIcon={
                      <View style={{ marginBottom: 6 }}>
                        <Ionicons name="rainy" size={28} color={stylesVars.ink} />
                      </View>
                    }
                    formatTick={(v) => `${v}`}
                    formatValue={(v) => `${v}`}
                    formatCenterValue={(v) => `${v} min`}
                    dimmed={!device.isOn}
                    onChange={(v) => sendPatch({ durationMin: clamp(v, 0, 60) })}
                  />

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Zone</Text>
                    <View style={styles.chipRow}>
                      {['Front Yard', 'Back Yard', 'Garden'].map((zone) => {
                        const active = (device.zone ?? 'Front Yard') === zone;
                        return (
                          <Pressable
                            key={zone}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => sendPatch({ zone })}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{zone}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={controlCardStyle}>
                    <Text style={styles.cardLabel}>Schedule</Text>
                    {(device.schedule ?? []).length === 0 ? (
                      <Text style={styles.scheduleEmpty}>No schedules yet</Text>
                    ) : (
                      (device.schedule ?? []).map((s) => (
                        <View key={s.id} style={styles.scheduleRow}>
                          <View>
                            <Text style={styles.scheduleTime}>
                              {String(s.hour).padStart(2, '0')}:{String(s.minute).padStart(2, '0')}
                            </Text>
                            <Text style={styles.scheduleDays}>{s.days.join(' • ')}</Text>
                          </View>
                          <Pressable
                            style={[styles.scheduleToggle, s.enabled && styles.scheduleToggleActive]}
                            onPress={() => {
                              const next = (device.schedule ?? []).map((row) =>
                                row.id === s.id ? { ...row, enabled: !row.enabled } : row
                              );
                              sendPatch({ schedule: next });
                            }}
                          >
                            <Text style={[styles.scheduleToggleText, s.enabled && styles.scheduleToggleTextActive]}>
                              {s.enabled ? 'On' : 'Off'}
                            </Text>
                          </Pressable>
                        </View>
                      ))
                    )}

                    <Pressable style={styles.addSchedule} onPress={() => setShowSchedule(true)}>
                      <Ionicons name="add" size={16} color={stylesVars.ink} />
                      <Text style={styles.addScheduleText}>Add schedule</Text>
                    </Pressable>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.modeTile, device.isOn && styles.modeTileActive]}
                      onPress={() => sendPatch({ isOn: true })}
                    >
                      {device.isOn ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="play" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="play" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, device.isOn && styles.modeTextActive]}>Start</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeTile, !device.isOn && styles.modeTileActive]}
                      onPress={() => sendPatch({ isOn: false })}
                    >
                      {!device.isOn ? (
                        <LinearGradient
                          colors={[theme.colors.accent2, theme.colors.accent]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.modeIconBubbleActive}
                        >
                          <Ionicons name="stop" size={18} color="#FFFFFF" />
                        </LinearGradient>
                      ) : (
                        <View style={styles.modeIconBubble}>
                          <Ionicons name="stop" size={18} color="rgba(12,12,18,0.65)" />
                        </View>
                      )}
                      <Text style={[styles.modeText, !device.isOn && styles.modeTextActive]}>Stop</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {device.kind === 'speaker' && (
                <>
                  <RadialDial
                    size={compactDialSize}
                    value={speakerVolume}
                    min={0}
                    max={100}
                    tickValues={[0, 25, 50, 75, 100]}
                    dimmed={!device.isOn}
                    formatValue={(v) => `${v}`}
                    formatTick={(v) => `${v}`}
                    onChange={(v) => {
                      const next = clamp(v, 0, 100);
                      sendPatch({ volume: next, isOn: true });
                    }}
                    centerContent={
                      <View style={[styles.infoOrb, styles.infoOrbCompact]}>
                        <LinearGradient
                          colors={['#CDBBFF', '#6B3CFF']}
                          start={{ x: 0.2, y: 0.1 }}
                          end={{ x: 0.9, y: 1 }}
                          style={styles.infoOrbInner}
                        >
                          <Ionicons name="volume-high" size={32} color="#fff" />
                          <Text style={styles.infoValue} numberOfLines={1}>
                            {device.name}
                          </Text>
                          <Text style={styles.infoSub}>{roomName || 'Speaker'}</Text>
                        </LinearGradient>
                      </View>
                    }
                  />

                  <View style={styles.mediaRow}>
                    <Pressable style={styles.mediaBtn} onPress={() => sendPatch({ isOn: true })}>
                      <Ionicons name="play-skip-back" size={18} color={stylesVars.ink} />
                    </Pressable>
                    <Pressable
                      style={[styles.mediaBtn, device.isOn && styles.mediaBtnActive]}
                      onPress={() => sendPatch({ isOn: !device.isOn })}
                    >
                      <Ionicons name={device.isOn ? 'pause' : 'play'} size={18} color={stylesVars.ink} />
                    </Pressable>
                    <Pressable style={styles.mediaBtn} onPress={() => sendPatch({ isOn: true })}>
                      <Ionicons name="play-skip-forward" size={18} color={stylesVars.ink} />
                    </Pressable>
                  </View>
                </>
              )}

              {device.kind === 'smoke' && (
                <>
                  <View style={styles.infoOrb}>
                    <LinearGradient
                      colors={device.smokeDetected ? ['#FFB4B4', '#B46BFF'] : ['#D9F5E6', '#6B3CFF']}
                      start={{ x: 0.2, y: 0.1 }}
                      end={{ x: 0.9, y: 1 }}
                      style={styles.infoOrbInner}
                    >
                      <Ionicons
                        name={device.smokeDetected ? 'alert-circle' : 'checkmark-circle'}
                        size={32}
                        color="#fff"
                      />
                      <Text style={styles.infoValue}>{device.smokeDetected ? 'ALERT' : 'CLEAR'}</Text>
                      <Text style={styles.infoSub}>{device.name}</Text>
                    </LinearGradient>
                  </View>

                  <View style={controlCardRowStyle}>
                    <Pressable
                      style={styles.controlPill}
                      onPress={() => sendPatch({ smokeDetected: true })}
                    >
                      <Text style={styles.controlPillText}>Test alarm</Text>
                    </Pressable>
                    <Pressable
                      style={styles.controlPill}
                      onPress={() => sendPatch({ smokeDetected: false })}
                    >
                      <Text style={styles.controlPillText}>Silence</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {device.kind === 'tv' && (
                <>
                  <RadialDial
                    size={compactDialSize}
                    value={volume}
                    min={0}
                    max={100}
                    tickValues={[0, 25, 50, 75, 100]}
                    dimmed={!device.isOn}
                    formatValue={(v) => `${v}`}
                    formatTick={(v) => `${v}`}
                    onChange={(v) => {
                      const next = clamp(v, 0, 100);
                      deviceClient.sendCommand({ op: 'set-volume', deviceId: device.id, value: next }).catch(() => {});
                    }}
                    centerContent={
                      <View style={styles.tvOrb}>
                        <LinearGradient
                          colors={['#7AB8FF', '#6B3CFF']}
                          start={{ x: 0.2, y: 0.1 }}
                          end={{ x: 0.9, y: 1 }}
                          style={styles.tvOrbInner}
                        >
                          <Ionicons name="tv" size={40} color="#fff" />
                          <Text style={styles.tvName}>{device.name}</Text>
                          <Text style={styles.tvRoom}>{roomName || 'TV'}</Text>
                          <Text style={styles.tvRoom}>{source}</Text>
                          <Text style={styles.tvRoom}>Ch {channel}</Text>
                        </LinearGradient>
                      </View>
                    }
                  />

                  <View style={[controlCardStyle, styles.remoteCard]}>
                    <View style={styles.remoteGrid}>
                      {[
                        { label: 'Guide', icon: 'list', app: 'Guide' },
                        { label: 'YouTube', icon: 'logo-youtube', app: 'YouTube' },
                        { label: 'Netflix', icon: 'film', app: 'Netflix' },
                        { label: 'Settings', icon: 'settings', app: 'Settings' },
                      ].map((item) => (
                        <Pressable
                          key={item.label}
                          style={[styles.remoteBtn, styles.remoteBtnWide]}
                          onPress={() => {
                            deviceClient
                              .sendCommand({ op: 'launch-app', deviceId: device.id, app: item.app })
                              .catch(() => {});
                          }}
                        >
                          <Ionicons name={item.icon as any} size={18} color="#0c0c12" />
                          <Text style={styles.remoteText} numberOfLines={1}>
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={[styles.remoteRow, { marginTop: 8 }]}>
                      <Pressable
                        style={styles.remoteBtnCompact}
                        onPress={() =>
                          deviceClient.sendCommand({ op: 'media', deviceId: device.id, action: 'rewind' }).catch(() => {})
                        }
                      >
                        <Ionicons name="play-back" size={16} color="#0c0c12" />
                        <Text style={styles.remoteText}>Rew</Text>
                      </Pressable>
                      <Pressable
                        style={styles.remoteBtnCompact}
                        onPress={() =>
                          deviceClient
                            .sendCommand({ op: 'media', deviceId: device.id, action: 'play-pause' })
                            .catch(() => {})
                        }
                      >
                        <Ionicons name="play" size={16} color="#0c0c12" />
                        <Text style={styles.remoteText}>Play/Pause</Text>
                      </Pressable>
                      <Pressable
                        style={styles.remoteBtnCompact}
                        onPress={() =>
                          deviceClient.sendCommand({ op: 'media', deviceId: device.id, action: 'fast-forward' }).catch(() => {})
                        }
                      >
                        <Ionicons name="play-forward" size={16} color="#0c0c12" />
                        <Text style={styles.remoteText}>Fwd</Text>
                      </Pressable>
                    </View>
                    <View style={[styles.remoteRow, { marginTop: 6 }]}>
                      <Pressable
                        style={styles.remoteBtnCompact}
                        onPress={() =>
                          deviceClient.sendCommand({ op: 'media', deviceId: device.id, action: 'previous' }).catch(() => {})
                        }
                      >
                        <Ionicons name="play-skip-back" size={16} color="#0c0c12" />
                        <Text style={styles.remoteText}>Prev</Text>
                      </Pressable>
                      <Pressable
                        style={styles.remoteBtnCompact}
                        onPress={() =>
                          deviceClient.sendCommand({ op: 'media', deviceId: device.id, action: 'next' }).catch(() => {})
                        }
                      >
                        <Ionicons name="play-skip-forward" size={16} color="#0c0c12" />
                        <Text style={styles.remoteText}>Next</Text>
                      </Pressable>
                    </View>

                    <View style={styles.remotePadWrap}>
                      <View style={styles.remotePadArea}>
                        <Pressable
                          style={[styles.orbActionBtn, styles.remoteSideLeft]}
                          onPress={() => {
                            const next = !device.muted;
                            deviceClient
                              .sendCommand({ op: 'set-muted', deviceId: device.id, value: next })
                              .catch(() => {});
                          }}
                        >
                          <Ionicons
                            name={device.muted ? 'volume-mute' : 'volume-mute-outline'}
                            size={18}
                            color={stylesVars.ink}
                          />
                        </Pressable>
                        <View style={styles.navPad}>
                          <Pressable
                            style={[styles.navBtn, styles.navUp]}
                            onPress={() =>
                              deviceClient.sendCommand({ op: 'nav', deviceId: device.id, action: 'up' }).catch(() => {})
                            }
                          >
                            <Ionicons name="chevron-up" size={18} color="#0c0c12" />
                          </Pressable>
                          <Pressable
                            style={[styles.navBtn, styles.navLeft]}
                            onPress={() =>
                              deviceClient.sendCommand({ op: 'nav', deviceId: device.id, action: 'left' }).catch(() => {})
                            }
                          >
                            <Ionicons name="chevron-back" size={18} color="#0c0c12" />
                          </Pressable>
                          <Pressable
                            style={styles.navCenter}
                            onPress={() =>
                              deviceClient.sendCommand({ op: 'nav', deviceId: device.id, action: 'select' }).catch(() => {})
                            }
                          >
                            <Text style={styles.navCenterText}>OK</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.navBtn, styles.navRight]}
                            onPress={() =>
                              deviceClient.sendCommand({ op: 'nav', deviceId: device.id, action: 'right' }).catch(() => {})
                            }
                          >
                            <Ionicons name="chevron-forward" size={18} color="#0c0c12" />
                          </Pressable>
                          <Pressable
                            style={[styles.navBtn, styles.navDown]}
                            onPress={() =>
                              deviceClient.sendCommand({ op: 'nav', deviceId: device.id, action: 'down' }).catch(() => {})
                            }
                          >
                            <Ionicons name="chevron-down" size={18} color="#0c0c12" />
                          </Pressable>
                        </View>
                        <Pressable
                          style={[styles.orbActionBtn, styles.remoteSideRight]}
                          onPress={() => {
                            sendPatch({ source: 'Home', isOn: true });
                            deviceClient
                              .sendCommand({ op: 'nav', deviceId: device.id, action: 'home' })
                              .catch(() => {});
                          }}
                        >
                          <Ionicons name="home" size={18} color={stylesVars.ink} />
                        </Pressable>
                      </View>
                    </View>
                    <View style={[styles.remoteRow, { marginTop: 6 }]}>
                      <Pressable
                        style={styles.remoteBtnCompact}
                        onPress={() => {
                          const next = clamp(channel + 1, 1, 999);
                          deviceClient
                            .sendCommand({ op: 'set-channel', deviceId: device.id, value: next })
                            .catch(() => {});
                        }}
                      >
                        <Ionicons name="caret-up" size={18} color="#0c0c12" />
                        <Text style={styles.remoteText}>Ch +</Text>
                      </Pressable>
                      <Pressable
                        style={styles.remoteBtnCompact}
                        onPress={() => {
                          const next = clamp(channel - 1, 1, 999);
                          deviceClient
                            .sendCommand({ op: 'set-channel', deviceId: device.id, value: next })
                            .catch(() => {});
                        }}
                      >
                        <Ionicons name="caret-down" size={18} color="#0c0c12" />
                        <Text style={styles.remoteText}>Ch -</Text>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}

              {device.kind === 'coffee' && (
                <>
                  <View style={styles.coffeeOrb}>
                    <View style={styles.coffeeOrbInner}>
                      <Ionicons name="cafe" size={34} color="#fff" />
                      <Text style={styles.coffeeName}>{device.name}</Text>
                      <Text style={styles.coffeeRoom}>{roomName || 'Coffee'}</Text>
                      <View style={styles.coffeeCup}>
                        <Animated.View
                          style={[
                            styles.coffeeFill,
                            {
                              height: coffeeFill.interpolate({ inputRange: [0, 1], outputRange: ['10%', '90%'] }),
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={controlCardRowStyle}>
                    <Pressable
                      style={styles.controlPill}
                      onPress={() => {
                        animateCoffee(true);
                        sendPatch({ isOn: true });
                      }}
                    >
                      <Text style={styles.controlPillText}>Brew now</Text>
                    </Pressable>
                    <Pressable
                      style={styles.controlPill}
                      onPress={() => {
                        animateCoffee(false);
                        sendPatch({ isOn: false });
                      }}
                    >
                      <Text style={styles.controlPillText}>Stop</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}

          <View style={{ flex: 1 }} />

          <Pressable
            style={styles.powerWrap}
            onPress={() =>
              deviceClient
                .sendCommand({ op: 'patch', deviceId: device.id, patch: { isOn: !device.isOn } })
                .catch(() => {})
            }
          >
            <View style={[styles.powerRing, device.isOn && styles.powerRingOn]}>
              <LinearGradient
                colors={
                  device.isOn ? [theme.colors.accent2, theme.colors.accent] : ['rgba(255,255,255,0.88)', 'rgba(255,255,255,0.88)']
                }
                start={{ x: 0.1, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.powerInner}
              >
                <Ionicons name="power" size={24} color={device.isOn ? '#FFFFFF' : 'rgba(12,12,18,0.45)'} />
              </LinearGradient>
            </View>
          </Pressable>
        </LinearGradient>
      </SafeAreaView>

      <Modal transparent visible={showEdit} animationType="fade" onRequestClose={() => setShowEdit(false)}>
        <View style={styles.editOverlay}>
          <Pressable style={styles.editBackdrop} onPress={() => setShowEdit(false)} />
          <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })}>
            <View
              style={[
                styles.editCard,
                {
                  padding: editPad,
                  borderRadius: editRadius,
                  maxWidth: isTablet ? 560 : undefined,
                  width: isTablet ? Math.min(contentWidth - gutter * 2, 560) : undefined,
                  alignSelf: isTablet ? 'center' : 'stretch',
                },
              ]}
              testID="device-edit-card"
            >
              <Text style={[styles.editTitle, { fontSize: editTitleSize }]}>Edit device</Text>
              <Text style={[styles.editSub, { fontSize: editSubSize }]}>
                Rename or move this device to another room.
              </Text>

              <Text style={[styles.editLabel, { fontSize: editLabelSize }]}>Device name</Text>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Device name"
                placeholderTextColor="rgba(12,12,18,0.45)"
                style={[styles.editInput, { height: editInputHeight, borderRadius: Math.round(editInputHeight * 0.28) }]}
                autoCapitalize="words"
              />

              <Text style={[styles.editLabel, { fontSize: editLabelSize }]}>Room</Text>
              <View style={styles.roomRow}>
                {rooms.map((r) => {
                  const active = r.id === draftRoomId;
                  return (
                    <Pressable
                      key={r.id}
                      style={[
                        styles.roomPill,
                        { height: editInputHeight, borderRadius: Math.round(editInputHeight / 2) },
                        active && styles.roomPillActive,
                      ]}
                      onPress={() => setDraftRoomId(r.id)}
                    >
                      <Text
                        style={[
                          styles.roomPillText,
                          { fontSize: editLabelSize },
                          active && styles.roomPillTextActive,
                        ]}
                      >
                        {r.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.editActions}>
                <Pressable
                  style={[
                    styles.editGhost,
                    { height: editButtonHeight, borderRadius: Math.round(editButtonHeight * 0.28) },
                  ]}
                  onPress={() => setShowEdit(false)}
                >
                  <Text style={[styles.editGhostText, { fontSize: editLabelSize }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.editPrimary,
                    { height: editButtonHeight, borderRadius: Math.round(editButtonHeight * 0.28) },
                    !draftName.trim() && styles.editPrimaryDisabled,
                  ]}
                  onPress={() => {
                    if (!draftName.trim()) return;
                    sendPatch({ name: draftName.trim(), roomId: draftRoomId });
                    setShowEdit(false);
                  }}
                  disabled={!draftName.trim()}
                >
                  <Text style={[styles.editPrimaryText, { fontSize: editLabelSize }]}>Save</Text>
                </Pressable>
              </View>

              <Pressable
                style={[
                  styles.editDelete,
                  { height: editButtonHeight, borderRadius: Math.round(editButtonHeight * 0.28) },
                ]}
                onPress={() => {
                  removeDevice(device.id);
                  setShowEdit(false);
                  navigation.goBack();
                }}
              >
                <Text style={[styles.editDeleteText, { fontSize: editLabelSize }]}>Delete device</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal transparent visible={showSchedule} animationType="fade" onRequestClose={() => setShowSchedule(false)}>
        <View style={styles.editOverlay}>
          <Pressable style={styles.editBackdrop} onPress={() => setShowSchedule(false)} />
          <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })}>
            <View
              style={[
                styles.scheduleCard,
                {
                  padding: editPad,
                  borderRadius: editRadius,
                  maxWidth: isTablet ? 520 : undefined,
                  width: isTablet ? Math.min(contentWidth - gutter * 2, 520) : undefined,
                  alignSelf: isTablet ? 'center' : 'stretch',
                },
              ]}
            >
              <Text style={[styles.editTitle, { fontSize: editTitleSize }]}>New schedule</Text>
              <Text style={[styles.editSub, { fontSize: editSubSize }]}>Pick a time and days to water.</Text>

              <Text style={[styles.editLabel, { fontSize: editLabelSize }]}>Time</Text>
              <View style={styles.timeRow}>
                <TextInput
                  value={schedHour}
                  onChangeText={setSchedHour}
                  placeholder="06"
                  keyboardType="number-pad"
                  style={[styles.timeInput, { height: editInputHeight, borderRadius: Math.round(editInputHeight * 0.28) }]}
                  maxLength={2}
                />
                <Text style={styles.timeColon}>:</Text>
                <TextInput
                  value={schedMinute}
                  onChangeText={setSchedMinute}
                  placeholder="00"
                  keyboardType="number-pad"
                  style={[styles.timeInput, { height: editInputHeight, borderRadius: Math.round(editInputHeight * 0.28) }]}
                  maxLength={2}
                />
              </View>

              <Text style={[styles.editLabel, { fontSize: editLabelSize }]}>Days</Text>
              <View style={styles.dayRow}>
                {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map((day) => {
                  const active = schedDays.includes(day);
                  return (
                    <Pressable
                      key={day}
                      style={[
                        styles.dayChip,
                        { height: editInputHeight, borderRadius: Math.round(editInputHeight / 2) },
                        active && styles.dayChipActive,
                      ]}
                      onPress={() => {
                        setSchedDays((prev) =>
                          prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.dayChipText,
                          { fontSize: editLabelSize },
                          active && styles.dayChipTextActive,
                        ]}
                      >
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.editActions}>
                <Pressable
                  style={[
                    styles.editGhost,
                    { height: editButtonHeight, borderRadius: Math.round(editButtonHeight * 0.28) },
                  ]}
                  onPress={() => setShowSchedule(false)}
                >
                  <Text style={[styles.editGhostText, { fontSize: editLabelSize }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.editPrimary,
                    { height: editButtonHeight, borderRadius: Math.round(editButtonHeight * 0.28) },
                    schedDays.length === 0 && styles.editPrimaryDisabled,
                  ]}
                  onPress={() => {
                    if (schedDays.length === 0) return;
                    const h = Math.max(0, Math.min(23, parseInt(schedHour || '0', 10)));
                    const m = Math.max(0, Math.min(59, parseInt(schedMinute || '0', 10)));
                    const next = [
                      ...(device.schedule ?? []),
                      {
                        id: `sch${Date.now()}`,
                        hour: h,
                        minute: m,
                        days: schedDays,
                        enabled: true,
                      },
                    ];
                    sendPatch({ schedule: next });
                    setShowSchedule(false);
                  }}
                  disabled={schedDays.length === 0}
                >
                  <Text style={[styles.editPrimaryText, { fontSize: editLabelSize }]}>Save</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const stylesVars = {
  ink: 'rgba(12,12,18,0.88)',
  subtext: 'rgba(12,12,18,0.55)',
  muted: 'rgba(12,12,18,0.38)',
};

const styles = StyleSheet.create({
  outer: { flex: 1, padding: 18 },
  outerTablet: { paddingTop: 24 },
  safe: { flex: 1 },
  panel: {
    flex: 1,
    borderRadius: 42,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  panelTablet: { maxWidth: 860, width: '100%', alignSelf: 'center' },

  headerPill: {
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.60)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  headerTitle: { flex: 1, textAlign: 'center', color: stylesVars.ink, fontWeight: '900', zIndex: 1 },

  moodLabel: { textAlign: 'center', color: stylesVars.subtext, fontWeight: '800', marginTop: 12 },
  moodValue: { textAlign: 'center', color: stylesVars.ink, fontSize: 22, fontWeight: '900', marginTop: 6 },

  genericIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  powerWrap: { alignSelf: 'center', marginTop: 26, marginBottom: 18 },
  powerRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerRingOn: {
    backgroundColor: 'rgba(122,92,255,0.14)',
    borderColor: 'rgba(122,92,255,0.25)',
    shadowColor: 'rgba(122,92,255,0.55)',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  powerInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.60)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  genericHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  capabilitiesWrap: { marginTop: 16 },
  heroTitle: { color: stylesVars.ink, fontWeight: '900', fontSize: 18 },
  heroSub: { color: stylesVars.subtext, fontWeight: '700', marginTop: 4 },
  garageHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  garageIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  controlCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  controlCardRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  cardLabel: { color: stylesVars.subtext, fontWeight: '800', marginBottom: 8 },
  cardHint: { color: stylesVars.muted, fontWeight: '700', marginTop: -2, marginBottom: 6 },
  controlPill: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(180,107,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPillText: { color: stylesVars.ink, fontWeight: '900' },
  controlPillActive: {
    backgroundColor: 'rgba(122,92,255,0.28)',
    borderColor: 'rgba(122,92,255,0.4)',
  },
  controlPillTextActive: { color: stylesVars.ink },
  chipRow: { flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRowItem: { flexDirection: 'row', gap: 6 },
  chipActive: { backgroundColor: 'rgba(180,107,255,0.24)', borderColor: 'rgba(122,92,255,0.3)' },
  chipText: { color: stylesVars.subtext, fontWeight: '900', fontSize: 12 },
  chipTextActive: { color: stylesVars.ink },
  infoOrb: {
    alignSelf: 'center',
    width: 190,
    height: 190,
    borderRadius: 95,
    overflow: 'hidden',
    shadowColor: 'rgba(180,107,255,0.35)',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    marginBottom: 12,
  },
  infoOrbCompact: {
    width: 170,
    height: 170,
    borderRadius: 85,
    marginBottom: 0,
  },
  infoOrbInner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  infoValue: { marginTop: 8, color: '#fff', fontWeight: '900', fontSize: 24 },
  infoSub: { marginTop: 4, color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 12 },
  metricRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  metricCard: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: { color: stylesVars.ink, fontWeight: '900', fontSize: 16 },
  metricLabel: { marginTop: 4, color: stylesVars.subtext, fontWeight: '800', fontSize: 11 },
  budgetHint: {
    marginTop: 10,
    textAlign: 'center',
    color: stylesVars.subtext,
    fontWeight: '800',
    fontSize: 12,
  },
  alertRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  alertText: { color: '#D8465B', fontWeight: '800', fontSize: 12 },
  cameraFeed: {
    height: 200,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: 'rgba(122,92,255,0.35)',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  cameraFeedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cameraLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  cameraLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  cameraLiveText: { color: stylesVars.ink, fontWeight: '900', fontSize: 12 },
  cameraStatusText: { color: stylesVars.subtext, fontWeight: '800', fontSize: 12 },
  gateStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  gateStatusText: { color: stylesVars.ink, fontWeight: '900', fontSize: 12 },
  cameraFeedBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  cameraPreviewText: { color: stylesVars.subtext, fontWeight: '800' },
  cameraDetectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cameraDetectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  cameraDetectPillAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,214,214,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(200,60,60,0.2)',
  },
  cameraDetectText: { color: stylesVars.ink, fontWeight: '800', fontSize: 12 },
  cameraMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.14)',
  },
  cameraMemberName: { color: stylesVars.ink, fontWeight: '900', fontSize: 13 },
  cameraMemberRole: { color: stylesVars.subtext, fontWeight: '700', fontSize: 11 },
  cameraPresencePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  cameraPresenceHome: { backgroundColor: 'rgba(180,107,255,0.22)' },
  cameraPresenceAway: { backgroundColor: 'rgba(255,255,255,0.6)' },
  cameraPresenceText: { color: stylesVars.ink, fontWeight: '800', fontSize: 11 },
  cameraEventRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  cameraEventDot: { width: 8, height: 8, borderRadius: 4 },
  cameraEventDotKnown: { backgroundColor: theme.colors.accent },
  cameraEventDotUnknown: { backgroundColor: '#C4384C' },
  cameraEventText: { color: stylesVars.subtext, fontWeight: '700', fontSize: 12 },
  mediaRow: { flexDirection: 'row', gap: 12, marginTop: 16, justifyContent: 'center' },
  mediaBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaBtnActive: { backgroundColor: 'rgba(180,107,255,0.22)', borderColor: 'rgba(122,92,255,0.3)' },
  actionRow: { flexDirection: 'row', gap: 14, marginTop: 22, paddingHorizontal: 6, justifyContent: 'center' },
  modeTile: {
    height: 92,
    width: 92,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  modeTileActive: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(122,92,255,0.25)',
    shadowColor: 'rgba(122,92,255,0.40)',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  modeIconBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconBubbleActive: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(122,92,255,0.65)',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  modeText: { color: 'rgba(12,12,18,0.58)', fontWeight: '900', fontSize: 12 },
  modeTextActive: { color: 'rgba(12,12,18,0.86)' },
  doorWrap: { alignItems: 'center', marginTop: 10 },
  doorFrame: {
    width: 170,
    height: 200,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  doorPanel: {
    width: 120,
    height: 170,
    borderRadius: 16,
    backgroundColor: 'rgba(180,107,255,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(122,92,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorHandle: {
    width: 26,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
    position: 'absolute',
    right: 14,
  },
  doorTitle: { marginTop: 12, color: stylesVars.ink, fontWeight: '900', fontSize: 16 },
  doorStatus: { marginTop: 4, color: stylesVars.subtext, fontWeight: '800' },

  // Light UI
  lightLayout: { gap: 12 },
  lightLayoutRow: { flexDirection: 'row', alignItems: 'flex-start' },
  lightDialColumn: { flex: 1 },
  lightDialCard: { alignItems: 'center' },
  lightControlsColumn: { flex: 1, minWidth: 0 },
  lightControlCard: { alignItems: 'stretch' },
  lightCenterOrb: {
    alignSelf: 'center',
    overflow: 'hidden',
    shadowColor: 'rgba(180,107,255,0.55)',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  lightCenterOrbLight: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  lightCenterInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightCenterInnerLight: {
    borderWidth: 1,
  },
  lightCenterValue: { color: '#fff', fontWeight: '900' },
  lightCenterRoom: { color: 'rgba(255,255,255,0.85)', fontWeight: '800' },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, justifyContent: 'center', alignItems: 'center' },
  swatch: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  swatchActive: { borderColor: 'rgba(180,107,255,0.8)', borderWidth: 2 },

  sceneRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, justifyContent: 'center', alignItems: 'center' },
  sceneText: { color: stylesVars.ink, fontWeight: '900' },
  sceneCardItem: {
    flex: 1,
    minWidth: 86,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sceneIconWrap: {
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // TV UI
  tvOrb: {
    alignSelf: 'center',
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: 'hidden',
    shadowColor: 'rgba(180,107,255,0.45)',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    marginBottom: 6,
  },
  tvOrbInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tvName: { marginTop: 8, color: '#fff', fontWeight: '900', fontSize: 18 },
  tvRoom: { marginTop: 2, color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 12 },
  orbActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  remoteGrid: { flexDirection: 'row', flexWrap: 'nowrap', gap: 6, marginTop: 6, alignItems: 'center' },
  remoteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  remoteBtnWide: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
  },
  remoteBtnCompact: {
    flex: 1,
    height: 38,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  remoteText: { color: stylesVars.ink, fontWeight: '900', fontSize: 9 },
  remotePadWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  remoteCard: { marginTop: 2, paddingBottom: 10 },
  remotePadArea: {
    width: 260,
    height: 176,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteSideLeft: { position: 'absolute', top: 0, left: 0 },
  remoteSideRight: { position: 'absolute', top: 0, right: 0 },
  navPad: {
    alignSelf: 'center',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navUp: { top: 8 },
  navDown: { bottom: 8 },
  navLeft: { left: 8 },
  navRight: { right: 8 },
  navCenter: {
    width: 56,
    height: 56,
    borderRadius: 19,
    backgroundColor: 'rgba(180,107,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(180,107,255,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenterText: { color: stylesVars.ink, fontWeight: '900' },

  // Coffee UI
  coffeeOrb: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(180,107,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  coffeeOrbInner: { alignItems: 'center', gap: 6 },
  coffeeName: { color: '#fff', fontWeight: '900', marginTop: 6 },
  coffeeRoom: { color: 'rgba(255,255,255,0.85)', fontWeight: '800' },
  coffeeCup: {
    marginTop: 8,
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  coffeeFill: {
    width: '100%',
    backgroundColor: '#6B3CFF',
  },

  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 18,
  },
  editBackdrop: { ...StyleSheet.absoluteFillObject },
  editCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  editTitle: { color: stylesVars.ink, fontWeight: '900', fontSize: 18 },
  editSub: { color: stylesVars.subtext, fontWeight: '700', marginTop: 6 },
  editLabel: { color: stylesVars.subtext, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  editInput: {
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(12,12,18,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    paddingHorizontal: 12,
    color: stylesVars.ink,
    fontWeight: '700',
  },
  roomRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roomPill: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(12,12,18,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomPillActive: { backgroundColor: 'rgba(107,60,255,0.16)', borderColor: 'rgba(107,60,255,0.3)' },
  roomPillText: { color: stylesVars.subtext, fontWeight: '800', fontSize: 12 },
  roomPillTextActive: { color: stylesVars.ink },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  editGhost: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editGhostText: { color: stylesVars.subtext, fontWeight: '800' },
  editPrimary: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#6B3CFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPrimaryDisabled: { opacity: 0.6 },
  editPrimaryText: { color: '#FFFFFF', fontWeight: '900' },
  scheduleCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  scheduleTime: { color: stylesVars.ink, fontWeight: '900' },
  scheduleDays: { color: stylesVars.subtext, fontWeight: '700', marginTop: 4, fontSize: 12 },
  scheduleToggle: {
    width: 54,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(12,12,18,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleToggleActive: { backgroundColor: 'rgba(122,92,255,0.28)', borderColor: 'rgba(122,92,255,0.35)' },
  scheduleToggleText: { color: stylesVars.subtext, fontWeight: '800', fontSize: 12 },
  scheduleToggleTextActive: { color: stylesVars.ink },
  scheduleEmpty: { color: stylesVars.subtext, fontWeight: '700', marginTop: 6 },
  addSchedule: {
    marginTop: 12,
    height: 40,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addScheduleText: { color: stylesVars.ink, fontWeight: '900' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeInput: {
    width: 60,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(12,12,18,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    textAlign: 'center',
    color: stylesVars.ink,
    fontWeight: '700',
  },
  timeColon: { fontSize: 18, fontWeight: '900', color: stylesVars.ink },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  dayChip: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(12,12,18,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipActive: { backgroundColor: 'rgba(107,60,255,0.16)', borderColor: 'rgba(107,60,255,0.3)' },
  dayChipText: { color: stylesVars.subtext, fontWeight: '800', fontSize: 12 },
  dayChipTextActive: { color: stylesVars.ink },
  editDelete: {
    marginTop: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 99, 132, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editDeleteText: { color: '#8b1e3a', fontWeight: '900' },
});
