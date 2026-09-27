import React from "react";
import { Pressable, Text, View } from "react-native";
import type { LabDevice, LabSettings, LabView, WeatherChoice } from "./protocol";
import LabSlider from "./LabSlider";
import { LabWeatherPicker } from "./LabWeatherPicker";
import type { LabWeather } from "./useLabWeather";
import { labStyles as styles } from "./styles";

type ControlsProps = {
  settings: LabSettings;
  selectedDevice: LabDevice;
  landscape: boolean;
  motionAllowed: boolean;
  onChange: (settings: Partial<LabSettings>) => void;
  onSelect: (device: LabDevice) => void;
  onFullControls: (device: LabDevice | null) => void;
  controlsReady: boolean;
  saveError: boolean;
  weatherChoice: WeatherChoice;
  weather: LabWeather;
  onWeatherChange: (choice: WeatherChoice) => void;
};

type SmallButtonProps = { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string };

/** A generous touch target used for scene and environment choices. */
function SmallButton({ label, selected, onPress, accessibilityLabel }: SmallButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ selected }} aria-selected={selected} onPress={onPress}
    style={({ pressed }) => [styles.smallButton, selected && styles.smallButtonActive, pressed && styles.pressFeedback]}>
    <Text style={[styles.segmentText, selected && styles.segmentSelectedText]}>{label}</Text>
  </Pressable>;
}

type DeviceCardProps = {
  label: string; state: string; enabled: boolean; selected: boolean;
  onToggle: () => void; onDetails: () => void; disabled: boolean;
};

/** Keep quick device actions separate from the full control entry point. */
function DeviceCard({ label, state, enabled, selected, onToggle, onDetails, disabled }: DeviceCardProps) {
  return <View style={[styles.device, selected && styles.deviceSelected]}>
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: enabled, disabled }} aria-checked={enabled} disabled={disabled}
      onPress={onToggle} style={({ pressed }) => [styles.deviceToggle, pressed && styles.pressFeedback]}>
      <Text style={styles.deviceName}>{label}</Text><Text style={styles.deviceState}>{state}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} full controls`}
      onPress={onDetails}
      style={({ pressed }) => [styles.deviceDetails, pressed && styles.pressFeedback]}>
      <Text style={styles.deviceDetailsText}>Full controls ↗</Text>
    </Pressable>
  </View>;
}

/** Shared controls ensure both renderers receive identical simulation settings. */
export function LabControls({ settings, selectedDevice, landscape, motionAllowed, onChange, onSelect, onFullControls, controlsReady, saveError, weatherChoice, weather, onWeatherChange }: ControlsProps) {
  const property = settings.view === "property";
  const mechanicalDevice = property ? "gate" : "blinds";
  const mechanicalValue = property ? settings.gate : settings.blinds;
  const mechanicalLabel = property ? "Gate" : "Blinds";
  const mechanicalState = mechanicalValue === 0 ? "Closed" : mechanicalValue === 100 ? "Open" : `${mechanicalValue}%`;
  const detailDevice = !property && selectedDevice === "lights" ? "lights" : mechanicalDevice;

  /** Switching the camera preserves every device's simulation state. */
  const setView = (view: LabView) => {
    onChange({ view, resetKey: settings.resetKey + 1 });
    onSelect(view === "property" ? "gate" : "blinds");
  };

  /** Map one bounded percentage control to the selected scene's animated device. */
  const setOpening = (value: number) => {
    const bounded = Math.round(Math.max(0, Math.min(100, value)));
    onChange(property ? { gate: bounded } : { blinds: bounded });
  };

  return <View style={[styles.panel, landscape && styles.panelLandscape]}>
    <View style={styles.panelSection}>
      <View style={styles.row}>
        <SmallButton label="Bedroom" selected={!property} onPress={() => setView("bedroom")} />
        <SmallButton label="Property" selected={property} onPress={() => setView("property")} />
        {!landscape && <SmallButton label="Reset" selected={false} accessibilityLabel="Reset camera view"
          onPress={() => onChange({ resetKey: settings.resetKey + 1 })} />}
      </View>
      <View style={styles.row}>
        <SmallButton label={settings.night ? "Night" : "Day"} selected={settings.night}
          accessibilityLabel={`Switch to ${settings.night ? "day" : "night"}`} onPress={() => onChange({ night: !settings.night })} />
        {property && <LabWeatherPicker choice={weatherChoice} weather={weather}
          motionAllowed={motionAllowed && settings.motion} onChange={onWeatherChange} />}
        <SmallButton label={settings.motion && motionAllowed ? "Motion on" : "Motion off"} selected={settings.motion && motionAllowed}
          accessibilityLabel={`Turn scene motion ${settings.motion ? "off" : "on"}`}
          onPress={() => onChange({ motion: !settings.motion })} />
        <SmallButton label="Devices ↗" accessibilityLabel="Browse all devices" selected={false} onPress={() => onFullControls(null)} />
      </View>
    </View>
    <View style={styles.panelSection}>
      <View style={styles.deviceRow}>
        {!property && <DeviceCard label="Lights" state={settings.lights ? "On" : "Off"} enabled={settings.lights}
          selected={selectedDevice === "lights"} onToggle={() => onChange({ lights: !settings.lights })}
          disabled={!controlsReady} onDetails={() => onFullControls("lights")} />}
        <DeviceCard label={mechanicalLabel} state={mechanicalState} enabled={mechanicalValue > 0}
          selected={selectedDevice === mechanicalDevice} onToggle={() => setOpening(mechanicalValue > 0 ? 0 : 100)}
          disabled={!controlsReady} onDetails={() => onFullControls(mechanicalDevice)} />
      </View>
      <View style={styles.detail}>
        {saveError && <Text accessibilityRole="alert" style={styles.footnote}>Could not save locally. Changes may not survive a restart.</Text>}
        {detailDevice === "lights" ? <>
          <Text style={styles.detailHeading}>Bedroom lighting</Text>
          <Text style={styles.detailDescription}>Quick switch controls all three lights. Full controls adjust each fixture.</Text>
        </> : <>
          <View style={styles.row}><Text style={[styles.detailHeading, styles.grow]}>{mechanicalLabel} opening</Text>
            <Text style={styles.detailValue}>{mechanicalValue}%</Text></View>
          <LabSlider label={`${mechanicalLabel} opening`} value={mechanicalValue} onValueChange={setOpening} disabled={!controlsReady} />
        </>}
      </View>
    </View>
    {landscape && <View style={styles.panelSection}>
      <Text style={styles.detailDescription}>Drag to orbit · Pinch to zoom{"\n"}Tap a device to open its controls.</Text>
      <SmallButton label="Reset camera" selected={false} onPress={() => onChange({ resetKey: settings.resetKey + 1 })} />
    </View>}
    {!motionAllowed && <Text style={styles.footnote}>System motion preferences keep effects still.</Text>}
  </View>;
}
