import React, { useId } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { gateActionId, readGateControllerState, type GateControllerState, type GateControllerKey } from '../../../packages/home-scene/src/gateController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { gateControllerMaterials, gateControllerStyles as styles } from './GateControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; text?: string; icon?: IconName; hint?: string; disabled?: boolean; active?: boolean;
  onPress: () => void; style?: StyleProp<ViewStyle>;
}
const PANEL_BARS = [0.07, 0.14, 0.21, 0.28, 0.35, 0.42, 0.49, 0.56, 0.63, 0.70, 0.77, 0.84, 0.91] as const;

/** Raised keys retain meaningful labels and full touch targets in every layout and permission state. */
function GateKey({ label, text, icon, hint, disabled = false, active = false, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={19} color={theme.colors.text} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Match the property's single sliding panel using confirmed position only, without extrapolating toward a target. */
function GateArtwork({ position, compact }: { position: number | null; compact: boolean }) {
  const id = useId().replace(/:/g, '');
  const gradient = `${id}-gate-metal`;
  const aperture = `${id}-gate-aperture`;
  const panelX = 43 - (position ?? 0) / 100 * 194;
  return <View testID="gate-position-preview" style={[styles.preview, compact && styles.previewCompact]}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width="100%" height="100%" viewBox="0 0 280 150" aria-hidden>
      <Defs>
        <SvgGradient id={gradient} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor="#9D87AF" /><Stop offset="0.4" stopColor="#5B456B" /><Stop offset="1" stopColor="#291C38" />
        </SvgGradient>
        <ClipPath id={aperture}><Rect x={43} y={40} width={194} height={94} /></ClipPath>
      </Defs>
      <Path d="M18 136 L76 94 L204 94 L262 136 L221 148 L59 148 Z" fill="#16101E" stroke="#4A375B" />
      <Path d="M40 139 L240 139 M61 124 L219 124 M85 109 L195 109 M112 99 L87 145 M168 99 L193 145" fill="none" stroke="#513E62" opacity={0.5} />
      <Path d="M87 75 L87 55 L140 27 L193 55 L193 75 M104 75 L104 59 L176 59 L176 75" fill="none" stroke="#604A71" opacity={0.7} />
      <Rect x={0} y={53} width={22} height={81} fill="#392A45" stroke="#6C517B" />
      <Rect x={258} y={53} width={22} height={81} fill="#392A45" stroke="#6C517B" />
      <Rect x={22} y={36} width={21} height={101} rx={3} fill={`url(#${gradient})`} stroke="#9F82B7" />
      <Rect x={237} y={36} width={21} height={101} rx={3} fill={`url(#${gradient})`} stroke="#9F82B7" />
      <Rect x={18} y={31} width={29} height={8} rx={3} fill="#B197C3" stroke="#D7C1E6" />
      <Rect x={233} y={31} width={29} height={8} rx={3} fill="#B197C3" stroke="#D7C1E6" />
      <Circle cx={33} cy={49} r={3} fill="#DBC3F3" /><Circle cx={247} cy={49} r={3} fill="#DBC3F3" />
      <Line x1={43} y1={133} x2={237} y2={133} stroke="#BC9CD2" strokeWidth={2} />
      {position === null ? <Rect x={43} y={47} width={194} height={83} fill="#21192C" opacity={0.85} />
        : <G clipPath={`url(#${aperture})`}>
          <Rect testID="gate-preview-panel" x={panelX} y={47} width={194} height={83} rx={2}
            fill={`url(#${gradient})`} stroke="#C3A7D8" strokeWidth={1.5} />
          {PANEL_BARS.map((fraction) => <Line key={fraction} x1={panelX + 194 * fraction} y1={51}
            x2={panelX + 194 * fraction} y2={126} stroke="#271A34" strokeWidth={3} />)}
          <Line x1={panelX} y1={68} x2={panelX + 194} y2={68} stroke="#AC8FBF" strokeWidth={3} />
          <Line x1={panelX} y1={112} x2={panelX + 194} y2={112} stroke="#AC8FBF" strokeWidth={3} />
        </G>}
    </Svg>
  </View>;
}

/** Clearly identify simulated sensor inputs without presenting them as a physical safety certification. */
function GateIndicator({ label, value, warning, largeText }: { label: string; value: string; warning: boolean; largeText: boolean }) {
  return <View accessible accessibilityLabel={`${label}: ${value} · simulated input`}
    style={[styles.indicator, warning && styles.indicatorWarning, largeText && styles.indicatorLarge]}>
    <Text style={styles.indicatorLabel}>{label}</Text><Text style={[styles.indicatorValue, warning && styles.statusWarning]}>{value}</Text>
  </View>;
}

/** Display only the actual foreground simulation countdown; no independent timer can advance this label. */
function autoCloseSummary(gate: GateControllerState): string {
  if (gate.countdownSec !== null) return `Auto-close in ${Math.ceil(gate.countdownSec)}s · Simulation`;
  if (!gate.autoCloseEnabled) return 'Auto-close off';
  if (gate.paused) return 'Auto-close paused · Manual action required';
  return `Auto-close enabled · ${gate.autoCloseDelaySec}s clear-zone delay`;
}

/** Existing gate actions and safety permissions remain authoritative for every native command. */
export function GateController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
  const gate = readGateControllerState(device, state);
  const largeText = fontScale > 1.15;
  if (!gate) return null;
  const held = gate.holdOpen || gate.emergencyHold;
  const position = gate.position === null ? '—' : `${Math.round(gate.position)}%`;

  /** Explicit catalog actions avoid stale percentage writes and retain the live client authorization check. */
  function run(action: GateControllerKey): void { if (!disabled) client.runAction(device.id, gateActionId(action)); }

  return <ScrollView testID="gate-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="gate-tactile-controller" colors={gateControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={gateControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={[styles.row, styles.header]}>
          <View style={styles.emblem} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons accessible={false} name="grid-outline" size={21} color={theme.colors.accentText} />
          </View>
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>ENTRY GATE</Text></View>
          <GateKey label="More gate controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <GateArtwork position={gate.position} compact={compact} />
        <View accessible accessibilityLabel={gate.position === null ? 'Gate position unavailable' : `Gate ${Math.round(gate.position)} percent open`}
          style={styles.reading}>
          <Text style={[styles.value, compact && styles.valueCompact]}>{position}</Text><Text style={styles.caption}>OPEN POSITION</Text>
        </View>
        <Text accessibilityLiveRegion="polite" style={[styles.status, (gate.safety !== 'clear' || held) && styles.statusWarning]}>{gate.status}</Text>
        <View style={[styles.controls, largeText && styles.controlsLarge]}>
          <GateKey label="Open gate fully" text="Open" icon="expand-outline" disabled={disabled || !gate.canOpen}
            hint={gate.openBlockReason ?? undefined}
            onPress={() => run('open')} style={[styles.keyWide, largeText && styles.controlLarge]} />
          <GateKey label="Close gate" text="Close" icon="contract-outline" disabled={disabled || !gate.canClose}
            hint={gate.closeBlockReason ?? undefined}
            onPress={() => run('close')} style={[styles.keyWide, largeText && styles.controlLarge]} />
        </View>
        <View style={[styles.controls, largeText && styles.controlsLarge]}>
          <GateKey label={held ? 'Release gate hold' : 'Hold gate open'} text={held ? 'Release hold' : 'Hold open'}
            active={held} disabled={disabled || (held ? !gate.canReleaseHold : !gate.canHoldOpen)}
            onPress={() => run(held ? 'releaseHold' : 'holdOpen')} style={[styles.keyWide, largeText && styles.controlLarge]} />
          {gate.paused && gate.position === 100 && gate.autoCloseEnabled && <GateKey label="Resume gate auto-close" text="Resume auto-close"
            disabled={disabled || !gate.canResume} onPress={() => run('resume')} style={[styles.keyWide, largeText && styles.controlLarge]} />}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{gate.safetyLabel}</Text>
          <View style={styles.indicators}>
            <GateIndicator label="Vehicle" value={gate.vehiclePresent === null ? 'Unknown' : gate.vehiclePresent ? 'Present' : 'Absent'}
              warning={gate.vehiclePresent !== false} largeText={largeText} />
            <GateIndicator label="Safety beam" value={gate.beamBlocked === null ? 'Unknown' : gate.beamBlocked ? 'Blocked' : 'Clear'}
              warning={gate.beamBlocked !== false} largeText={largeText} />
            <GateIndicator label="Sensors" value={gate.sensorFault === null ? 'Unknown' : gate.sensorFault ? 'Fault' : 'OK'}
              warning={gate.sensorFault !== false} largeText={largeText} />
          </View>
        </View>
        <View style={styles.autoClose}><Text style={styles.autoCloseText}>{autoCloseSummary(gate)}</Text></View>
        <Text style={styles.feedback}>{disabled ? 'View only · Controls unavailable' : 'Local gate preview · Simulation'}</Text>
      </LinearGradient>
    </LinearGradient>
  </ScrollView>;
}
