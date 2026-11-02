import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import ModalCard from '../../components/ModalCard';
import Pressable from '../../components/Pressable';
import { DeepAction } from '../../components/deep/DeepScreen';
import { theme } from '../../theme/theme';
import type { DeviceHealthEntry } from './deviceHealthModel';
import { healthStyles as styles } from './DeviceHealthStyles';

/** Explain provenance and the next useful step without issuing commands or clearing an actual condition. */
export function DeviceHealthDetails({ entry, onClose, onOpen }: { entry: DeviceHealthEntry; onClose: () => void; onOpen: () => void }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sizing = useMemo(() => StyleSheet.create({ modal: { maxHeight: Math.max(240, height - insets.top - insets.bottom - 36) } }), [height, insets.top, insets.bottom]);
  const example = entry.source === 'sample';
  return <ModalCard visible onRequestClose={onClose} animationType="none" colors={[theme.colors.bg0, theme.colors.surface]}
    cardStyle={[styles.modal, sizing.modal]} backdropAccessibilityLabel="Close health details">
    <View style={styles.modalHeader}><View style={styles.modalHeading}>
      <Text style={styles.eyebrow}>{example ? 'EXAMPLE ALERT · LOCAL ONLY' : entry.source === 'simulation' ? 'MODEL SIMULATION' : 'NO VERIFIED HEALTH FEED'}</Text>
      <Text accessibilityRole="header" style={styles.name}>{entry.name}</Text><Text style={styles.room}>{entry.roomName}</Text>
    </View><Pressable accessibilityLabel="Close device health details" onPress={onClose} style={styles.close}><Ionicons name="close" size={22} color={theme.colors.text} /></Pressable></View>
    <ScrollView testID="device-health-detail-scroll" style={styles.modalScroll} contentContainerStyle={styles.modalContent} bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false}>
      <View style={styles.metric}><Text style={styles.metricValue}>{entry.headline}</Text><Text style={styles.detail}>{entry.detail}</Text></View>
      {entry.issues.filter((issue) => issue.title !== entry.headline || issue.detail !== entry.detail).map((issue, index) => <View key={`${issue.kind}:${index}`} style={styles.metric}><Text style={[styles.metricTitle, styles.warning]}>{issue.title}</Text><Text style={styles.detail}>{issue.detail}</Text></View>)}
      <View style={styles.metric}><Text style={styles.metricTitle}>BATTERY & CARE</Text>
        <Text style={styles.metricValue}>{entry.battery === null ? 'Battery not reported' : `${entry.battery}% · ${example ? 'example' : 'simulation sample'}`}</Text>
        <Text style={styles.detail}>{entry.maintenance ?? 'No maintenance sample available for this device.'}</Text></View>
      <Text style={styles.caption}>{example ? 'These examples end when you leave Device Health. No device state, reminder or history is saved.' : 'Connection and report time are unverified. Missing alerts do not establish that a device is healthy.'}</Text>
    </ScrollView>
    <DeepAction label={example ? 'Back to Device Health' : 'Open device controls'} onPress={example ? onClose : onOpen} primary icon={example ? 'arrow-back' : 'options-outline'} />
  </ModalCard>;
}
