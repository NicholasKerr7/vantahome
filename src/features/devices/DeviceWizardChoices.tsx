import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DeepPager } from '../../components/deep/DeepScreen';
import Pressable from '../../components/Pressable';
import DeviceIcon from '../../components/DeviceIcon';
import { theme } from '../../theme/theme';
import type { Device } from '../../store/useHomeStore';
import CinematicCardArtwork from '../cinematic-artwork/CinematicCardArtwork';
import type { ArtworkKey } from '../cinematic-artwork/artwork';

export type DeviceWizardChoice = {
  id: string;
  name: string;
  detail: string;
  artwork: ArtworkKey;
  kind?: Device['kind'];
};

type Props = {
  choices: readonly DeviceWizardChoice[];
  selectedId: string;
  label: string;
  onSelect: (id: string) => void;
};

/** Page visual choices inside the viewport, preserving complete touch targets and readable labels. */
export default function DeviceWizardChoices({ choices, selectedId, label, onSelect }: Props) {
  const { width, fontScale } = useWindowDimensions();
  const [availableHeight, setAvailableHeight] = useState(240);
  const [availableWidth, setAvailableWidth] = useState(width - 32);
  const columns = availableWidth >= 620 && fontScale <= 1.3 ? 2 : 1;
  const cardHeight = Math.ceil(76 * Math.max(1, fontScale));
  const rows = Math.max(1, Math.min(3, Math.floor((availableHeight - 56) / (cardHeight + 10))));
  const choiceHeight = useMemo(() => StyleSheet.create({ choice: { minHeight: cardHeight } }).choice, [cardHeight]);
  const pageSize = columns * rows;
  const [anchorIndex, setAnchorIndex] = useState(() => Math.max(0, choices.findIndex((choice) => choice.id === selectedId)));
  const pageCount = Math.max(1, Math.ceil(choices.length / pageSize));
  const page = Math.min(Math.floor(anchorIndex / pageSize), pageCount - 1);
  return <View style={styles.body} onLayout={(event) => { setAvailableHeight(event.nativeEvent.layout.height); setAvailableWidth(event.nativeEvent.layout.width); }}>
    <View style={styles.grid}>
      {choices.slice(page * pageSize, (page + 1) * pageSize).map((choice) => {
        const selected = choice.id === selectedId;
        return <Pressable key={choice.id} accessibilityRole="radio" accessibilityLabel={choice.name}
          accessibilityHint={choice.detail} accessibilityState={{ checked: selected }}
          onPress={() => onSelect(choice.id)} style={[styles.choice, choiceHeight, columns === 2 && styles.halfChoice, selected && styles.selected]}>
          <CinematicCardArtwork artwork={choice.artwork} variant="room-row" />
          <View style={styles.icon}>
            {choice.kind ? <DeviceIcon kind={choice.kind} size={22} color={theme.colors.accentText} />
              : <Ionicons name="cube-outline" size={22} color={theme.colors.accentText} />}
          </View>
          <View style={styles.copy}>
            <Text numberOfLines={2} style={styles.name}>{choice.name}</Text>
            <Text numberOfLines={2} style={styles.detail}>{choice.detail}</Text>
          </View>
          <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={23}
            color={selected ? theme.colors.accentText : theme.colors.subtext} />
        </Pressable>;
      })}
    </View>
    <DeepPager page={page} pageCount={pageCount} label={label} onChange={(next) => setAnchorIndex(next * pageSize)} />
  </View>;
}

const styles = StyleSheet.create({
  body: { flex: 1, minHeight: 0, gap: 10 },
  grid: { flex: 1, minHeight: 0, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', gap: 10 },
  choice: { width: '100%', minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.surface },
  halfChoice: { width: '48.8%' },
  selected: { borderColor: theme.colors.accent },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.overlayStrong },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  name: { color: theme.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  detail: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16 },
});
