import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Pressable from '../../components/Pressable';
import { useHomeStore } from '../../store/useHomeStore';
import { canManageSimulationDevices, removeSimulationDevice } from '../../services/simulationDeviceRegistration';
import { theme } from '../../theme/theme';

/** Remove only an administrator's custom simulation record after a deliberate confirmation. */
export default function RemovePlacedDevice({ modelDeviceId, onRemoved }: { modelDeviceId: string; onRemoved: () => void }) {
  const device = useHomeStore((state) => state.devices.find((item) => item.modelDeviceId === modelDeviceId && item.simulationOnly && item.modelPlacement));
  const allowed = useHomeStore(canManageSimulationDevices);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  /** Wait for authoritative deletion before dismissing; a failure leaves the saved device intact. */
  async function remove(): Promise<void> {
    if (!device || pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await removeSimulationDevice(device.id); onRemoved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The device could not be removed. Try again.'); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!allowed || !device) return null;
  return <View style={styles.container}>
    {confirming ? <>
      <Text style={styles.detail}>Remove {device.name} and its placement? The house furnishing stays unchanged.</Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setConfirming(false); setError(null); }} style={styles.button}><Text style={styles.detail}>Keep device</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Confirm remove added device" disabled={busy} onPress={() => { void remove(); }} style={styles.button}><Text style={styles.remove}>{busy ? 'Removing…' : 'Remove device'}</Text></Pressable>
      </View>
    </> : <Pressable accessibilityRole="button" accessibilityLabel="Remove added device" onPress={() => setConfirming(true)} style={styles.button}><Text style={styles.remove}>Remove added device</Text></Pressable>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 5 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  detail: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17 },
  remove: { color: theme.colors.warningText, fontSize: 12, fontWeight: '500' },
  error: { color: theme.colors.warningText, fontSize: 12, lineHeight: 17 },
});
