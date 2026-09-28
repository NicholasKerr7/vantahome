import React, { useState } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEVICES, ROOMS, getDevice, getRoom, type DeviceDefinition } from '../../../packages/home-scene/src/data';
import { deviceActionFeedback, deviceStatus, getControlPages, quickActionLabel, readDeviceSetting } from '../../../packages/home-scene/src/deviceCapabilities';
import { gasStatusTone } from '../../../packages/home-scene/src/gasSimulation';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import type { ControlSnapshot, SimulationControlClient } from './simulationControlClient';
import { NativeCapabilityControl, type EnumCapability } from './NativeCapabilityControl';
import { ControlPagination } from './ControlPagination';
import { controlStyles as styles } from './deviceControlsStyles';

const GROUPS = ['controls', 'modes', 'schedule', 'status'] as const;
const GROUP_LABELS = { controls: 'Controls', modes: 'Modes', schedule: 'Schedule', status: 'Status' };
type Group = typeof GROUPS[number];
interface SheetProps {
  deviceId: string | null; client: SimulationControlClient; snapshot: ControlSnapshot;
  motionAllowed: boolean; onClose: () => void; onSelect: (id: string) => void;
}

/** Present a full native inspector or paged room browser above either renderer. */
export function DeviceControlsSheet({ deviceId, client, snapshot, motionAllowed, onClose, onSelect }: SheetProps) {
  const { width, height, fontScale } = useWindowDimensions();
  const landscape = width >= 760 && width > height;
  const compact = height < 700 || fontScale > 1.15;
  const [browsing, setBrowsing] = useState(deviceId === null);
  const device = getDevice(deviceId);
  const status = snapshot.status === 'disconnected' ? 'Session changed. Close and reopen controls.'
    : snapshot.status === 'error' ? 'Could not save locally. Your changes are still in this session.'
      : !snapshot.ready ? 'Loading saved controls…' : snapshot.status === 'saving' ? 'Saving simulation…' : 'Simulation · Saved on this device';
  return <Modal transparent visible animationType={motionAllowed ? 'fade' : 'none'} onRequestClose={onClose}>
    <View style={[styles.overlay, landscape && styles.overlayLandscape]}>
      <SafeAreaView style={[styles.safeArea, landscape && styles.safeAreaLandscape]}>
        <View accessibilityViewIsModal style={[styles.card, compact && styles.compact]}>
          <View style={styles.row}>
            <View style={styles.grow}><Text style={styles.eyebrow}>{browsing ? 'YOUR HOME' : getRoom(device?.roomId ?? '').name.toUpperCase()}</Text>
              <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{browsing ? 'Device library' : device?.name}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close device controls" onPress={onClose} style={styles.button}><Text style={styles.label}>Done</Text></Pressable>
          </View>
          {browsing || !device ? <DeviceBrowser compact={compact} onSelect={(id) => { onSelect(id); setBrowsing(false); }} />
            : <DeviceInspector key={device.id} device={device} state={snapshot.state.deviceStates[device.id]}
              client={client} disabled={!snapshot.ready} compact={compact} onBrowse={() => setBrowsing(true)} />}
          <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}

/** Navigate by room, then device; even large device catalogs keep a bounded page height. */
function DeviceBrowser({ compact, onSelect }: { compact: boolean; onSelect: (id: string) => void }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = compact ? 4 : 6;
  const choices = roomId ? DEVICES.filter((device) => device.roomId === roomId) : ROOMS.filter((room) => DEVICES.some((device) => device.roomId === room.id));
  const pageCount = Math.ceil(choices.length / pageSize);
  const visiblePage = Math.min(page, Math.max(0, pageCount - 1));
  return <>
    <View style={styles.row}><Text style={[styles.detail, styles.grow]}>{roomId ? getRoom(roomId).name : 'Choose a room to explore its devices.'}</Text>
      {roomId && <Pressable accessibilityRole="button" onPress={() => { setRoomId(null); setPage(0); }} style={styles.button}><Text style={styles.label}>All rooms</Text></Pressable>}</View>
    <View style={styles.list}>{choices.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map((choice) => <Pressable key={choice.id} accessibilityRole="button"
      onPress={() => { if (roomId) onSelect(choice.id); else { setRoomId(choice.id); setPage(0); } }}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <Text style={styles.label}>{choice.name} ›</Text>
      {!roomId && <Text style={styles.detail}>{DEVICES.filter((device) => device.roomId === choice.id).length} devices</Text>}
    </Pressable>)}</View>
    <ControlPagination page={visiblePage} count={pageCount} onChange={setPage} />
  </>;
}

/** Keep the original quick action visible while paging through the complete shared capability catalog. */
function DeviceInspector({ device, state, client, disabled, compact, onBrowse }: {
  device: DeviceDefinition; state: DeviceState; client: SimulationControlClient; disabled: boolean; compact: boolean; onBrowse: () => void;
}) {
  const [group, setGroup] = useState<Group>('controls');
  const [page, setPage] = useState(0);
  const [option, setOption] = useState<EnumCapability | null>(null);
  const [optionPage, setOptionPage] = useState(0);
  const allPages = getControlPages(device.kind, { maxControlsPerPage: compact ? 2 : 3 });
  const pages = allPages.filter((item) => item.group === group);
  const selectedPage = Math.min(page, Math.max(0, pages.length - 1));
  const current = pages[selectedPage];
  const optionSize = compact ? 4 : 6;
  const optionCount = Math.ceil((option?.options.length ?? 0) / optionSize);
  const visibleOptionPage = Math.min(optionPage, Math.max(0, optionCount - 1));
  const options = option?.options.slice(visibleOptionPage * optionSize, (visibleOptionPage + 1) * optionSize);
  const tone = gasStatusTone(device.kind, state);
  return <>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => client.toggle(device.id)}
        style={[styles.button, styles.primary, styles.grow, disabled && styles.disabled]}><Text style={[styles.label, styles.primaryText]}>{quickActionLabel(device, state)}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Browse all devices" onPress={onBrowse} style={styles.button}><Text style={styles.label}>Devices</Text></Pressable>
    </View>
    {option ? <>
      <View style={styles.row}><Text style={[styles.label, styles.grow]}>{option.label}</Text>
        <Pressable accessibilityRole="button" onPress={() => setOption(null)} style={styles.button}><Text style={styles.label}>Back</Text></Pressable></View>
      <View style={styles.content}>{options?.map((choice) => <Pressable key={String(choice.value)} accessibilityRole="radio"
        accessibilityState={{ checked: readDeviceSetting(device, state, option.field) === choice.value, disabled }} disabled={disabled}
        aria-checked={readDeviceSetting(device, state, option.field) === choice.value}
        onPress={() => { client.setSetting(device.id, option.field, choice.value); setOption(null); }}
        style={[styles.item, readDeviceSetting(device, state, option.field) === choice.value && styles.selection]}>
        <Text style={styles.label}>{choice.label}{readDeviceSetting(device, state, option.field) === choice.value ? ' ✓' : ''}</Text>
      </Pressable>)}</View>
      <ControlPagination page={visibleOptionPage} count={optionCount} onChange={setOptionPage} />
    </> : <>
      <View accessibilityRole="tablist" style={styles.tabs}>{GROUPS.map((item) => {
        const available = allPages.some((candidate) => candidate.group === item);
        return <Pressable key={item} accessibilityRole="tab" accessibilityLabel={GROUP_LABELS[item]}
          accessibilityState={{ selected: group === item, disabled: !available }} disabled={!available}
          aria-selected={group === item} aria-disabled={!available}
          onPress={() => { setGroup(item); setPage(0); }} style={[styles.tab, group === item && styles.selected, !available && styles.disabled]}>
          <Text style={[styles.tabText, group === item && styles.selectedTabText]}>{GROUP_LABELS[item]}</Text>
        </Pressable>;
      })}</View>
      <Text accessibilityLiveRegion="polite" style={[styles.detail, tone === 'alarm' && styles.alarm, (tone === 'warning' || tone === 'closed') && styles.warning]}>{group === 'schedule' ? 'Saved preview preferences. Timers do not run devices.'
        : group === 'status' ? `${deviceStatus(device, state)} · Simulated readings`
          : deviceActionFeedback(device, state) ?? deviceStatus(device, state)}</Text>
      <View style={[styles.content, current?.compact && styles.grid]}>
        {current?.capabilities.map((capability) => <NativeCapabilityControl key={capability.id} capability={capability} device={device}
          state={state} client={client} disabled={disabled} compact={compact} onOptions={(next) => { setOption(next); setOptionPage(0); }} />)}
        {!current && <Text style={styles.detail}>Use the quick action above for this device.</Text>}
      </View>
      <ControlPagination page={selectedPage} count={pages.length} onChange={setPage} />
    </>}
  </>;
}
