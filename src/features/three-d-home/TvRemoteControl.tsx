import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { readTvRemoteState, TV_SOURCE_OPTIONS, tvRemoteActionId, type TvRemoteKey, type TvRemoteState } from '../../../packages/home-scene/src/tvRemote';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { tvRemoteMaterials, tvRemoteStyles as styles } from './TvRemoteStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; onMore: () => void;
}
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; icon?: IconName; text?: string; disabled?: boolean; active?: boolean;
  onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Each raised key is a labeled native button with a full-sized, non-overlapping target. */
function RemoteKey({ label, icon, text, disabled = false, active = false, onPress, style }: KeyProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={21} color={active ? theme.colors.accentText : theme.colors.text} />}
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Pair bounded relative actions in the physical volume/channel arrangement. */
function Rocker({ label, value, up, down, disabled, run }: {
  label: string; value: number; up: TvRemoteKey; down: TvRemoteKey; disabled: boolean; run: (key: TvRemoteKey) => void;
}) {
  const name = label === 'VOL' ? 'Volume' : 'Channel';
  return <View style={styles.rocker}>
    <RemoteKey label={`${name} up`} icon="add" disabled={disabled} onPress={() => run(up)} style={[styles.keyCircle, styles.rockerKey]} />
    <Text style={styles.rockerLabel}>{label}{'\n'}{value}</Text>
    <RemoteKey label={`${name} down`} icon="remove" disabled={disabled} onPress={() => run(down)} style={[styles.keyCircle, styles.rockerKey]} />
  </View>;
}

/** Reuse the same mute/play controls when the remote folds into its shorter layout. */
function PlaybackKeys({ deviceId, remote, client, disabled, compact, run }: {
  deviceId: string; remote: TvRemoteState; client: SimulationDeviceControls; disabled: boolean; compact: boolean; run: (key: TvRemoteKey) => void;
}) {
  return <View style={[styles.centerKeys, compact && styles.centerKeysCompact]}>
    <RemoteKey label={remote.muted ? 'Unmute TV' : 'Mute TV'} icon={remote.muted ? 'volume-mute' : 'volume-medium'} active={remote.muted}
      disabled={disabled} onPress={() => client.setSetting(deviceId, 'muted', !remote.muted)} style={styles.keyCircle} />
    <RemoteKey label={remote.playing ? 'Pause preview' : 'Play preview'} icon={remote.playing ? 'pause' : 'play'} disabled={disabled}
      onPress={() => run('playPause')} style={styles.keyCircle} />
  </View>;
}

/** A code-rendered tactile remote sends only existing guarded simulation commands. */
export function TvRemoteControl({ device, state, client, disabled, compact, onMore }: Props) {
  const [choosingSource, setChoosingSource] = useState(false);
  const remote = readTvRemoteState(device, state);
  /** Resolve relative actions at the reducer so rapid presses never reuse a stale UI value. */
  function run(key: TvRemoteKey): void { if (!disabled) client.runAction(device.id, tvRemoteActionId(key)); }
  /** Setting a source changes the local preview selection without inventing a live connection. */
  function chooseSource(source: string): void {
    if (!disabled) { client.setSetting(device.id, 'source', source); setChoosingSource(false); }
  }
  const playback = remote.playing ? 'Playing' : 'Paused';
  const feedback = remote.on
    ? `${playback} · ${remote.positionSec}s · Track ${remote.track}${remote.muted ? ' · Muted' : ''}`
    : 'TV off · Your settings are remembered';
  return <ScrollView testID="tv-remote-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    {choosingSource ? <View testID="tv-source-picker" style={styles.sourcePanel}>
      <View style={styles.row}><Text accessibilityRole="header" style={styles.sourceTitle}>Preview source</Text>
        <RemoteKey label="Back to TV remote" icon="close" onPress={() => setChoosingSource(false)} style={styles.keyCircle} />
      </View>
      <Text style={styles.feedback}>Local simulation · No streaming connection</Text>
      {TV_SOURCE_OPTIONS.map((source) => <Pressable key={source} accessibilityRole="radio" accessibilityLabel={source}
        accessibilityState={{ checked: remote.source === source, disabled }} disabled={disabled} onPress={() => chooseSource(source)}
        style={({ pressed }) => [styles.sourceOption, remote.source === source && styles.sourceOptionSelected, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
        <Text style={styles.sourceOptionText}>{source}{remote.source === source ? ' ✓' : ''}</Text>
      </Pressable>)}
    </View> : <LinearGradient testID="tv-tactile-remote" colors={tvRemoteMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={tvRemoteMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={[styles.row, styles.header]}>
          <RemoteKey label={remote.on ? 'Turn TV off' : 'Turn TV on'} icon="power" active={remote.on} disabled={disabled}
            onPress={() => client.toggle(device.id)} style={styles.keyCircle} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Source: ${remote.source}. Choose preview source`} accessibilityState={{ disabled }} disabled={disabled}
            onPress={() => setChoosingSource(true)} style={({ pressed }) => [styles.source, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
            <Text style={[styles.powerStatus, remote.on && styles.powerStatusOn]}>{remote.on ? 'TV ON' : 'TV OFF'}</Text>
            <Text style={styles.sourceName}>{remote.source}⌄</Text>
          </Pressable>
          <RemoteKey label="More TV controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={[styles.core, compact && styles.coreCompact]}>
          <LinearGradient colors={tvRemoteMaterials.ring} style={styles.dpad}>
            <RemoteKey label="Remote up" icon="chevron-up" onPress={() => run('up')} disabled={disabled} style={[styles.keyCircle, styles.dpadKey, styles.up]} />
            <RemoteKey label="Remote left" icon="chevron-back" onPress={() => run('left')} disabled={disabled} style={[styles.keyCircle, styles.dpadKey, styles.left]} />
            <RemoteKey label="Remote OK" text="OK" onPress={() => run('select')} disabled={disabled} style={[styles.keyCircle, styles.dpadKey, styles.select]} />
            <RemoteKey label="Remote right" icon="chevron-forward" onPress={() => run('right')} disabled={disabled} style={[styles.keyCircle, styles.dpadKey, styles.right]} />
            <RemoteKey label="Remote down" icon="chevron-down" onPress={() => run('down')} disabled={disabled} style={[styles.keyCircle, styles.dpadKey, styles.down]} />
          </LinearGradient>
          <View style={[styles.controls, compact && styles.controlsCompact]}>
            <Rocker label="VOL" value={remote.volume} up="volumeUp" down="volumeDown" disabled={disabled} run={run} />
            {!compact && <PlaybackKeys deviceId={device.id} remote={remote} client={client} disabled={disabled} compact={false} run={run} />}
            <Rocker label="CH" value={remote.channel} up="channelUp" down="channelDown" disabled={disabled} run={run} />
            {compact && <PlaybackKeys deviceId={device.id} remote={remote} client={client} disabled={disabled} compact run={run} />}
          </View>
        </View>
        <View style={styles.row}>
          <RemoteKey label="Remote back" icon="return-up-back" text="Back" disabled={disabled} onPress={() => run('back')} style={styles.keyWide} />
          <RemoteKey label="Remote home" icon="home-outline" text="Home" disabled={disabled} onPress={() => run('home')} style={styles.keyWide} />
          <RemoteKey label="Preview guide" icon="list-outline" text="Guide" disabled={disabled} onPress={() => client.runAction(device.id, 'tv-source-guide')} style={styles.keyWide} />
        </View>
        <View style={styles.row}>
          <RemoteKey label="Previous preview track" icon="play-skip-back" disabled={disabled} onPress={() => run('previous')} style={styles.keyWide} />
          <RemoteKey label="Rewind preview 10 seconds" icon="play-back" disabled={disabled} onPress={() => run('rewind')} style={styles.keyWide} />
          <RemoteKey label="Forward preview 10 seconds" icon="play-forward" disabled={disabled} onPress={() => run('forward')} style={styles.keyWide} />
          <RemoteKey label="Next preview track" icon="play-skip-forward" disabled={disabled} onPress={() => run('next')} style={styles.keyWide} />
        </View>
        <View style={styles.footer}>
          <Text style={styles.brand}>VANTAHOME</Text>
          <Text accessibilityLiveRegion="polite" style={styles.feedback}>{disabled ? 'View only · Controls unavailable' : feedback}</Text>
          {remote.on && <Text style={styles.feedback}>Menu tile {remote.focus}{remote.selection ? ` · Selected ${remote.selection}` : ''}</Text>}
        </View>
      </LinearGradient>
    </LinearGradient>}
  </ScrollView>;
}
