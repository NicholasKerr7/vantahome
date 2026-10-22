import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import { assistantStyles as styles } from './assistantStyles';

type Props = {
  rooms: readonly { id: string; name: string }[];
  roomId: string | null;
  label: string;
  onChange: (roomId: string | null) => void;
};

/** Keep the chosen room explicit and restrict suggestions to the already-authorized room catalog. */
export default function AssistantScopePicker({ rooms, roomId, label, onChange }: Props) {
  return <View style={styles.scope}>
    <View style={styles.scopeHeading}><Ionicons name="scan-outline" size={15} color={theme.colors.accentText} />
      <Text style={styles.scopeCaption}>ASK ABOUT</Text><Text numberOfLines={1} style={styles.scopeName}>{label}</Text>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} overScrollMode="never" contentContainerStyle={styles.scopeChoices}>
      {[{ id: null, name: 'My rooms' }, ...rooms].map((room) => <Pressable key={room.id ?? 'all'}
        accessibilityLabel={`Ask about ${room.name}`} accessibilityState={{ selected: roomId === room.id }}
        onPress={() => onChange(room.id)} style={[styles.scopeChip, roomId === room.id && styles.selectedScopeChip]}>
        <Text style={[styles.scopeChipText, roomId === room.id && styles.selectedTabText]}>{room.name}</Text>
      </Pressable>)}
    </ScrollView>
  </View>;
}
