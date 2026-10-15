import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { randomUUID } from 'expo-crypto';
import { useShallow } from 'zustand/react/shallow';
import { ROOMS } from '../../../packages/home-scene/src/data';
import {
  canPlaceDeviceInRoom,
  createDefaultDevicePlacement,
  SIMULATION_DEVICE_TEMPLATES,
  type SimulationDevicePlacement,
} from '../../../packages/home-scene/src/devicePlacement';
import { DeepAction, DeepScreen } from '../../components/deep/DeepScreen';
import Pressable from '../../components/Pressable';
import { canRegisterSimulationDevice, loadPendingSimulationDeviceRegistration, registerSimulationDevice } from '../../services/simulationDeviceRegistration';
import { useHomeStore } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import { roomArtwork, deviceArtwork } from '../cinematic-artwork/artwork';
import { homeEditorScope } from '../home-shell/homeEditorScope';
import DevicePlacementPreview from './DevicePlacementPreview';
import DeviceWizardChoices, { type DeviceWizardChoice } from './DeviceWizardChoices';

type Props = { initialRoomId?: string; onClose: () => void; onSaved: (deviceId: string) => void };
type Step = 'room' | 'device' | 'placement' | 'review';
const STEPS: readonly Step[] = ['room', 'device', 'placement', 'review'];
const STEP_LABELS: Record<Step, string> = { room: 'Room', device: 'Device', placement: 'Place', review: 'Review' };
const STEP_TITLES: Record<Step, string> = { room: 'Give it a home.', device: 'Choose what comes to life.', placement: 'Make it part of the room.', review: 'Ready for your home.' };
const STEP_DETAILS: Record<Step, string> = {
  room: 'Choose the space where your device belongs.',
  device: 'Each device includes its own model and working simulation controls.',
  placement: 'Preview its position. Adjust the fit before saving.',
  review: 'Your device, its placement, and its room access are saved together.',
};

/** Walk administrators through a real saved simulation device, keeping unconfirmed submissions retryable. */
export default function SimulationDeviceWizard({ initialRoomId, onClose, onSaved }: Props) {
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 740 || fontScale > 1.25;
  const allowed = useHomeStore(canRegisterSimulationDevice);
  const scope = useHomeStore(homeEditorScope);
  const [initialScope] = useState(scope);
  const rooms = useHomeStore(useShallow((state) => state.rooms.filter((room) =>
    Boolean(room.modelRoomId && SIMULATION_DEVICE_TEMPLATES.some((template) => canPlaceDeviceInRoom(template.id, room.modelRoomId!))))));
  const [roomId, setRoomId] = useState(() => rooms.find((room) => room.id === initialRoomId)?.id ?? rooms[0]?.id ?? '');
  const room = rooms.find((candidate) => candidate.id === roomId);
  const modelRoom = ROOMS.find((candidate) => candidate.id === room?.modelRoomId);
  const templates = SIMULATION_DEVICE_TEMPLATES.filter((template) => modelRoom && canPlaceDeviceInRoom(template.id, modelRoom.id));
  const [templateId, setTemplateId] = useState(() => templates[0]?.id ?? '');
  const template = SIMULATION_DEVICE_TEMPLATES.find((candidate) => candidate.id === templateId);
  const [name, setName] = useState(() => template?.name ?? '');
  const [customName, setCustomName] = useState(false);
  const [placement, setPlacement] = useState<SimulationDevicePlacement | null>(() =>
    template && modelRoom ? createDefaultDevicePlacement(template.id, modelRoom.id) : null);
  const [step, setStep] = useState<Step>('room');
  const [requestId, setRequestId] = useState(randomUUID);
  const [restoring, setRestoring] = useState(true);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const currentStep = STEPS.indexOf(step);
  const validName = name.trim().length > 0 && name.trim().length <= 80 && !/[\u0000-\u001f\u007f]/u.test(name);
  const roomChoices: DeviceWizardChoice[] = rooms.map((candidate) => {
    const model = ROOMS.find((item) => item.id === candidate.modelRoomId)!;
    return { id: candidate.id, name: candidate.name, detail: model.outdoor ? 'Property grounds' : model.floor === 'upper' ? 'Upper floor' : 'Ground floor', artwork: roomArtwork(candidate) };
  });
  const templateChoices: DeviceWizardChoice[] = templates.map((candidate) => ({
    id: candidate.id, name: candidate.name, detail: candidate.description, kind: candidate.kind,
    artwork: deviceArtwork({ kind: candidate.kind, name: candidate.name }),
  }));

  // Recover an uncertain save before allowing another draft, including after an app restart.
  useEffect(() => {
    let active = true;
    if (!allowed || scope !== initialScope) return;
    setRestoring(true);
    setRestoreFailed(false);
    void loadPendingSimulationDeviceRegistration().then((draft) => {
      if (!active || homeEditorScope(useHomeStore.getState()) !== initialScope) return;
      if (draft) {
        setRequestId(draft.requestId);
        setRoomId(draft.roomId);
        setName(draft.name);
        setCustomName(true);
        setTemplateId(draft.placement.templateId);
        setPlacement(draft.placement);
        setSubmitted(true);
        setStep('review');
      }
      setError(null);
    }).catch(() => {
      if (active) setRestoreFailed(true);
    }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [allowed, initialScope, scope, restoreAttempt]);

  /** Move a draft into another room and rebuild its supported mounting pose, never reuse an incompatible template. */
  function chooseRoom(nextRoomId: string): void {
    const nextRoom = rooms.find((candidate) => candidate.id === nextRoomId);
    const nextModel = ROOMS.find((candidate) => candidate.id === nextRoom?.modelRoomId);
    if (submitted || !nextModel) return;
    const nextTemplates = SIMULATION_DEVICE_TEMPLATES.filter((candidate) => canPlaceDeviceInRoom(candidate.id, nextModel.id));
    const nextTemplate = nextTemplates.find((candidate) => candidate.id === templateId) ?? nextTemplates[0];
    setRoomId(nextRoomId);
    setTemplateId(nextTemplate?.id ?? '');
    setPlacement(nextTemplate ? createDefaultDevicePlacement(nextTemplate.id, nextModel.id) : null);
    if (!customName) setName(nextTemplate?.name ?? '');
    setError(null);
  }

  /** Selecting a different model resets its dimensions and mounting pose while retaining a deliberate custom name. */
  function chooseTemplate(nextTemplateId: string): void {
    const next = templates.find((candidate) => candidate.id === nextTemplateId);
    if (submitted || !next || !modelRoom) return;
    setTemplateId(next.id);
    if (!customName) setName(next.name);
    setPlacement(createDefaultDevicePlacement(next.id, modelRoom.id));
    setError(null);
  }

  /** Keep one exact submitted payload and request ID so retries cannot create another device. */
  async function saveDevice(): Promise<void> {
    if (restoring || restoreFailed || pending.current || (!submitted && !room) || !placement || !validName || homeEditorScope(useHomeStore.getState()) !== initialScope) return;
    pending.current = true;
    setSaving(true);
    setSubmitted(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const result = await registerSimulationDevice({ requestId, roomId, name: name.trim(), placement });
      if (homeEditorScope(useHomeStore.getState()) === initialScope) setSavedId(result.deviceId);
    } catch (cause) {
      if (homeEditorScope(useHomeStore.getState()) === initialScope) {
        setError(cause instanceof Error ? cause.message : 'Your device could not be confirmed. Retry to check the same save safely.');
      }
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  /** Back dismisses the keyboard and preserves drafts; an in-flight save cannot be dismissed accidentally. */
  function goBack(): void {
    if (pending.current) return;
    Keyboard.dismiss();
    if (currentStep > 0 && !submitted) setStep(STEPS[currentStep - 1]!);
    else onClose();
  }

  if (!allowed || scope !== initialScope) return null;
  return <Modal visible animationType="none" onRequestClose={goBack}>
    <DeepScreen title={savedId ? 'Device added' : 'Add a device'} eyebrow="SHAPE YOUR HOME" onBack={goBack}>
      <View style={styles.body} testID="simulation-device-wizard">
        <View style={styles.modeBadge}>
          <Ionicons name="cube-outline" size={14} color={theme.colors.accentText} />
          <Text style={styles.modeLabel}>SIMULATION</Text>
          <Text numberOfLines={1} style={styles.modeDetail}>No real device connection</Text>
        </View>
        {restoring || restoreFailed ? <View style={styles.empty}>
          <Ionicons name={restoreFailed ? 'cloud-offline-outline' : 'cube-outline'} size={34} color={theme.colors.accentText} />
          <Text accessibilityRole="header" style={styles.title}>{restoreFailed ? 'Let’s recover your setup.' : 'Preparing your workspace…'}</Text>
          <Text style={styles.detail}>{restoreFailed ? 'We could not check for an unfinished save. Try again before adding another device.' : 'Checking for unfinished device setup.'}</Text>
          {restoreFailed && <DeepAction label="Resume setup" primary onPress={() => setRestoreAttempt((attempt) => attempt + 1)} />}
        </View> : savedId ? <View style={styles.success}>
          <View style={styles.successIcon}><Ionicons name="checkmark" size={36} color={theme.colors.accentText} /></View>
          <Text accessibilityRole="header" style={styles.successTitle}>A new part of your home.</Text>
          <Text style={styles.successDetail}>{name.trim()} is saved in {room?.name}. Its placement will return when you reopen your home.</Text>
          <View style={styles.successNote}><Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.accentText} /><Text style={styles.note}>Existing room permissions apply.</Text></View>
          <DeepAction label="Open full controls" primary icon="options-outline" onPress={() => onSaved(savedId)} />
          <DeepAction label="Done" onPress={onClose} />
        </View> : !rooms.length && !submitted ? <View style={styles.empty}>
          <Ionicons name="home-outline" size={34} color={theme.colors.accentText} />
          <Text style={styles.title}>Connect a room first.</Text>
          <Text style={styles.detail}>In House → Rooms, connect a room to the 3D model. Then return here to add its devices.</Text>
          <DeepAction label="Done" onPress={onClose} />
        </View> : <>
          <View style={styles.progress} accessibilityLabel={`Step ${currentStep + 1} of 4: ${STEP_LABELS[step]}`}>
            {STEPS.map((item, index) => <View key={item} style={[styles.progressItem, index === currentStep && styles.progressCurrent]}>
              <Text style={[styles.progressNumber, index <= currentStep && styles.progressNumberActive]}>{index < currentStep ? '✓' : String(index + 1).padStart(2, '0')}</Text>
              <Text style={[styles.progressLabel, index === currentStep && styles.progressLabelActive]}>{STEP_LABELS[item]}</Text>
            </View>)}
          </View>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>{STEP_TITLES[step]}</Text>
            {!compact && <Text style={styles.detail}>{STEP_DETAILS[step]}</Text>}
          </View>
          <View style={styles.stage}>
            {step === 'room' && <DeviceWizardChoices choices={roomChoices} selectedId={roomId} label="rooms" onSelect={chooseRoom} />}
            {step === 'device' && <>
              <DeviceWizardChoices key={roomId} choices={templateChoices} selectedId={templateId} label="device models" onSelect={chooseTemplate} />
              <View style={styles.nameField}>
                <Text style={styles.label}>DEVICE NAME</Text>
                <TextInput accessibilityLabel="Device name" style={styles.input} value={name} maxLength={80} autoCorrect={false}
                  returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} placeholder="Give it a name" placeholderTextColor={theme.colors.muted}
                  onChangeText={(next) => { setCustomName(true); setName(next); }} />
              </View>
            </>}
            {step === 'placement' && placement && <DevicePlacementPreview placement={placement} onChange={setPlacement} disabled={saving} />}
            {step === 'review' && <View style={styles.review}>
              <View style={styles.reviewHero}>
                <Ionicons name="cube-outline" size={32} color={theme.colors.accentText} />
                <Text numberOfLines={2} style={styles.reviewName}>{name.trim()}</Text>
                <Text style={styles.detail}>{template?.name}</Text>
              </View>
              <View style={styles.reviewRow}><Ionicons name="home-outline" size={19} color={theme.colors.accentText} /><Text style={styles.reviewLabel}>Room</Text><Text numberOfLines={2} style={styles.reviewValue}>{room?.name ?? 'Previously selected room'}</Text></View>
              <View style={styles.reviewRow}><Ionicons name="layers-outline" size={19} color={theme.colors.accentText} /><Text style={styles.reviewLabel}>Placement</Text><Text style={styles.reviewValue}>{placement?.mount === 'surface' ? 'On a surface' : `${placement?.mount ?? ''} mounted`}</Text></View>
              <View style={styles.reviewRow}><Ionicons name="shield-checkmark-outline" size={19} color={theme.colors.accentText} /><Text style={styles.reviewLabel}>Access</Text><Text style={styles.reviewValue}>Follows room permissions</Text></View>
              {!compact && <Text style={styles.note}>Starts with its safe simulation defaults. You can operate it from the model, device collection, or full controls.</Text>}
            </View>}
          </View>
          {error && <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Text style={styles.note}>Retry checks this same device; it does not create a second one.</Text></View>}
          <View style={styles.footer}>
            <Pressable accessibilityLabel={submitted ? 'Close device setup' : currentStep ? 'Previous step' : 'Cancel device setup'} disabled={saving}
              onPress={goBack} style={[styles.secondary, saving && styles.disabled]}>
              <Text style={styles.secondaryText}>{submitted ? 'Close' : currentStep ? 'Back' : 'Cancel'}</Text>
            </Pressable>
            <DeepAction label={saving ? 'Saving device…' : step === 'review' ? submitted ? 'Retry save' : 'Save device' : 'Continue'} primary
              icon={step === 'review' ? 'checkmark' : 'arrow-forward'}
              disabled={saving || !placement || (!submitted && (!room || !template)) || (step === 'device' && !validName)}
              onPress={() => {
                Keyboard.dismiss();
                if (step === 'review') void saveDevice();
                else setStep(STEPS[currentStep + 1]!);
              }} />
          </View>
        </>}
      </View>
    </DeepScreen>
  </Modal>;
}

const styles = StyleSheet.create({
  body: { flex: 1, minHeight: 0, width: '100%', maxWidth: 960, alignSelf: 'center', gap: 12 },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  modeLabel: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 1.8, fontWeight: '600' },
  modeDetail: { color: theme.colors.subtext, fontSize: 10, flex: 1, textAlign: 'right' },
  progress: { flexDirection: 'row', gap: 6 },
  progressItem: { flex: 1, minHeight: 40, paddingHorizontal: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  progressCurrent: { backgroundColor: theme.colors.surfaceRaised },
  progressNumber: { color: theme.colors.muted, fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] },
  progressNumberActive: { color: theme.colors.accentText },
  progressLabel: { color: theme.colors.subtext, fontSize: 11 },
  progressLabelActive: { color: theme.colors.text, fontWeight: '600' },
  heading: { gap: 6 },
  title: { color: theme.colors.text, fontSize: 25, lineHeight: 32, fontWeight: '500', letterSpacing: -0.6 },
  compactTitle: { fontSize: 20, lineHeight: 26 },
  detail: { color: theme.colors.subtext, fontSize: 13, lineHeight: 19 },
  stage: { flex: 1, minHeight: 0, gap: 12 },
  nameField: { gap: 6 },
  label: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 1.6, fontWeight: '600' },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.surface, color: theme.colors.text, fontSize: 16 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  secondary: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  secondaryText: { color: theme.colors.subtext, fontSize: 13, fontWeight: '500' },
  disabled: { opacity: 0.35 },
  review: { flex: 1, minHeight: 0, gap: 10, justifyContent: 'center' },
  reviewHero: { alignItems: 'center', paddingVertical: 14, gap: 8 },
  reviewName: { color: theme.colors.text, fontSize: 25, lineHeight: 30, fontWeight: '500', textAlign: 'center' },
  reviewRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 14, backgroundColor: theme.colors.surface },
  reviewLabel: { color: theme.colors.subtext, fontSize: 12 },
  reviewValue: { flex: 1, color: theme.colors.text, fontSize: 12, fontWeight: '500', textAlign: 'right', textTransform: 'capitalize' },
  note: { color: theme.colors.subtext, fontSize: 11, lineHeight: 17 },
  errorBox: { gap: 4, padding: 12, borderRadius: 16, backgroundColor: theme.colors.surface },
  error: { color: theme.colors.warningText, fontSize: 12, lineHeight: 18 },
  success: { flex: 1, minHeight: 0, gap: 18, alignItems: 'center', justifyContent: 'center', maxWidth: 460, alignSelf: 'center' },
  successIcon: { width: 88, height: 88, borderRadius: 32, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: theme.colors.text, fontSize: 27, lineHeight: 34, fontWeight: '500', textAlign: 'center' },
  successDetail: { color: theme.colors.subtext, fontSize: 15, lineHeight: 23, textAlign: 'center' },
  successNote: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, maxWidth: 440, alignSelf: 'center' },
});
