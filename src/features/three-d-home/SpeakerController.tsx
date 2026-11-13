import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import {
  SPEAKER_PRESET_OPTIONS, SPEAKER_SOURCE_OPTIONS, SPEAKER_VOLUME_BOUNDS,
  readSpeakerControllerState, speakerControllerActionId,
} from '../../../packages/home-scene/src/speakerController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { SpeakerControllerArtwork } from './SpeakerControllerArtwork';
import { speakerControllerMaterials, speakerControllerStyles as styles } from './SpeakerControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; motionAllowed?: boolean; onMore: () => void;
}
type SpeakerAction = Parameters<typeof speakerControllerActionId>[0];
type SpeakerChoice = 'source' | 'preset';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
interface KeyProps {
  label: string; text?: string; icon: IconName; disabled?: boolean; active?: boolean;
  role?: 'button' | 'switch'; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Tactile controls expose accepted switch state and keep every target at least 44 points. */
function SpeakerKey({ label, text, icon, disabled = false, active = false, role = 'button', onPress, style }: KeyProps) {
  return <Pressable accessibilityRole={role} accessibilityLabel={label}
    aria-checked={role === 'switch' ? active : undefined}
    accessibilityState={role === 'switch' ? { disabled, checked: active } : { disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, active && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Ionicons accessible={false} name={icon} size={20} color={active ? theme.colors.accentText : theme.colors.text} />
    {text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Source and tone selectors make configuration discoverable without implying a connected service. */
function SpeakerChoiceButton({ label, caption, value, disabled, largeText, onPress }: {
  label: string; caption: string; value: string; disabled: boolean; largeText: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, styles.choice, largeText && styles.choiceLarge, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    <Text style={styles.caption}>{caption}</Text><View style={styles.choiceValue}>
      <Text style={styles.choiceLabel}>{value}</Text><Ionicons accessible={false} name="chevron-down" size={13} color={theme.colors.accentText} />
    </View>
  </Pressable>;
}

/** One saved simulation powers both surfaces; source and sound changes never start playback. */
export function SpeakerController({ device, state, client, disabled, compact, fontScale, motionAllowed = false, onMore }: Props) {
  const [choosing, setChoosing] = useState<SpeakerChoice | null>(null);
  const speaker = readSpeakerControllerState(device, state);
  const largeText = fontScale > 1.15;
  if (!speaker) return null;

  /** Relative volume and media commands resolve against the current shared reducer state. */
  function run(action: SpeakerAction): void { if (!disabled) client.runAction(device.id, speakerControllerActionId(action)); }

  /** Apply only the chosen source or tone preference, then return to the unchanged playback view. */
  function choose(value: string): void {
    if (disabled || !choosing) return;
    client.setSetting(device.id, choosing === 'source' ? 'speakerSource' : 'speakerPreset', value);
    setChoosing(null);
  }

  const options = choosing === 'source' ? SPEAKER_SOURCE_OPTIONS : SPEAKER_PRESET_OPTIONS;
  const selected = choosing === 'source' ? speaker.source : speaker.preset;
  const playLabel = speaker.playing ? 'Pause speaker preview' : 'Play speaker preview';
  const track = speaker.trackIndex === null ? 'Preview track unavailable' : `Preview track ${speaker.trackIndex}`;
  const volumeReading = <View style={[styles.reading, largeText && styles.readingLarge]}>
    <Text style={styles.caption}>VOLUME</Text><Text accessibilityLiveRegion="polite" accessibilityLabel={`Speaker volume: ${speaker.volume}%`} style={styles.volumeValue}>{speaker.volume}%</Text>
  </View>;

  return <ScrollView testID="speaker-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent}
    bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    {choosing ? <View testID="speaker-choice-picker" style={styles.picker}>
      <View style={styles.header}><Text accessibilityRole="header" style={styles.pickerHeading}>{choosing === 'source' ? 'Speaker source' : 'Sound preset'}</Text>
        <SpeakerKey label="Back to speaker controller" icon="close" onPress={() => setChoosing(null)} style={styles.keyCircle} />
      </View>
      <Text style={styles.feedback}>Saved preference · No audio service is connected</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={choosing === 'source' ? 'Speaker source preference' : 'Sound preset preference'} style={styles.pickerOptions}>
        {options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`${choosing === 'source' ? 'Source' : 'Sound preset'}: ${option.label}`}
          aria-checked={selected === option.value} accessibilityState={{ checked: selected === option.value, disabled }} disabled={disabled} onPress={() => choose(option.value)}
          style={({ pressed }) => [styles.pickerChoice, selected === option.value && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
          <Text style={styles.pickerLabel}>{option.label}{selected === option.value ? ' ✓' : ''}</Text>
        </Pressable>)}
      </View>
    </View> : <LinearGradient testID="speaker-tactile-controller" colors={speakerControllerMaterials.edge} style={[styles.shell, compact && styles.shellCompact]}>
      <LinearGradient colors={speakerControllerMaterials.body} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.header}>
          <SpeakerKey label="Speaker power" role="switch" icon="power" active={speaker.on} disabled={disabled}
            onPress={() => { if (!disabled) client.toggle(device.id); }} style={styles.keyCircle} />
          <View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>AUDIO</Text></View>
          <SpeakerKey label="More speaker controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} />
        </View>
        <View style={styles.hero}>
          <SpeakerControllerArtwork active={speaker.playing && !speaker.muted && speaker.volume > 0} compact={compact} motionAllowed={motionAllowed} />
          <View style={[styles.statusRow, largeText && styles.statusRowLarge]}>
            <Text accessibilityLiveRegion="polite" style={styles.status}>{speaker.status}</Text><Text style={styles.track}>{track}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <SpeakerKey label="Previous speaker preview track" icon="play-skip-back" disabled={disabled || speaker.trackIndex === null || speaker.trackIndex <= 1}
            onPress={() => run('previous')} style={styles.keyCircle} />
          <SpeakerKey label={playLabel} text={speaker.playing ? 'Pause' : 'Play'} icon={speaker.playing ? 'pause' : 'play'} active={speaker.playing} disabled={disabled}
            onPress={() => run('playPause')} style={[styles.keyWide, styles.keyHorizontal]} />
          <SpeakerKey label="Next speaker preview track" icon="play-skip-forward" disabled={disabled || speaker.trackIndex === null || speaker.trackIndex >= 99}
            onPress={() => run('next')} style={styles.keyCircle} />
        </View>
        <View role="group" accessibilityLabel="Speaker volume, steps of 5 percent" style={[styles.volume, largeText && styles.volumeLarge]}>
          {largeText && volumeReading}
          <SpeakerKey label="Decrease speaker volume" icon="remove" disabled={disabled || speaker.volume <= SPEAKER_VOLUME_BOUNDS.min}
            onPress={() => run('volumeDown')} style={styles.keyCircle} />
          {!largeText && volumeReading}
          <SpeakerKey label="Increase speaker volume" icon="add" disabled={disabled || speaker.volume >= SPEAKER_VOLUME_BOUNDS.max}
            onPress={() => run('volumeUp')} style={styles.keyCircle} />
          <SpeakerKey label="Speaker mute" role="switch" icon={speaker.muted ? 'volume-mute' : 'volume-high'} active={speaker.muted} disabled={disabled}
            onPress={() => { if (!disabled) client.setSetting(device.id, 'muted', !speaker.muted); }} style={styles.keyCircle} />
        </View>
        <View style={[styles.row, largeText && styles.rowLarge]}>
          <SpeakerChoiceButton label={`Speaker source: ${speaker.source}. Choose source`} caption="SOURCE" value={speaker.source} disabled={disabled} largeText={largeText} onPress={() => setChoosing('source')} />
          <SpeakerChoiceButton label={`Sound preset: ${speaker.preset}. Choose sound preset`} caption="SOUND" value={speaker.preset} disabled={disabled} largeText={largeText} onPress={() => setChoosing('preset')} />
        </View>
        <Text style={styles.feedback}>Local playback preview · No audio is streamed</Text>
        {disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
      </LinearGradient>
    </LinearGradient>}
  </ScrollView>;
}
