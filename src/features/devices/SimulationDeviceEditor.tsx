import React, { useState } from 'react';
import { Keyboard, Modal, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useShallow } from 'zustand/react/shallow';
import { ROOMS } from '../../../packages/home-scene/src/data';
import { canPlaceDeviceInRoom, getSimulationDeviceTemplate } from '../../../packages/home-scene/src/devicePlacement';
import { DeepAction, DeepScreen } from '../../components/deep/DeepScreen';
import DeviceIcon from '../../components/DeviceIcon';
import Pressable from '../../components/Pressable';
import { useHomeStore } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import CinematicCardArtwork from '../cinematic-artwork/CinematicCardArtwork';
import { deviceArtwork, roomArtwork } from '../cinematic-artwork/artwork';
import DevicePlacementPreview from './DevicePlacementPreview';
import DeviceWizardChoices, { type DeviceWizardChoice } from './DeviceWizardChoices';
import { useSimulationDeviceEditDraft } from './useSimulationDeviceEditDraft';

type Props = { deviceId: string; onClose: () => void; onSaved: (deviceId: string) => void; savedActionLabel?: string };
type Step = 'details' | 'placement' | 'review';
const STEPS: readonly Step[] = ['details', 'placement', 'review'];
const LABELS: Record<Step, string> = { details: 'Details', placement: 'Place', review: 'Review' };
const TITLES: Record<Step, string> = { details: 'Make it feel at home.', placement: 'Find its perfect position.', review: 'A new place. The same device.' };
const DETAILS: Record<Step, string> = {
  details: 'Refine its name or choose another compatible room.',
  placement: 'Tap to place. Orbit, rotate, and adjust its mounting height.',
  review: 'Your device identity and saved controls stay with it.',
};

/** Edit one saved fixture through a local preview, deliberate review, and durable same-device save. */
export default function SimulationDeviceEditor({ deviceId, onClose, onSaved, savedActionLabel = 'Open full controls' }: Props) {
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 740 || fontScale > 1.25;
  const edit = useSimulationDeviceEditDraft(deviceId);
  const [step, setStep] = useState<Step>('details');
  const draft = edit.draft;
  const templateId = draft?.placement.templateId ?? '';
  const template = getSimulationDeviceTemplate(templateId);
  const rooms = useHomeStore(useShallow((state) => state.rooms.filter((room) =>
    Boolean(room.modelRoomId && canPlaceDeviceInRoom(templateId, room.modelRoomId)))));
  const room = rooms.find((candidate) => candidate.id === draft?.roomId);
  const oldRoom = useHomeStore((state) => state.rooms.find((candidate) => candidate.id === edit.baseline?.roomId));
  const roomChanged = Boolean(draft && edit.baseline && draft.roomId !== edit.baseline.roomId);
  const activeStep = edit.submitted ? 'review' : step;
  const currentStep = STEPS.indexOf(activeStep);
  const unavailable = edit.status === 'removed' || (!edit.device && !edit.submitted && edit.status === 'editing');
  const roomChoices: DeviceWizardChoice[] = rooms.map((candidate) => {
    const model = ROOMS.find((item) => item.id === candidate.modelRoomId)!;
    return { id: candidate.id, name: candidate.name, detail: model.outdoor ? 'Property grounds' : model.floor === 'upper' ? 'Upper floor' : 'Ground floor', artwork: roomArtwork(candidate) };
  });

  /** Leave draft edits untouched; while saving, wait for a result before dismissing the workspace. */
  function goBack(): void {
    if (edit.busy) return;
    Keyboard.dismiss();
    if (edit.status === 'editing' && currentStep > 0 && !edit.submitted) setStep(STEPS[currentStep - 1]!);
    else onClose();
  }

  /** Only a known revision conflict can replace the draft with the latest saved version. */
  function reloadLatest(): void {
    setStep('details');
    void edit.reloadLatest();
  }

  if (!edit.visible) return null;
  return <Modal visible animationType="none" onRequestClose={goBack}>
    <DeepScreen title={edit.status === 'saved' ? 'Changes saved' : 'Edit device'} eyebrow="REFINE YOUR HOME" onBack={goBack}>
      <View style={[styles.body, compact && styles.compactBody]} testID="simulation-device-editor">
        <View style={styles.modeBadge}>
          <Ionicons name="cube-outline" size={14} color={theme.colors.accentText} />
          <Text style={styles.modeLabel}>SIMULATION</Text>
          <Text numberOfLines={1} style={styles.modeDetail}>Your settings stay with it</Text>
        </View>
        {edit.status === 'restoring' || edit.status === 'restore-error' ? <View style={[styles.centered, compact && styles.compactCentered]}>
          <Ionicons name={edit.status === 'restore-error' ? 'cloud-offline-outline' : 'cube-outline'} size={34} color={theme.colors.accentText} />
          <Text accessibilityRole="header" style={[styles.centerTitle, compact && styles.compactTitle]}>{edit.status === 'restore-error' ? 'Let’s recover your changes.' : 'Preparing your workspace…'}</Text>
          <Text style={[styles.centerDetail, compact && styles.compactCenterDetail]}>{edit.status === 'restore-error' ? 'An unfinished save could not be checked. Resume it before starting another edit.' : 'Checking for an unfinished edit.'}</Text>
          {edit.status === 'restore-error' && <DeepAction label="Resume edit" primary onPress={edit.retryRestore} />}
          <DeepAction label="Close" onPress={onClose} />
        </View> : unavailable ? <View style={[styles.centered, compact && styles.compactCentered]}>
          <Ionicons name="cube-outline" size={34} color={theme.colors.accentText} />
          <Text accessibilityRole="header" style={[styles.centerTitle, compact && styles.compactTitle]}>This device was removed.</Text>
          <Text style={[styles.centerDetail, compact && styles.compactCenterDetail]}>Its previous placement cannot be restored by editing. Return to Devices to choose another device.</Text>
          <DeepAction label="Back to devices" primary onPress={onClose} />
        </View> : edit.status === 'conflict' || edit.status === 'reloading' ? <View style={[styles.centered, compact && styles.compactCentered]}>
          <Ionicons name="git-compare-outline" size={34} color={theme.colors.accentText} />
          <Text accessibilityRole="header" style={[styles.centerTitle, compact && styles.compactTitle]}>A newer version is saved.</Text>
          <Text style={[styles.centerDetail, compact && styles.compactCenterDetail]}>This device changed while you were editing. Load its latest name and position before making further changes.</Text>
          {edit.error && <Text accessibilityRole="alert" style={styles.error}>{edit.error}</Text>}
          <DeepAction label={edit.status === 'reloading' ? 'Loading latest…' : 'Load latest device'} icon="refresh-outline" primary disabled={edit.busy} onPress={reloadLatest} />
          <DeepAction label="Close" disabled={edit.busy} onPress={onClose} />
        </View> : edit.status === 'saved' ? <View style={[styles.centered, compact && styles.compactCentered]}>
          <View style={[styles.successIcon, compact && styles.compactSuccessIcon]}><Ionicons name="checkmark" size={36} color={theme.colors.accentText} /></View>
          <Text accessibilityRole="header" style={[styles.centerTitle, compact && styles.compactTitle]}>Right where you want it.</Text>
          <Text style={[styles.centerDetail, compact && styles.compactCenterDetail]}>{draft?.name.trim()} is saved in {room?.name ?? 'its selected room'}. Your device and its settings are preserved.</Text>
          {roomChanged && <Text style={styles.centerNote}>Access now follows {room?.name ?? 'the destination room'} permissions.</Text>}
          <DeepAction label={savedActionLabel} primary icon="options-outline" onPress={() => onSaved(deviceId)} />
          <DeepAction label="Done" onPress={onClose} />
        </View> : draft && template ? <>
          <View style={styles.progress} accessibilityLabel={`Step ${currentStep + 1} of 3: ${LABELS[activeStep]}`}>
            {STEPS.map((item, index) => <View key={item} style={[styles.progressItem, index === currentStep && styles.progressCurrent]}>
              <Text style={[styles.progressNumber, index <= currentStep && styles.progressActive]}>{index < currentStep ? '✓' : String(index + 1).padStart(2, '0')}</Text>
              <Text style={[styles.progressLabel, index === currentStep && styles.progressLabelActive]}>{LABELS[item]}</Text>
            </View>)}
          </View>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>{TITLES[activeStep]}</Text>
            {!compact && <Text style={styles.detail}>{DETAILS[activeStep]}</Text>}
          </View>
          <View style={styles.stage}>
            {activeStep === 'details' && <>
              <View style={styles.nameField}>
                <Text style={styles.label}>DEVICE NAME</Text>
                <TextInput accessibilityLabel="Device name" style={styles.input} value={draft.name} maxLength={80} autoCorrect={false}
                  returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} placeholder="Give it a name" placeholderTextColor={theme.colors.muted}
                  onChangeText={(name) => edit.changeDraft({ name })} />
              </View>
              <Text style={styles.label}>ROOM · {template.name.toUpperCase()}</Text>
              <DeviceWizardChoices choices={roomChoices} selectedId={draft.roomId} label="rooms" onSelect={edit.chooseRoom} />
            </>}
            {activeStep === 'placement' && <DevicePlacementPreview placement={draft.placement} excludeModelDeviceId={`placed-${deviceId}`}
              onChange={(placement) => edit.changeDraft({ placement })} disabled={edit.busy} />}
            {activeStep === 'review' && <View style={[styles.review, compact && styles.compactReview]}>
              <View style={[styles.reviewHero, compact && styles.compactHero]}>
                <CinematicCardArtwork artwork={deviceArtwork({ kind: template.kind, name: draft.name })} variant="background" />
                <View style={styles.heroContent}><DeviceIcon kind={template.kind} size={compact ? 26 : 34} color={theme.colors.accentText} />
                  <Text numberOfLines={2} style={[styles.reviewName, compact && styles.compactReviewName]}>{draft.name.trim()}</Text>
                  <Text style={styles.heroDetail}>{template.name}</Text>
                </View>
              </View>
              <View style={styles.reviewRow}><Ionicons name="home-outline" size={18} color={theme.colors.accentText} /><Text style={styles.reviewLabel}>{roomChanged ? 'Move to' : 'Room'}</Text><Text numberOfLines={2} style={styles.reviewValue}>{room?.name ?? 'Previously selected room'}</Text></View>
              <View style={styles.reviewRow}><Ionicons name="save-outline" size={18} color={theme.colors.accentText} /><Text style={styles.reviewLabel}>Settings</Text><Text style={styles.reviewValue}>Preserved</Text></View>
              <View style={styles.accessNote}><Ionicons name="shield-checkmark-outline" size={17} color={theme.colors.accentText} />
                <Text style={styles.note}>{roomChanged ? `Moving from ${oldRoom?.name ?? 'the previous room'} changes access to the destination room’s permissions.` : 'The same device, with your existing room permissions.'}</Text>
              </View>
            </View>}
          </View>
          {edit.error && <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{edit.error}</Text><Text style={styles.note}>{edit.submitted ? 'Retry checks this same edit. It never creates another device.' : 'You can correct these changes before saving again.'}</Text></View>}
          <View style={styles.footer}>
            <Pressable accessibilityLabel={edit.submitted ? 'Close device editor' : currentStep ? 'Previous step' : 'Cancel device edit'} disabled={edit.busy}
              onPress={goBack} style={[styles.secondary, edit.busy && styles.disabled]}>
              <Text style={styles.secondaryText}>{edit.submitted ? 'Close' : currentStep ? 'Back' : 'Cancel'}</Text>
            </Pressable>
            <DeepAction label={edit.busy ? 'Saving changes…' : activeStep === 'review' ? edit.submitted ? 'Retry save' : 'Save changes' : 'Continue'} primary
              icon={activeStep === 'review' ? 'checkmark' : 'arrow-forward'} disabled={edit.busy || !edit.validName || (!edit.submitted && (!room || (activeStep === 'review' && !edit.changed)))}
              onPress={() => { Keyboard.dismiss(); if (activeStep === 'review') void edit.save(); else setStep(STEPS[currentStep + 1]!); }} />
          </View>
        </> : <View style={[styles.centered, compact && styles.compactCentered]}><Text style={[styles.centerTitle, compact && styles.compactTitle]}>This device cannot be edited.</Text><DeepAction label="Done" onPress={onClose} /></View>}
      </View>
    </DeepScreen>
  </Modal>;
}

const styles = StyleSheet.create({
  body: { flex: 1, minHeight: 0, width: '100%', maxWidth: 960, alignSelf: 'center', gap: 12 }, compactBody: { gap: 8 },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  modeLabel: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 1.8, fontWeight: '600' },
  modeDetail: { color: theme.colors.subtext, fontSize: 10, flex: 1, textAlign: 'right' },
  progress: { flexDirection: 'row', gap: 6 },
  progressItem: { flex: 1, minHeight: 38, paddingHorizontal: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  progressCurrent: { backgroundColor: theme.colors.surfaceRaised },
  progressNumber: { color: theme.colors.muted, fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'] }, progressActive: { color: theme.colors.accentText },
  progressLabel: { color: theme.colors.subtext, fontSize: 11 }, progressLabelActive: { color: theme.colors.text, fontWeight: '600' },
  heading: { gap: 6 }, title: { color: theme.colors.text, fontSize: 25, lineHeight: 32, fontWeight: '500', letterSpacing: -0.6 },
  compactTitle: { fontSize: 20, lineHeight: 26 }, detail: { color: theme.colors.subtext, fontSize: 13, lineHeight: 19 },
  stage: { flex: 1, minHeight: 0, gap: 10 }, nameField: { gap: 6 },
  label: { color: theme.colors.accentText, fontSize: 9, letterSpacing: 1.5, fontWeight: '600' },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.surface, color: theme.colors.text, fontSize: 16 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  secondary: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  secondaryText: { color: theme.colors.subtext, fontSize: 13, fontWeight: '500' }, disabled: { opacity: 0.35 },
  review: { flex: 1, minHeight: 0, gap: 10, justifyContent: 'center' }, compactReview: { gap: 7 },
  reviewHero: { minHeight: 128, flex: 1, maxHeight: 240, borderRadius: 24, overflow: 'hidden', justifyContent: 'center', backgroundColor: theme.colors.surface },
  compactHero: { minHeight: 92, maxHeight: 160 }, heroContent: { padding: 16, gap: 7, alignItems: 'center' },
  reviewName: { color: theme.colors.text, fontSize: 25, lineHeight: 30, fontWeight: '500', textAlign: 'center' },
  compactReviewName: { fontSize: 20, lineHeight: 25 }, heroDetail: { color: theme.colors.subtext, fontSize: 12 },
  reviewRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 14, backgroundColor: theme.colors.surface },
  reviewLabel: { color: theme.colors.subtext, fontSize: 12 }, reviewValue: { flex: 1, color: theme.colors.text, fontSize: 12, fontWeight: '500', textAlign: 'right' },
  accessNote: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }, note: { flex: 1, color: theme.colors.subtext, fontSize: 11, lineHeight: 17 },
  errorBox: { gap: 4, padding: 10, borderRadius: 16, backgroundColor: theme.colors.surface }, error: { color: theme.colors.warningText, fontSize: 12, lineHeight: 18 },
  centered: { flex: 1, minHeight: 0, gap: 16, alignItems: 'center', justifyContent: 'center', maxWidth: 460, alignSelf: 'center' },
  compactCentered: { gap: 10 }, compactCenterDetail: { fontSize: 13, lineHeight: 19 }, compactSuccessIcon: { width: 64, height: 64, borderRadius: 24 },
  centerTitle: { color: theme.colors.text, fontSize: 25, lineHeight: 32, fontWeight: '500', textAlign: 'center' },
  centerDetail: { color: theme.colors.subtext, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  centerNote: { color: theme.colors.subtext, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  successIcon: { width: 80, height: 80, borderRadius: 28, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' },
});
