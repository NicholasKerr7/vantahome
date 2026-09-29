import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Pressable from '../../components/Pressable';
import type { Room } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import type { SceneEditorScope } from './sceneScope';
import { sceneChoiceKeyboard } from './sceneChoiceKeyboard';

type SceneScopePickerProps = {
  scope: SceneEditorScope;
  roomId: string;
  rooms: readonly Room[];
  selectedCount: number;
  onScopeChange: (scope: SceneEditorScope) => void;
  onRoomChange: (roomId: string) => void;
};

/** Keep a scene's saved scope distinct from the room filter used to find its devices. */
export function SceneScopePicker({ scope, roomId, rooms, selectedCount, onScopeChange, onRoomChange }: SceneScopePickerProps) {
  const wholeHome = scope === 'home';
  const options = wholeHome ? [{ id: '', name: 'All rooms' }, ...rooms] : rooms;
  return <View style={styles.root}>
    <Text style={styles.label}>Scene scope</Text>
    <View style={styles.scopeChoices} accessibilityRole="radiogroup" accessibilityLabel="Scene scope">
      {([{ id: 'home', name: 'Whole home' }, { id: 'room', name: 'One room' }] as const).map((option) => <Pressable
        key={option.id}
        accessibilityRole="radio"
        accessibilityLabel={option.name}
        accessibilityState={{ checked: scope === option.id }}
        aria-checked={scope === option.id}
        {...sceneChoiceKeyboard(() => onScopeChange(option.id))}
        style={[styles.scopeButton, scope === option.id && styles.scopeButtonSelected]}
        onPress={() => onScopeChange(option.id)}
      ><Text style={[styles.choiceText, scope === option.id && styles.choiceTextSelected]}>{option.name}</Text></Pressable>)}
    </View>
    <Text style={styles.hint}>{wholeHome ? 'Bring devices from several rooms into one scene.' : 'Keep this scene focused on one room.'}</Text>
    <Text style={styles.label}>{wholeHome ? 'Browse devices by room' : 'Room'}</Text>
    <ScrollView horizontal accessibilityRole="radiogroup" accessibilityLabel={wholeHome ? 'Browse devices by room' : 'Scene room'} showsHorizontalScrollIndicator={false} bounces={false} overScrollMode="never" contentContainerStyle={styles.roomChoices}>
      {options.map((room) => <Pressable
        key={room.id || 'all-rooms'}
        accessibilityRole="radio"
        accessibilityLabel={`Scene room: ${room.name}`}
        accessibilityState={{ checked: roomId === room.id }}
        aria-checked={roomId === room.id}
        {...sceneChoiceKeyboard(() => onRoomChange(room.id))}
        style={[styles.roomButton, roomId === room.id && styles.scopeButtonSelected]}
        onPress={() => onRoomChange(room.id)}
      ><Text style={[styles.choiceText, roomId === room.id && styles.choiceTextSelected]}>{room.name}</Text></Pressable>)}
    </ScrollView>
    <Text style={styles.hint} accessibilityLiveRegion="polite">{selectedCount} {selectedCount === 1 ? 'device selected' : 'devices selected'}{wholeHome ? ' across your home' : ''}</Text>
  </View>;
}

const styles = StyleSheet.create({
  root: { marginTop: 12, gap: 8 },
  label: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
  hint: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  scopeChoices: { flexDirection: 'row', gap: 8 },
  scopeButton: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  scopeButtonSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent2 },
  choiceText: { color: theme.colors.subtext, fontSize: 12, fontWeight: '600' },
  choiceTextSelected: { color: theme.colors.text },
  roomChoices: { gap: 8, paddingVertical: 2 },
  roomButton: { minHeight: 44, paddingHorizontal: 13, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card, justifyContent: 'center', alignItems: 'center' },
});
