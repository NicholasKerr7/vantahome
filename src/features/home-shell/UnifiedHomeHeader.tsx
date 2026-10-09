import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CinematicSurface from '../../components/CinematicSurface';
import Pressable from '../../components/Pressable';
import VantaHomeMark from '../../components/VantaHomeMark';
import DashboardAccountButton from '../account/DashboardAccountButton';
import { useScenePresentationPaused } from './ScenePresentationContext';
import { homeHeaderTime, homeHeaderWeather } from './homeHeaderPresentation';
import { useHomeStore } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import type { HomeChromeSnapshot } from '../../../packages/home-scene/src/homeChromeProtocol';

type Props = {
  scene: HomeChromeSnapshot | null; ready: boolean; active: boolean;
  onEnvironment: () => void; onVoice: () => void; onAccount: () => void;
};

/** Match the validated conditions without inventing a sunny state for missing weather. */
function conditionIcon(scene: HomeChromeSnapshot | null): React.ComponentProps<typeof Ionicons>['name'] {
  const code = scene?.weatherCode;
  if (code == null) return 'cloud-offline-outline';
  if (code >= 95) return 'thunderstorm-outline';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow-outline';
  if (code >= 51) return 'rainy-outline';
  if (code === 0) return scene?.isNight ? 'moon-outline' : 'sunny-outline';
  return 'cloud-outline';
}

/** One native header keeps account identity private while the scene supplies public atmosphere. */
export default function UnifiedHomeHeader({ scene, ready, active, onEnvironment, onVoice, onAccount }: Props) {
  const { width, height, fontScale } = useWindowDimensions();
  const wide = Math.min(width, height) >= 600 && fontScale <= 1.3;
  const covered = useScenePresentationPaused();
  const unit = useHomeStore(state => state.profile.tempUnit ?? 'C');
  const format = useHomeStore(state => state.profile.timeFormat ?? '12h');
  const time = homeHeaderTime(scene?.localTime, format);
  const weather = homeHeaderWeather(scene, unit);
  const location = scene?.locationName ?? 'Your property';
  const motion = active && !covered && ready && !scene?.motionDisabled && !scene?.systemReducedMotion;
  return <CinematicSurface variant="orbit" active={motion} style={styles.surface}>
    <View testID="unified-home-header" style={[styles.row, wide && styles.wideRow]}>
      <View style={[styles.brand, wide && styles.wideBrand]} accessibilityLabel="VantaHome. Simulation, no real device control" accessible>
        <View style={styles.mark}><VantaHomeMark size={32} decorative /></View>
        {wide ? <View style={styles.brandCopy}>
          <Text style={styles.wordmark}>VANTA<Text style={styles.brandTail}>HOME</Text></Text>
          <Text style={styles.simulation}>Simulation · no real device control</Text>
        </View> : <Text style={styles.compactSimulation}>SIMULATION</Text>}
      </View>
      <Pressable style={[styles.atmosphere, wide && styles.wideAtmosphere, !ready && styles.waiting]} onPress={onEnvironment}
        disabled={!ready} accessibilityState={{ disabled: !ready }}
        accessibilityLabel={`Property time and weather: ${location}, ${time}, ${weather.temperature}, ${weather.status}`}
        accessibilityHint="Open time, daylight and weather details">
        <View style={styles.locationRow}>
          <View style={[styles.statusDot, scene?.weatherStatus === 'live' && styles.statusCurrent, scene?.weatherStatus === 'cached' && styles.statusSaved]} />
          <Text numberOfLines={1} style={styles.location}>{location}</Text>
          {wide && <Text numberOfLines={1} style={styles.estimate}>{weather.status}</Text>}
        </View>
        <View style={styles.readings}>
          <Text style={[styles.time, !wide && styles.compactTime]} numberOfLines={1}>{time}</Text>
          <View style={styles.readingDivider} />
          <Ionicons name={conditionIcon(scene)} size={16} color={scene?.isNight ? theme.colors.accentText : theme.colors.ember} />
          <Text style={styles.temperature} numberOfLines={1}>{weather.temperature}</Text>
        </View>
      </Pressable>
      <Pressable style={styles.voice} onPress={onVoice} accessibilityLabel="Open voice control" accessibilityHint="Speak a command to your home">
        <Ionicons name="mic-outline" size={21} color={theme.colors.accentText} />
      </Pressable>
      <DashboardAccountButton compact={!wide} onPress={onAccount} />
    </View>
  </CinematicSurface>;
}

const styles = StyleSheet.create({
  surface: { flexShrink: 0 },
  row: { minHeight: 68, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  wideRow: { minHeight: 76, paddingHorizontal: 18, gap: 14 },
  brand: { width: 44, alignItems: 'center', justifyContent: 'center', gap: 2 },
  wideBrand: { width: 228, flexDirection: 'row', justifyContent: 'flex-start', gap: 10 },
  mark: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.overlay },
  brandCopy: { flexShrink: 1, gap: 4 },
  wordmark: { color: theme.colors.text, fontSize: 14, fontWeight: '700', letterSpacing: 2.1 },
  brandTail: { color: theme.colors.accentText, fontWeight: '300' },
  simulation: { color: theme.colors.subtext, fontSize: 8 },
  compactSimulation: { color: theme.colors.subtext, fontSize: 6, letterSpacing: 0.65, fontWeight: '600' },
  atmosphere: { flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', paddingHorizontal: 6, gap: 5, borderRadius: 16 },
  wideAtmosphere: { paddingHorizontal: 12, borderLeftWidth: 1, borderLeftColor: theme.colors.stroke, borderRadius: 0 },
  waiting: { opacity: 0.65 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  location: { color: theme.colors.subtext, fontSize: 10, flexShrink: 1 },
  estimate: { color: theme.colors.muted, fontSize: 9, flexShrink: 1, marginLeft: 4 },
  statusDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.muted },
  statusCurrent: { backgroundColor: theme.colors.accentText },
  statusSaved: { backgroundColor: theme.colors.ember },
  readings: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  time: { color: theme.colors.text, fontSize: 19, fontWeight: '500', fontVariant: ['tabular-nums'], letterSpacing: -0.4, flexShrink: 1 },
  compactTime: { fontSize: 14 },
  readingDivider: { width: 1, height: 13, backgroundColor: theme.colors.stroke },
  temperature: { color: theme.colors.text, fontSize: 12, fontVariant: ['tabular-nums'], flexShrink: 1 },
  voice: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card2, alignItems: 'center', justifyContent: 'center' },
});
