import React, { useId, useState } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import {
  SPEAKER_PRESET_OPTIONS, SPEAKER_SOURCE_OPTIONS, SPEAKER_VOLUME_BOUNDS,
  readSpeakerControllerState, speakerControllerActionId,
} from '../../../packages/home-scene/src/speakerController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { speakerControllerMaterials, speakerControllerStyles as styles } from './SpeakerControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; onMore: () => void;
}
type SpeakerState = NonNullable<ReturnType<typeof readSpeakerControllerState>>;
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

/** A static studio speaker lights only for audible preview state; it never implies streamed audio. */
function SpeakerArtwork({ speaker, compact }: { speaker: SpeakerState; compact: boolean }) {
  const id = useId().replace(/:/g, '');
  const shell = `${id}-speaker-shell`;
  const cone = `${id}-speaker-cone`;
  const grille = `${id}-speaker-grille`;
  const active = speaker.playing && !speaker.muted && speaker.volume > 0;
  return <View testID="speaker-preview-model" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.artwork, compact && styles.artworkCompact]}>
    <Svg width="100%" height="100%" viewBox="0 0 320 180" aria-hidden>
      <Defs>
        <SvgGradient id={shell} x1="0%" y1="0%" x2="100%" y2="75%">
          <Stop offset="0" stopColor="#B6A4C7" /><Stop offset="0.2" stopColor="#675574" />
          <Stop offset="0.6" stopColor="#2A2034" /><Stop offset="1" stopColor="#100B18" />
        </SvgGradient>
        <SvgGradient id={cone} x1="0%" y1="0%" x2="95%" y2="100%">
          <Stop offset="0" stopColor="#C3B8CF" /><Stop offset="0.32" stopColor="#62596C" />
          <Stop offset="0.65" stopColor="#2B2536" /><Stop offset="1" stopColor="#8D7C9E" />
        </SvgGradient>
        <Pattern id={grille} patternUnits="userSpaceOnUse" width={4} height={4}>
          <Circle cx={1.5} cy={1.5} r={0.65} fill="#9D88AD" opacity={0.42} />
        </Pattern>
      </Defs>
      <Ellipse cx={160} cy={163} rx={74} ry={10} fill="#08050F" opacity={0.75} />
      <Ellipse cx={160} cy={162} rx={45} ry={6} fill="#695278" opacity={0.32} />
      <Rect x={105} y={11} width={110} height={150} rx={43} fill={`url(#${shell})`} stroke="#A38AB7" strokeWidth={1.4} />
      <Rect x={112} y={15} width={93} height={141} rx={39} fill="#1A1423" stroke="#675477" />
      <Rect x={115} y={18} width={87} height={135} rx={36} fill={`url(#${grille})`} />
      <Path d="M117 41 Q119 20 142 18" fill="none" stroke="#D5C4E1" strokeWidth={1.2} opacity={0.75} strokeLinecap="round" />
      <Circle cx={158} cy={56} r={21} fill="#0D0913" stroke="#8C799B" strokeWidth={1.3} />
      <Circle cx={158} cy={56} r={16} fill={`url(#${cone})`} stroke="#74617F" />
      <Circle cx={158} cy={56} r={8} fill="#2A2335" stroke="#B4A0C5" strokeWidth={0.8} />
      <Circle cx={158} cy={112} r={32} fill="#0C0812" stroke="#8E799F" strokeWidth={1.3} />
      <Circle cx={158} cy={112} r={27} fill={`url(#${cone})`} stroke="#B19BC2" strokeWidth={0.7} />
      <Circle cx={158} cy={112} r={19} fill="none" stroke="#26202F" strokeWidth={2.5} />
      <Circle cx={158} cy={112} r={11} fill="#34293F" stroke="#9983AC" />
      <Ellipse cx={154} cy={108} rx={6} ry={4} fill="#D6C5E4" opacity={0.15} />
      <Path d="M145 28 L171 28" stroke="#44384E" strokeWidth={3} strokeLinecap="round" />
      <Path testID="speaker-preview-indicator" d="M145 28 L171 28" stroke="#D5AEFF" strokeWidth={3} strokeLinecap="round" opacity={active ? 1 : 0} />
      <Path d="M132 148 Q159 154 185 148" fill="none" stroke="#B19AC4" opacity={0.45} strokeLinecap="round" />
    </Svg>
  </View>;
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
export function SpeakerController({ device, state, client, disabled, compact, fontScale, onMore }: Props) {
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
          <SpeakerArtwork speaker={speaker} compact={compact} />
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
