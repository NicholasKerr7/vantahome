import { getFireIncident } from '../../../packages/home-scene/src/fireSafetySimulation';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDevice, getRoom, type DeviceDefinition } from '../../../packages/home-scene/src/data';
import { deviceActionFeedback, deviceStatus, quickActionLabel, readDeviceSetting } from '../../../packages/home-scene/src/deviceCapabilities';
import { getInspectorPages } from '../../../packages/home-scene/src/deviceRoutinePages';
import { gasStatusTone } from '../../../packages/home-scene/src/gasSimulation';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import type { ControlSnapshot } from './simulationControlClient';
import { NativeCapabilityControl, type EnumCapability } from './NativeCapabilityControl';
import { ControlPagination } from './ControlPagination';
import CinematicSurface from '../../components/CinematicSurface';
import DeviceBrowser from './DeviceBrowser';
import { controlStyles as styles } from './deviceControlsStyles';
import { useDeviceRoutines } from './useDeviceRoutines';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { controlPageAnchor, getNativeControlCapacity, resolveControlPage, type NativeControlSpace } from './nativeControlPagination';

const GROUPS = ['controls', 'modes', 'schedule', 'status'] as const;
const GROUP_LABELS = { controls: 'Controls', modes: 'Modes', schedule: 'Routines', status: 'Status' };
type Group = typeof GROUPS[number];
interface SheetProps {
  deviceId: string | null; client: SimulationDeviceControls; snapshot: ControlSnapshot;
  allowedDeviceIds?: readonly string[];
  motionAllowed: boolean; onClose: () => void; onSelect: (id: string) => void;
}

/** Present a full native inspector or paged room browser above either renderer. */
export function DeviceControlsSheet({ deviceId, client, snapshot, motionAllowed, onClose, onSelect, allowedDeviceIds }: SheetProps) {
  const openDeviceRoutines = useDeviceRoutines(onClose);
  const { width, height, fontScale } = useWindowDimensions();
  const landscape = width >= 760 && width > height;
  const compact = height < 700 || fontScale > 1.15;
  const [browsing, setBrowsing] = useState(deviceId === null);
  const incident = getFireIncident(snapshot.state.deviceStates);
  const emergencyVisible = incident.active && !incident.acknowledged;
  // Release the native modal so the global incident and its persistent banner stay reachable.
  useEffect(() => { if (emergencyVisible) onClose(); }, [emergencyVisible, onClose]);
  const device = allowedDeviceIds && deviceId && !allowedDeviceIds.includes(deviceId) ? undefined : getDevice(deviceId);
  const status = snapshot.status === 'disconnected' ? 'Session changed. Close and reopen controls.'
    : snapshot.status === 'error' ? 'Could not save locally. Your changes are still in this session.'
      : !snapshot.ready ? 'Loading saved controls…' : snapshot.status === 'saving' ? 'Saving simulation…' : 'Simulation · Saved on this device';
  if (emergencyVisible) return null;
  return <Modal transparent visible animationType={motionAllowed ? 'fade' : 'none'} onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.overlay, landscape && styles.overlayLandscape]}>
      <SafeAreaView style={[styles.safeArea, landscape && styles.safeAreaLandscape]}>
        <CinematicSurface style={[styles.card, compact && styles.compact]}>
          <View accessibilityViewIsModal style={[styles.cardContent, compact && styles.compactContent]}>
          <View style={styles.row}>
            <View style={styles.grow}><Text numberOfLines={1} style={styles.eyebrow}>{browsing ? 'YOUR HOME' : getRoom(device?.roomId ?? '').name.toUpperCase()}</Text>
              <Text accessibilityRole="header" accessibilityLabel={browsing ? 'Device library' : device?.name} numberOfLines={compact ? 1 : 2} style={[styles.title, compact && styles.compactTitle]}>{browsing ? 'Device library' : device?.name}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close device controls" onPress={onClose} style={styles.button}><Text style={styles.label}>Done</Text></Pressable>
          </View>
          {browsing || !device ? <DeviceBrowser snapshot={snapshot} client={client} allowedDeviceIds={allowedDeviceIds} onSelect={(id) => { onSelect(id); setBrowsing(false); }} />
            : <DeviceInspector key={device.id} device={device} state={snapshot.state.deviceStates[device.id]}
              client={client} disabled={!snapshot.ready} compact={compact} fontScale={fontScale} onBrowse={() => setBrowsing(true)} onRoutines={() => openDeviceRoutines(device.id)} />}
          <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>
          </View>
        </CinematicSurface>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

/** Keep the original quick action visible while paging through the complete shared capability catalog. */
function DeviceInspector({ device, state, client, disabled, compact, fontScale, onBrowse, onRoutines }: {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls; disabled: boolean; compact: boolean; fontScale: number; onBrowse: () => void; onRoutines: () => void;
}) {
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
  const tone = gasStatusTone(device.kind, state);

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

  return <>
    {!option && <View style={styles.row}>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => client.toggle(device.id)}
        style={[styles.button, styles.primary, styles.grow, disabled && styles.disabled]}><Text style={[styles.label, styles.primaryText]}>{quickActionLabel(device, state)}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Browse all devices" onPress={onBrowse} style={styles.button}><Text style={styles.label}>Devices</Text></Pressable>
    </View>}
    {option ? <>
      <View style={styles.row}><Text style={[styles.label, styles.grow]}>{option.label}</Text>
        <Pressable accessibilityRole="button" onPress={() => setOption(null)} style={styles.button}><Text style={styles.label}>Back</Text></Pressable></View>
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
      <Text accessibilityLiveRegion="polite" style={[styles.detail, tone === 'alarm' && styles.alarm, (tone === 'warning' || tone === 'closed') && styles.warning]}>{group === 'schedule' ? current?.id === 'shared-routines' ? 'Preview routines require a linked device.' : 'Device timer preferences · Simulation only'
        : group === 'status' ? `${deviceStatus(device, state)} · Simulated readings`
          : deviceActionFeedback(device, state) ?? deviceStatus(device, state)}</Text>
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
