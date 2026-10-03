import React, { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { DEVICES, ROOMS } from '../../../packages/home-scene/src/data';
import { DeepAction, DeepPager, DeepScreen } from '../../components/deep/DeepScreen';
import Pressable from '../../components/Pressable';
import { saveModelRoomBinding } from '../../services/modelRoomBinding';
import { useHomeStore } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import { homeEditorScope } from '../home-shell/homeEditorScope';
import { selectHomeNavigationAccess } from '../home-shell/homeNavigationAccess';

type Choice = { id: string; name: string; detail: string };
type Props = { roomId: string; onClose: () => void };

/** Page complete touch targets instead of scrolling long room or device choices vertically. */
function ConnectionChoices({ choices, selected, onSelect, label }: { choices: readonly Choice[]; selected: string; onSelect: (id: string) => void; label: string }) {
  const { height, fontScale } = useWindowDimensions();
  const pageSize = fontScale > 1.2 ? 1 : height < 800 ? 2 : 3;
  const [requestedPage, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(choices.length / pageSize));
  const page = Math.min(requestedPage, pageCount - 1);
  return <View style={styles.choices}>
    <View style={styles.choiceList}>{choices.slice(page * pageSize, (page + 1) * pageSize).map((choice) =>
      <Pressable key={choice.id} accessibilityLabel={choice.name} accessibilityHint={choice.detail}
        accessibilityRole="radio" accessibilityState={{ checked: choice.id === selected }}
        style={[styles.choice, choice.id === selected && styles.selectedChoice]} onPress={() => onSelect(choice.id)}>
        <Text numberOfLines={2} style={styles.choiceName}>{choice.name}</Text>
        <Text numberOfLines={1} style={styles.detail}>{choice.detail}</Text>
      </Pressable>)}</View>
    <DeepPager label={label} page={page} pageCount={pageCount} onChange={setPage} />
  </View>;
}

/** Explicitly connect a cloud room and same-kind devices to authored model positions. */
export default function ModelRoomConnection({ roomId, onClose }: Props) {
  const room = useHomeStore((state) => state.rooms.find((candidate) => candidate.id === roomId));
  const devices = useHomeStore(useShallow((state) => state.devices.filter((device) => device.roomId === roomId)));
  const roomConnections = useHomeStore(useShallow((state) => state.rooms.filter((candidate) => candidate.id !== roomId && candidate.modelRoomId).map((candidate) => candidate.modelRoomId)));
  const allowed = useHomeStore((state) => selectHomeNavigationAccess(state).admin && Boolean(state.authenticatedUserId));
  const scope = useHomeStore(homeEditorScope);
  const [initialScope] = useState(scope);
  const [modelRoomId, setModelRoomId] = useState(room?.modelRoomId ?? '');
  const [bindings, setBindings] = useState<Record<string, string>>(() => Object.fromEntries(devices.flatMap((device) => {
    const target = DEVICES.find((candidate) => candidate.id === device.modelDeviceId && candidate.kind === device.kind && candidate.roomId === room?.modelRoomId);
    return target ? [[device.id, target.id]] : [];
  })));
  const [step, setStep] = useState<'room' | 'devices'>('room');
  const [devicePage, setDevicePage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const currentDevice = devices[Math.min(devicePage, Math.max(0, devices.length - 1))];
  const selectedModelRoom = ROOMS.find((candidate) => candidate.id === modelRoomId);
  const roomChoices: Choice[] = [{ id: '', name: 'Not connected', detail: 'Keep this room out of the 3D model' }, ...ROOMS
    .filter((candidate) => !roomConnections.includes(candidate.id))
    .map((candidate) => ({ id: candidate.id, name: candidate.name, detail: candidate.outdoor ? 'Outside' : candidate.floor === 'upper' ? 'Upper floor' : 'Ground floor' }))];
  const deviceChoices: Choice[] = [{ id: '', name: 'No model device', detail: 'Keep this device in its room collection' }, ...DEVICES
    .filter((candidate) => candidate.roomId === modelRoomId && candidate.kind === currentDevice?.kind
      && !devices.some((device) => device.id !== currentDevice?.id && bindings[device.id] === candidate.id))
    .map((candidate) => ({ id: candidate.id, name: candidate.name, detail: candidate.description }))];

  /** Reset device choices when the administrator explicitly chooses another room. */
  function chooseRoom(next: string): void {
    if (saving) return;
    if (next !== modelRoomId) setBindings({});
    setModelRoomId(next);
    setError(null);
  }

  /** Save one validated mapping transaction; a changed identity never inherits an open draft. */
  async function saveConnections(): Promise<void> {
    if (pending.current || homeEditorScope(useHomeStore.getState()) !== initialScope) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      await saveModelRoomBinding(roomId, modelRoomId || null, modelRoomId ? devices.flatMap((device) =>
        bindings[device.id] ? [{ deviceId: device.id, modelDeviceId: bindings[device.id] }] : []) : []);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The room connection could not be saved. Try again.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  if (!room || !allowed || scope !== initialScope) return null;
  return <Modal visible animationType="none" onRequestClose={onClose}>
    <DeepScreen title="Connect 3D room" eyebrow={room.name.toUpperCase()} onBack={onClose}>
      <View style={styles.body}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{step === 'room' ? 'Choose its place.' : currentDevice?.name ?? 'No devices yet.'}</Text>
          <Text style={styles.detail}>{step === 'room' ? 'Choose the matching space in your house model.' : `${selectedModelRoom?.name ?? 'Room'} · Match this device to its model position.`}</Text>
        </View>
        {step === 'room' ? <ConnectionChoices label="model rooms" choices={roomChoices} selected={modelRoomId} onSelect={chooseRoom} />
          : currentDevice ? <>
            <ConnectionChoices key={currentDevice.id} label="model devices" choices={deviceChoices} selected={bindings[currentDevice.id] ?? ''}
              onSelect={(next) => { if (!saving) { setBindings((previous) => ({ ...previous, [currentDevice.id]: next })); setError(null); } }} />
            <DeepPager label="room devices" page={Math.min(devicePage, devices.length - 1)} pageCount={devices.length} onChange={setDevicePage} />
          </> : <Text style={styles.detail}>Add devices to this room before connecting their model positions.</Text>}
        {error && <Text accessibilityRole="alert" numberOfLines={3} style={styles.error}>{error}</Text>}
        <View style={styles.footer}>
          {step === 'devices' && <DeepAction label="Choose room" disabled={saving} onPress={() => setStep('room')} />}
          {step === 'room' && Boolean(modelRoomId) && devices.length > 0
            ? <DeepAction label="Match devices" primary disabled={saving} onPress={() => { setDevicePage(0); setStep('devices'); }} />
            : <DeepAction label={saving ? 'Saving…' : 'Save connection'} primary disabled={saving} onPress={() => { void saveConnections(); }} />}
        </View>
        <Text style={styles.note}>Room access follows these connections. Your 3D device controls remain a simulation.</Text>
      </View>
    </DeepScreen>
  </Modal>;
}

const styles = StyleSheet.create({
  body: { flex: 1, minHeight: 0, width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 },
  heading: { gap: 6 },
  title: { color: theme.colors.text, fontSize: 22, lineHeight: 28, fontWeight: '500' },
  detail: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  choices: { flex: 1, minHeight: 0, gap: 8 },
  choiceList: { flex: 1, minHeight: 0, gap: 8 },
  choice: { minHeight: 60, padding: 12, gap: 4, borderWidth: 1, borderColor: theme.colors.stroke, borderRadius: 18, backgroundColor: theme.colors.card2 },
  selectedChoice: { borderColor: theme.colors.accent, backgroundColor: theme.colors.card },
  choiceName: { color: theme.colors.text, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  footer: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  error: { color: theme.colors.ember, fontSize: 13, lineHeight: 18 },
  note: { color: theme.colors.muted, fontSize: 11, lineHeight: 16 },
});
