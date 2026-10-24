import { getFireIncident } from '../../../packages/home-scene/src/fireSafetySimulation';
import React, { Suspense, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDevice, getRoom, type DeviceDefinition } from '../../../packages/home-scene/src/data';
import { deviceActionFeedback, deviceStatus, quickActionLabel, readDeviceSetting } from '../../../packages/home-scene/src/deviceCapabilities';
import { configurationPageNote } from '../../../packages/home-scene/src/deviceCapabilitySupport';
import { getInspectorPages } from '../../../packages/home-scene/src/deviceRoutinePages';
import { hotspotPresentation } from '../../../packages/home-scene/src/hotspotPresentation';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import type { ControlSnapshot } from './simulationControlClient';
import { simulationLoadFailureMessage } from './simulationPersistence';
import { NativeCapabilityControl, type EnumCapability } from './NativeCapabilityControl';
import { ControlPagination } from './ControlPagination';
import CinematicSurface from '../../components/CinematicSurface';
import DeviceBrowser from './DeviceBrowser';
import { controlStyles as styles } from './deviceControlsStyles';
import { useDeviceRoutines } from './useDeviceRoutines';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { controlPageAnchor, getNativeControlCapacity, resolveControlPage, type NativeControlSpace } from './nativeControlPagination';
import CinematicCardArtwork from '../cinematic-artwork/CinematicCardArtwork';
import { deviceArtwork } from '../cinematic-artwork/artwork';
import RemovePlacedDevice from '../devices/RemovePlacedDevice';
import { useHomeStore } from '../../store/useHomeStore';
import { canEditSimulationDevice } from '../../services/simulationDeviceEditing';
import { canManageSimulationDevices } from '../../services/simulationDeviceRegistration';
import { homeEditorScope } from '../home-shell/homeEditorScope';
import { TvRemoteControl } from './TvRemoteControl';
import { ClimateController } from './ClimateController';
import { BlindsController } from './BlindsController';
import { LightingController } from './LightingController';
import { EnergyController } from './EnergyController';
import { GateController } from './GateController';
import { WaterController } from './WaterController';
import { VacuumController } from './VacuumController';
import { SpeakerController } from './SpeakerController';
import { FanController } from './FanController';
import { LaundryController } from './LaundryController';
import { DishwasherController } from './DishwasherController';
import { OpeningController } from './OpeningController';
import { CameraController } from './CameraController';
import { isOpeningDeviceKind } from '../../../packages/home-scene/src/openingController';
import { GATE_DEVICE_ID } from '../../../packages/home-scene/src/gateSafetySimulation';
import { isEnergyDeviceKind } from '../../../packages/home-scene/src/energyController';
import { isWaterDeviceKind } from '../../../packages/home-scene/src/waterController';
import { canViewSceneDevice } from '../../../packages/home-scene/src/sceneAccess';

const SimulationDeviceEditor = React.lazy(() => import('../devices/SimulationDeviceEditor'));

const GROUPS = ['controls', 'modes', 'schedule', 'status'] as const;
const GROUP_LABELS = { controls: 'Controls', modes: 'Modes', schedule: 'Routines', status: 'Status' };
const CONTROLLER_RETURN_LABELS: Partial<Record<DeviceDefinition['kind'], { accessible: string; visible: string }>> = {
  tv: { accessible: 'Back to TV remote', visible: 'Back to remote' },
  ac: { accessible: 'Back to climate controller', visible: 'Back to climate' },
  blinds: { accessible: 'Back to blinds controller', visible: 'Back to blinds' },
  light: { accessible: 'Back to lighting controller', visible: 'Back to lighting' },
  energy: { accessible: 'Back to energy controller', visible: 'Back to energy' },
  solar: { accessible: 'Back to energy controller', visible: 'Back to energy' },
  battery: { accessible: 'Back to energy controller', visible: 'Back to energy' },
  generator: { accessible: 'Back to energy controller', visible: 'Back to energy' },
  gate: { accessible: 'Back to gate controller', visible: 'Back to gate' },
  water: { accessible: 'Back to water controller', visible: 'Back to water' },
  'water-heater': { accessible: 'Back to water controller', visible: 'Back to water' },
  vacuum: { accessible: 'Back to vacuum controller', visible: 'Back to vacuum' },
  speaker: { accessible: 'Back to speaker controller', visible: 'Back to speaker' },
  fan: { accessible: 'Back to fan controller', visible: 'Back to fan' },
  washer: { accessible: 'Back to laundry controller', visible: 'Back to laundry' },
  dryer: { accessible: 'Back to laundry controller', visible: 'Back to laundry' },
  dishwasher: { accessible: 'Back to dishwasher controller', visible: 'Back to dishwasher' },
  door: { accessible: 'Back to opening controller', visible: 'Back to entry' },
  garage: { accessible: 'Back to opening controller', visible: 'Back to garage' },
  window: { accessible: 'Back to opening controller', visible: 'Back to window' },
  camera: { accessible: 'Back to camera controller', visible: 'Back to camera' },
};
type Group = typeof GROUPS[number];
interface SheetProps {
  deviceId: string | null; client: SimulationDeviceControls; snapshot: ControlSnapshot;
  allowedDeviceIds?: readonly string[];
  motionAllowed: boolean; onClose: () => void; onSelect: (id: string) => void;
  onRetry?: () => void;
  onWatchCamera?: (modelDeviceId: string) => void;
}

/** Present a full native inspector or paged room browser above either renderer. */
export function DeviceControlsSheet({ deviceId, client, snapshot, motionAllowed, onClose, onSelect, allowedDeviceIds, onRetry, onWatchCamera }: SheetProps) {
  const openDeviceRoutines = useDeviceRoutines(onClose);
  const { width, height, fontScale } = useWindowDimensions();
  const landscape = width >= 760 && width > height;
  const compact = width < 390 || height < 700 || fontScale > 1.15;
  const [browsing, setBrowsing] = useState(deviceId === null);
  const [editing, setEditing] = useState<{ deviceId: string; scope: string } | null>(null);
  const editorScope = useHomeStore(homeEditorScope);
  const editableDevice = useHomeStore((state) => state.devices.find((item) => item.modelDeviceId === deviceId && canEditSimulationDevice(state, item.id)));
  const editAllowed = useHomeStore((state) => Boolean(editing && canManageSimulationDevices(state) && homeEditorScope(state) === editing.scope));
  useEffect(() => { if (editing && !editAllowed) setEditing(null); }, [editing, editAllowed]);
  /** A deferred tap cannot open an old device inside a newly selected account or household. */
  function openEditor(): void {
    const state = useHomeStore.getState();
    if (device && editableDevice && homeEditorScope(state) === editorScope && canEditSimulationDevice(state, editableDevice.id)) {
      setEditing({ deviceId: editableDevice.id, scope: editorScope });
    }
  }
  const incident = getFireIncident(snapshot.state.deviceStates);
  const emergencyVisible = incident.active && !incident.acknowledged;
  // Release the native modal so the global incident and its persistent banner stay reachable.
  useEffect(() => { if (emergencyVisible) onClose(); }, [emergencyVisible, onClose]);
  // Apply the same current view grants to selection and the fallback browser, even if library props are stale.
  const access = snapshot.access;
  const visibleDeviceIds = access
    ? access.deviceIds.filter((id) => (!allowedDeviceIds || allowedDeviceIds.includes(id)) && canViewSceneDevice(access, id))
    : allowedDeviceIds;
  const deviceVisible = deviceId !== null && (!visibleDeviceIds || visibleDeviceIds.includes(deviceId));
  const device = deviceVisible ? getDevice(deviceId) : undefined;
  const showingBrowser = browsing || !device;
  const loadFailure = simulationLoadFailureMessage(snapshot.status);
  const status = loadFailure ?? (snapshot.status === 'disconnected' ? 'Session changed. Close and reopen controls.'
    : snapshot.status === 'error' ? 'Could not save locally. Your changes are still in this session.'
      : !snapshot.ready ? 'Loading saved controls…' : snapshot.status === 'saving' ? 'Saving simulation…' : 'Simulation · Saved on this device');
  if (emergencyVisible) return null;
  if (editing && editAllowed) return <Suspense fallback={<View style={styles.overlay}><Text style={styles.detail}>Preparing device editor…</Text></View>}>
    <SimulationDeviceEditor key={editing.deviceId} deviceId={editing.deviceId} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />
  </Suspense>;
  return <Modal transparent visible animationType={motionAllowed ? 'fade' : 'none'} onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.overlay, landscape && styles.overlayLandscape]}>
      <SafeAreaView style={[styles.safeArea, landscape && styles.safeAreaLandscape]}>
        <CinematicSurface style={[styles.card, compact && styles.compact]}>
          <View accessibilityViewIsModal style={[styles.cardContent, compact && styles.compactContent]}>
          <View style={styles.row}>
            {!showingBrowser && device && width >= 390 && fontScale <= 1.15 && <CinematicCardArtwork artwork={deviceArtwork(device)} variant="thumbnail" />}
            <View style={styles.grow}><Text numberOfLines={1} style={styles.eyebrow}>{showingBrowser ? 'YOUR HOME' : getRoom(device.roomId).name.toUpperCase()}</Text>
              <Text accessibilityRole="header" accessibilityLabel={showingBrowser ? 'Device library' : device.name} numberOfLines={compact ? 1 : 2} style={[styles.title, compact && styles.compactTitle]}>{showingBrowser ? 'Device library' : device.name}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close device controls" onPress={onClose} style={styles.button}><Text style={styles.label}>Done</Text></Pressable>
          </View>
          {!snapshot.ready ? <View style={styles.content}><Text style={styles.detail}>{loadFailure ? 'Controls will stay paused until your saved settings can be restored.' : 'Preparing your saved controls…'}</Text></View>
            : showingBrowser ? <DeviceBrowser snapshot={snapshot} client={client} allowedDeviceIds={visibleDeviceIds} onSelect={(id) => { onSelect(id); setBrowsing(false); }} />
            : <DeviceInspector key={device.id} device={device} state={snapshot.state.deviceStates[device.id]}
              client={client} disabled={!snapshot.ready || (snapshot.access !== undefined && !snapshot.access.controllableDeviceIds.includes(device.id))} compact={compact} fontScale={fontScale}
              onWatchCamera={onWatchCamera} motionAllowed={motionAllowed && !snapshot.state.motionDisabled} onBrowse={() => setBrowsing(true)} onRoutines={() => openDeviceRoutines(device.id)} />}
          <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>
          {!showingBrowser && editableDevice && snapshot.ready && <Pressable accessibilityRole="button" accessibilityLabel="Edit device"
            onPress={openEditor} style={styles.button}><Text style={styles.label}>Edit device</Text></Pressable>}
          {!showingBrowser && device?.templateDeviceId && <RemovePlacedDevice key={`remove:${device.id}`} modelDeviceId={device.id} onRemoved={onClose} />}
          {(loadFailure || snapshot.status === 'disconnected') && onRetry && <Pressable accessibilityRole="button" accessibilityLabel="Retry loading saved controls" onPress={onRetry} style={styles.button}><Text style={styles.label}>Retry loading</Text></Pressable>}
          </View>
        </CinematicSurface>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

/** Give supported devices tactile primary controls while preserving every advanced capability. */
function DeviceInspector({ device, state, client, disabled, compact, fontScale, motionAllowed, onBrowse, onRoutines, onWatchCamera }: {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls; disabled: boolean; compact: boolean; fontScale: number; motionAllowed: boolean; onBrowse: () => void; onRoutines: () => void; onWatchCamera?: (modelDeviceId: string) => void;
}) {
  const [advancedControls, setAdvancedControls] = useState(false);
  const [group, setGroup] = useState<Group>('controls');
  const [pageAnchor, setPageAnchor] = useState<string | null>(null);
  const [option, setOption] = useState<EnumCapability | null>(null);
  const [optionAnchor, setOptionAnchor] = useState(0);
  const [space, setSpace] = useState<NativeControlSpace>({ width: 0, height: 0 });
  const [optionSpace, setOptionSpace] = useState<NativeControlSpace>({ width: 0, height: 0 });
  const capacity = getNativeControlCapacity(space, fontScale, compact);
  const optionSize = getNativeControlCapacity(optionSpace, fontScale, compact).options;
  const allPages = getInspectorPages(device, capacity.fields, capacity.actions);
  const pages = allPages.filter((item) => item.group === group);
  const selectedPage = resolveControlPage(pages, pageAnchor);
  const current = pages[selectedPage];
  const optionCount = Math.ceil((option?.options.length ?? 0) / optionSize);
  const visibleOptionPage = Math.min(Math.floor(optionAnchor / optionSize), Math.max(0, optionCount - 1));
  const options = option?.options.slice(visibleOptionPage * optionSize, (visibleOptionPage + 1) * optionSize);
  const { tone } = hotspotPresentation(device, state);
  const controllerReturn = device.kind === 'gate' && device.id !== GATE_DEVICE_ID ? undefined : CONTROLLER_RETURN_LABELS[device.kind];

  /** Measure the space left by real header, feedback, footer and Dynamic Type sizes. */
  function measureSpace(event: LayoutChangeEvent, choices = false): void {
    const { width, height } = event.nativeEvent.layout;
    const update = choices ? setOptionSpace : setSpace;
    update((previous) => previous.width === width && previous.height === height ? previous : { width, height });
  }

  /** Preserve a capability's identity rather than an index when the viewport later changes. */
  function changePage(index: number): void {
    setPageAnchor(controlPageAnchor(pages[index]));
  }

  if (device.kind === 'tv' && !advancedControls) return <TvRemoteControl device={device} state={state} client={client}
    disabled={disabled} compact={compact} onMore={() => setAdvancedControls(true)} />;
  if (device.kind === 'ac' && !advancedControls) return <ClimateController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} onMore={() => setAdvancedControls(true)} />;
  if (device.kind === 'blinds' && !advancedControls) return <BlindsController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} onMore={() => setAdvancedControls(true)} />;
  if (device.kind === 'light' && !advancedControls) return <LightingController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} onMore={() => setAdvancedControls(true)} />;
  if (isEnergyDeviceKind(device.kind) && !advancedControls) return <EnergyController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} onMore={() => setAdvancedControls(true)} />;
  if (device.kind === 'gate' && device.id === GATE_DEVICE_ID && !advancedControls) return <GateController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} onMore={() => setAdvancedControls(true)} />;
  if (isWaterDeviceKind(device.kind) && !advancedControls) return <WaterController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} onMore={() => setAdvancedControls(true)} />;
  if (device.kind === 'vacuum' && !advancedControls) return <VacuumController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} onMore={() => setAdvancedControls(true)} />;
  if (device.kind === 'speaker' && !advancedControls) return <SpeakerController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} onMore={() => setAdvancedControls(true)} />;
  if (device.kind === 'camera' && !advancedControls) return <CameraController device={device} state={state} client={client}
    onWatch={onWatchCamera ? () => onWatchCamera(device.id) : undefined} disabled={disabled} compact={compact} fontScale={fontScale} onMore={() => setAdvancedControls(true)} />;
  if (isOpeningDeviceKind(device.kind) && !advancedControls) return <OpeningController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} motionAllowed={motionAllowed} onMore={() => setAdvancedControls(true)} />;
  if (device.kind === 'dishwasher' && !advancedControls) return <DishwasherController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} motionAllowed={motionAllowed} onMore={() => setAdvancedControls(true)} />;
  if ((device.kind === 'washer' || device.kind === 'dryer') && !advancedControls) return <LaundryController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} motionAllowed={motionAllowed} onMore={() => setAdvancedControls(true)} />;
  if (device.kind === 'fan' && !advancedControls) return <FanController device={device} state={state} client={client}
    disabled={disabled} compact={compact} fontScale={fontScale} motionAllowed={motionAllowed} onMore={() => setAdvancedControls(true)} />;

  return <>
    {controllerReturn && <Pressable accessibilityRole="button" accessibilityLabel={controllerReturn.accessible}
      onPress={() => { setAdvancedControls(false); setOption(null); }} style={styles.button}>
      <Text style={styles.label}>{controllerReturn.visible}</Text></Pressable>}
    {!option && <View style={styles.row}>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => client.toggle(device.id)}
        style={[styles.button, styles.primary, styles.grow, disabled && styles.disabled]}><Text style={[styles.label, styles.primaryText]}>{quickActionLabel(device, state)}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Browse all devices" onPress={onBrowse} style={styles.button}><Text style={styles.label}>Devices</Text></Pressable>
    </View>}
    {option ? <>
      <View style={styles.row}><Text style={[styles.label, styles.grow]}>{option.label}</Text>
        <Pressable accessibilityRole="button" onPress={() => setOption(null)} style={styles.button}><Text style={styles.label}>Back</Text></Pressable></View>
      {option.configurationOnly && <Text style={styles.detail}>{configurationPageNote(device.kind, [option])}</Text>}
      <View testID="device-option-page" style={styles.content} onLayout={(event) => measureSpace(event, true)}>{options?.map((choice) => <Pressable key={String(choice.value)} accessibilityRole="radio"
        accessibilityState={{ checked: readDeviceSetting(device, state, option.field) === choice.value, disabled }} disabled={disabled}
        aria-checked={readDeviceSetting(device, state, option.field) === choice.value}
        onPress={() => { client.setSetting(device.id, option.field, choice.value); setOption(null); }}
        style={[styles.item, readDeviceSetting(device, state, option.field) === choice.value && styles.selection]}>
        <Text style={styles.label}>{choice.label}{readDeviceSetting(device, state, option.field) === choice.value ? ' ✓' : ''}</Text>
      </Pressable>)}</View>
      <ControlPagination page={visibleOptionPage} count={optionCount} onChange={(index) => setOptionAnchor(index * optionSize)} />
    </> : <>
      <View accessibilityRole="tablist" style={styles.tabs}>{GROUPS.map((item) => {
        const available = allPages.some((candidate) => candidate.group === item);
        return <Pressable key={item} accessibilityRole="tab" accessibilityLabel={GROUP_LABELS[item]}
          accessibilityState={{ selected: group === item, disabled: !available }} disabled={!available}
          aria-selected={group === item} aria-disabled={!available}
          onPress={() => { setGroup(item); setPageAnchor(null); }} style={[styles.tab, group === item && styles.selected, !available && styles.disabled]}>
          <Text style={[styles.tabText, group === item && styles.selectedTabText]}>{GROUP_LABELS[item]}</Text>
        </Pressable>;
      })}</View>
      <Text accessibilityLiveRegion="polite" style={[styles.detail, tone === 'alarm' && styles.alarm, (tone === 'warning' || tone === 'closed') && styles.warning]}>{current?.note ?? (group === 'schedule' ? current?.id === 'shared-routines' ? 'Preview routines require a linked device.' : 'Device timer preferences · Simulation only'
        : group === 'status' ? `${deviceStatus(device, state)} · Simulated readings`
          : deviceActionFeedback(device, state) ?? deviceStatus(device, state))}</Text>
      <View testID="device-control-page" style={[styles.content, current?.compact && !capacity.singleColumn && styles.grid]} onLayout={measureSpace}>
        {current?.id === 'shared-routines' && <>
          {space.height >= 220 * Math.max(1, fontScale) && <><Text style={styles.label}>One place for every routine</Text>
            <Text style={styles.detail}>Open schedules and automatic actions for this device in your home catalog.</Text></>}
          <Pressable accessibilityRole="button" accessibilityLabel="View device routines" disabled={disabled} onPress={onRoutines} style={[styles.button, styles.primary, disabled && styles.disabled]}><Text style={[styles.label, styles.primaryText]}>View device routines</Text></Pressable>
          <Text style={styles.detail}>Runs with app open · Hub not connected.</Text>
        </>}
        {current?.capabilities.map((capability) => <NativeCapabilityControl key={capability.id} capability={capability} device={device}
          state={state} client={client} disabled={disabled} compact={compact} singleColumn={capacity.singleColumn} onOptions={(next) => { setPageAnchor(next.id); setOption(next); setOptionAnchor(0); }} />)}
        {!current && <Text style={styles.detail}>Use the quick action above for this device.</Text>}
      </View>
      <ControlPagination page={selectedPage} count={pages.length} onChange={changePage} />
    </>}
  </>;
}
