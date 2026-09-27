import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useDecorativeMotion } from "../../components/useDecorativeMotion";
import { LabControls } from "./LabControls";
import NativeLabSurface from "./NativeLabSurface";
import WebLabSurface from "./WebLabSurface";
import { INITIAL_LAB_SETTINGS, type LabDevice, type LabEvent, type LabMetrics, type LabRenderer, type LabSettings, type WeatherChoice } from "./protocol";
import { useLabWeather } from "./useLabWeather";
import { labColors, labStyles as styles } from "./styles";
import { getDevice } from '../../../packages/home-scene/src/data';
import { readLabLightState } from '../../../packages/home-scene/src/lightAppearance';
import { useSimulationControls } from '../three-d-home/useSimulationControls';
import { DeviceControlsSheet } from '../three-d-home/DeviceControlsSheet';

type BoundaryProps = { children: React.ReactNode; onError: () => void };

/** Isolate optional native SDK initialization failures from the working application. */
class SurfaceBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  /** Hide the failed subtree before the surrounding recovery panel is rendered. */
  static getDerivedStateFromError() { return { failed: true }; }
  /** Convert renderer exceptions into the screen's explicit retry state. */
  componentDidCatch() { this.props.onError(); }
  /** Never leave a failed native rendering subtree mounted. */
  render() { return this.state.failed ? null : this.props.children; }
}

type RendererLabProps = { active: boolean };
type LoadState = { phase: "loading" | "ready" | "error"; milliseconds: number | null; message?: string };
const BEDROOM_LIGHTS = ['master-light', 'master-bedside-left', 'master-bedside-right'] as const;
const LAB_DEVICE_IDS = { lights: 'master-light', blinds: 'master-blinds', gate: 'entry-gate' } as const;

/** Compare the same scene and device state while mounting only one rendering engine. */
export default function RendererLab({ active }: RendererLabProps) {
  const { width, height } = useWindowDimensions();
  const landscape = width >= 760 && width > height;
  const compact = height < 700;
  const [renderer, setRenderer] = useState<LabRenderer>("three");
  const [settings, setSettings] = useState<LabSettings>({ ...INITIAL_LAB_SETTINGS });
  const [weatherChoice, setWeatherChoice] = useState<WeatherChoice>("clear");
  const [selectedDevice, setSelectedDevice] = useState<LabDevice>("blinds");
  const [attempt, setAttempt] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [load, setLoad] = useState<LoadState>({ phase: "loading", milliseconds: null });
  const [metrics, setMetrics] = useState<LabMetrics | null>(null);
  const controls = useSimulationControls();
  const [controlsOpen, setControlsOpen] = useState(false);
  const [controlDeviceId, setControlDeviceId] = useState<string | null>(null);
  const surfaceActive = active && foreground;
  const motionAllowed = useDecorativeMotion(active);
  const weather = useLabWeather(weatherChoice, surfaceActive && settings.view === "property");
  const resolvedSettings = useMemo(() => {
    const states = controls.state.deviceStates;
    return { ...settings, ...weather.settings,
      lights: BEDROOM_LIGHTS.some((id) => states[id].on),
      blinds: states['master-blinds'].level, gate: states['entry-gate'].level,
      lightStates: {
        ceiling: readLabLightState(getDevice(BEDROOM_LIGHTS[0])!, states[BEDROOM_LIGHTS[0]]),
        left: readLabLightState(getDevice(BEDROOM_LIGHTS[1])!, states[BEDROOM_LIGHTS[1]]),
        right: readLabLightState(getDevice(BEDROOM_LIGHTS[2])!, states[BEDROOM_LIGHTS[2]]),
      },
    };
  }, [settings, weather.settings, controls.state]);
  const surfaceSettings = useMemo(() => ({ ...resolvedSettings, motion: settings.motion && motionAllowed }), [resolvedSettings, settings.motion, motionAllowed]);
  const surfaceKey = `${renderer}-${settings.view}-${attempt}`;
  const sessionToken = useMemo(() => ({ startedAt: Date.now(), settled: false }), [surfaceKey, surfaceActive]);
  const currentSession = useRef<object | null>(sessionToken);
  // Invalidate old callbacks during render, before their unmount cleanup can run.
  currentSession.current = sessionToken;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    currentSession.current = sessionToken;
    // A child can fail during its first commit, before this passive effect runs.
    // Preserve that terminal event rather than covering it with a loading state.
    if (!sessionToken.settled) setLoad({ phase: "loading", milliseconds: null });
    setMetrics(null);
    if (!surfaceActive) return;
    const timeout = setTimeout(() => {
      if (!sessionToken.settled && currentSession.current === sessionToken) {
        sessionToken.settled = true;
        setLoad({ phase: "error", milliseconds: null, message: "This renderer took too long to load. You can retry or return to Three.js." });
      }
    }, 90_000);
    return () => {
      clearTimeout(timeout);
      if (currentSession.current === sessionToken) currentSession.current = null;
    };
  }, [sessionToken, surfaceActive]);

  /** Renderer events contain simulation and diagnostics only; no hardware commands. */
  const onEvent = useCallback((event: LabEvent) => {
    if (!surfaceActive || currentSession.current !== sessionToken) return;
    if (event.type === "ready") {
      if (!sessionToken.settled) {
        sessionToken.settled = true;
        setLoad({ phase: "ready", milliseconds: Date.now() - sessionToken.startedAt });
      }
    } else if (event.type === "error") {
      sessionToken.settled = true;
      setLoad({ phase: "error", milliseconds: null, message: event.message });
    } else if (event.type === "select") {
      setSelectedDevice(event.device);
    } else {
      setMetrics(event);
    }
  }, [sessionToken, surfaceActive]);

  /** Retain all device settings when selecting another rendering engine. */
  const changeSettings = useCallback((patch: Partial<LabSettings>) => {
    if (patch.lights !== undefined) controls.client.setPower(BEDROOM_LIGHTS, patch.lights);
    if (patch.blinds !== undefined) controls.client.setLevel('master-blinds', patch.blinds);
    if (patch.gate !== undefined) controls.client.setLevel('entry-gate', patch.gate);
    setSettings((current) => ({ ...current, ...patch }));
  }, [controls.client]);

  /** Open one full device inspector while keeping its state independent from the rendering engine. */
  const openControls = (device: LabDevice | null) => {
    setControlDeviceId(device ? LAB_DEVICE_IDS[device] : null);
    if (device) setSelectedDevice(device);
    setControlsOpen(true);
  };

  /** Route thrown initialization errors into the same recoverable load state. */
  const onSurfaceError = useCallback(() => {
    onEvent({ type: "error", message: "The renderer could not start on this build. Retry or use the Three.js comparison." });
  }, [onEvent]);

  const error = load.phase === "error";
  const loading = load.phase === "loading";
  return <View style={styles.root}>
    <View style={styles.toolbar}>
      <View style={styles.brand}><Text style={styles.eyebrow}>RENDER STUDY</Text><Text style={styles.title}>Same home. Two engines.</Text></View>
      <View style={styles.segmented}>
        {(["three", "filament"] as const).map((option) => {
          const selected = renderer === option;
          const disabled = Platform.OS === "web" && option === "filament";
          return <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Use ${option === "three" ? "Three.js" : "Filament"} renderer`}
            accessibilityState={{ selected, disabled }} aria-selected={selected} aria-disabled={disabled} disabled={disabled} onPress={() => setRenderer(option)}
            style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, disabled && styles.segmentDisabled, pressed && styles.pressFeedback]}>
            <Text style={[styles.segmentText, selected && styles.segmentSelectedText]}>{option === "three" ? "Three.js" : "Filament"}</Text>
          </Pressable>;
        })}
      </View>
    </View>
    <View style={[styles.body, landscape && styles.bodyLandscape]}>
      <View style={styles.sceneColumn}>
        <View style={styles.scene}>
          {surfaceActive && !error && <SurfaceBoundary key={surfaceKey} onError={onSurfaceError}>
            {renderer === "three" ? <WebLabSurface settings={surfaceSettings} onEvent={onEvent} /> : <NativeLabSurface settings={surfaceSettings} onEvent={onEvent} />}
          </SurfaceBoundary>}
          {(!surfaceActive || loading || error) && <View style={styles.sceneOverlay}>
            {!surfaceActive ? <Text style={styles.overlayTitle}>Scene paused</Text> : error ? <>
              <Text style={styles.overlayTitle}>Let’s reload the scene</Text>
              <Text style={styles.overlayBody}>{load.message}</Text>
              <View style={styles.overlayActions}>
                <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={[styles.button, styles.buttonPrimary]}>
                  <Text style={[styles.buttonText, styles.buttonPrimaryText]}>Retry</Text></Pressable>
                {renderer === "filament" && <Pressable accessibilityRole="button" onPress={() => setRenderer("three")} style={styles.button}>
                  <Text style={styles.buttonText}>Use Three.js</Text></Pressable>}
              </View>
            </> : <><ActivityIndicator color={labColors.sage} /><Text style={styles.overlayTitle}>Preparing your home</Text>
              <Text style={styles.overlayBody}>{renderer === "filament" ? "Opening the native renderer" : "Opening the Three.js renderer"}</Text></>}
          </View>}
        </View>
        {!compact && <View style={styles.metrics} accessibilityLabel="Renderer diagnostics">
          <View style={styles.metric}><Text style={styles.metricValue}>{load.milliseconds === null ? "—" : `${(load.milliseconds / 1000).toFixed(2)}s`}</Text><Text style={styles.metricLabel}>ASSETS READY</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{metrics ? `${metrics.p50.toFixed(1)}ms` : "—"}</Text><Text style={styles.metricLabel}>INTERVAL P50</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{metrics ? `${metrics.p95.toFixed(1)}ms` : "—"}</Text><Text style={styles.metricLabel}>INTERVAL P95</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{metrics?.frames ?? "—"}</Text><Text style={styles.metricLabel}>SAMPLES</Text></View>
        </View>}
        {!compact && <Text style={styles.footnote}>{Platform.OS === "web" ? "Filament requires the native preview. " : ""}Callback intervals measure cadence, not GPU completion or FPS.</Text>}
      </View>
      <LabControls settings={resolvedSettings} selectedDevice={selectedDevice} landscape={landscape}
        motionAllowed={motionAllowed} onChange={changeSettings} onSelect={setSelectedDevice}
        onFullControls={openControls} controlsReady={controls.ready} saveError={controls.status === 'error'}
        weatherChoice={weatherChoice} weather={weather} onWeatherChange={setWeatherChoice} />
    </View>
    {controls.status === 'disconnected' && <Pressable accessibilityRole="button" onPress={controls.reconnect} style={styles.button}>
      <Text style={styles.buttonText}>Reconnect simulation controls</Text>
    </Pressable>}
    {controlsOpen && <DeviceControlsSheet deviceId={controlDeviceId} client={controls.client} snapshot={controls}
      motionAllowed={motionAllowed} onClose={() => setControlsOpen(false)} onSelect={setControlDeviceId} />}
  </View>;
}
