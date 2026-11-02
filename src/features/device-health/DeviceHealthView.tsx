import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Pressable from '../../components/Pressable';
import DeviceIcon from '../../components/DeviceIcon';
import ScrollableCardPages from '../../components/ScrollableCardPages';
import { DeepPager, DeepTabs } from '../../components/deep/DeepScreen';
import CinematicCardArtwork from '../cinematic-artwork/CinematicCardArtwork';
import { deviceArtwork } from '../cinematic-artwork/artwork';
import { theme } from '../../theme/theme';
import type { DeviceHealthEntry } from './deviceHealthModel';
import { HealthPulseArtwork } from './HealthPulseArtwork';
import { healthStyles as styles } from './DeviceHealthStyles';

export type HealthFilter = 'all' | 'attention' | 'unreported';
interface Props { entries: readonly DeviceHealthEntry[]; examples: boolean; canTryExamples: boolean; onExamples: () => void; onSelect: (id: string) => void }

/** Keep the device collection horizontally scrollable, with complete cards and no ordinary vertical page scroll. */
export function DeviceHealthView({ entries, examples, canTryExamples, onExamples, onSelect }: Props) {
  const { height, fontScale } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HealthFilter>('all');
  const [page, setPage] = useState(0);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const compact = height < 850;
  const fallback = height < 650 || fontScale > 1.3;
  const maximumColumns = stage.width >= 1000 ? 3 : stage.width >= 650 ? 2 : 1;
  const rows = Math.max(1, Math.min(2, Math.floor((stage.height + 10) / (180 * fontScale + 10))));
  const needle = query.trim().toLocaleLowerCase();
  const filtered = entries.filter((entry) => (filter === 'all' || entry.status === filter)
    && `${entry.name} ${entry.roomName}`.toLocaleLowerCase().includes(needle));
  const columns = filtered.length === 4 ? Math.min(2, maximumColumns) : maximumColumns;
  const capacity = columns * rows;
  const count = Math.max(1, Math.ceil(filtered.length / capacity));
  const current = Math.min(page, count - 1);
  const attention = entries.filter((entry) => entry.status === 'attention').length;
  const unreported = entries.filter((entry) => entry.status === 'unreported').length;
  const examplesCount = entries.filter((entry) => entry.source === 'sample').length;

  /** Reset navigation when replacing the visible collection so a hidden old card cannot remain selected. */
  function changeFilter(next: HealthFilter): void { setFilter(next); setPage(0); }
  // Bounded content prevents ordinary vertical scrolling; disabling this parent also blocks nested web touch swipes.
  return <ScrollView testID="device-health-workspace" style={styles.viewport} contentContainerStyle={[styles.content, fallback && styles.fallbackContent]}
    nestedScrollEnabled directionalLockEnabled bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={fallback}>
    <View style={[styles.hero, compact && styles.heroCompact]}>
      <View style={[styles.pulse, compact && styles.pulseCompact]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><HealthPulseArtwork examples={examples} /></View>
      <View style={styles.heroCopy}><Text style={styles.eyebrow}>YOUR HOME / DEVICE CARE</Text><Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>Know what needs care.</Text>
        <Text style={styles.detail}>{examples ? 'Example alerts are on. Your saved home is untouched.' : 'Your model in view. Live health is not connected.'}</Text>
        <Text style={styles.summary}>{entries.length} in your view · {examples ? `${examplesCount} examples` : '0 live health feeds'}</Text>
      </View>
    </View>
    <View style={styles.searchRow}>
      <TextInput accessibilityLabel="Search device health by device or room" value={query} onChangeText={(value) => { setQuery(value); setPage(0); }}
        placeholder="Search devices or rooms" placeholderTextColor={theme.colors.muted} style={styles.search} autoCorrect={false} returnKeyType="search" />
      {canTryExamples && <Pressable accessibilityLabel={examples ? 'End example alerts' : 'Try example alerts'} accessibilityState={{ selected: examples }}
        onPress={() => { onExamples(); changeFilter(examples ? 'all' : 'attention'); }} style={[styles.sampleButton, examples && styles.sampleSelected]}>
        <Text style={[styles.sampleLabel, examples && styles.sampleSelectedLabel]}>{examples ? 'End examples' : 'Try examples'}</Text>
      </Pressable>}
    </View>
    <DeepTabs<HealthFilter> selectedId={filter} onSelect={changeFilter} items={[
      { id: 'all', label: `All · ${entries.length}` }, { id: 'attention', label: `Attention · ${attention}` }, { id: 'unreported', label: `Unreported · ${unreported}` },
    ]} />
    <View style={styles.stage} onLayout={(event) => { const { width, height: measuredHeight } = event.nativeEvent.layout; setStage((old) => old.width === width && old.height === measuredHeight ? old : { width, height: measuredHeight }); }}>
      {filtered.length ? <ScrollableCardPages page={current} count={count} onChange={setPage} resetKey={`${filter}:${needle}:${examples}:${capacity}`} testID="device-health-pages"
        renderPage={(index) => {
          const items = filtered.slice(index * capacity, (index + 1) * capacity);
          return <View style={styles.page}>{Array.from({ length: Math.ceil(items.length / columns) }, (_, row) => <View key={row} style={styles.row}>
            {items.slice(row * columns, (row + 1) * columns).map((entry) => <HealthDeviceCard key={entry.id} entry={entry} onPress={() => onSelect(entry.id)} />)}
            {Array.from({ length: columns - items.slice(row * columns, (row + 1) * columns).length }, (_, empty) => <View key={`empty-${empty}`} style={styles.placeholder} />)}
          </View>)}</View>;
        }} /> : <DeviceHealthEmpty title={entries.length ? 'Nothing in this view' : 'No devices in your access'}
          detail={entries.length ? 'Try another filter or search. An empty attention list is not proof of physical device health.' : 'Devices will appear here when your household grants access.'} />}
    </View>
    {filtered.length > 0 && <DeepPager page={current} pageCount={count} onChange={setPage} label="health pages" />}
  </ScrollView>;
}

/** A card represents source-aware information only; activation opens explanation rather than toggling equipment. */
function HealthDeviceCard({ entry, onPress }: { entry: DeviceHealthEntry; onPress: () => void }) {
  return <Pressable accessibilityLabel={`${entry.name}, ${entry.roomName}. ${entry.headline}. View health details`} onPress={onPress} style={[styles.card, entry.status === 'attention' && styles.cardAttention]}>
    <CinematicCardArtwork artwork={deviceArtwork(entry)} />
    <View style={styles.cardHeader}><View style={styles.icon}><DeviceIcon kind={entry.kind} size={22} color={theme.colors.accentText} /></View>
      <View style={styles.cardIdentity}><Text style={styles.name} numberOfLines={2}>{entry.name}</Text><Text style={styles.room} numberOfLines={1}>{entry.roomName}</Text></View>
      <Ionicons name="arrow-forward" size={18} color={theme.colors.accentText} /></View>
    <View style={styles.cardBottom}><Text style={[styles.headline, entry.status === 'attention' && styles.warning]} numberOfLines={2}>{entry.headline}</Text>
      <View style={styles.cardMeta}><Text style={styles.source}>{entry.source === 'sample' ? 'EXAMPLE · LOCAL ONLY' : entry.source === 'simulation' ? 'SIMULATION · NO LIVE REPORT' : 'HEALTH NOT CONNECTED'}</Text>
        {entry.battery !== null && <Text style={styles.battery}>{entry.battery}% sample</Text>}</View>
    </View>
  </Pressable>;
}

/** Keep loading, empty, access and recovery messages within the same bounded workspace. */
export function DeviceHealthEmpty({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.empty}><Ionicons name="pulse-outline" size={32} color={theme.colors.accentText} />
    <Text accessibilityRole="header" style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDetail}>{detail}</Text></View>;
}
