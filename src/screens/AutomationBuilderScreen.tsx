import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Pressable from '../components/Pressable';
import BackgroundLines from '../components/BackgroundLines';
import { theme } from '../theme/theme';
import {
  AC_TEMP_MAX_C,
  AC_TEMP_MIN_C,
  useHomeStore,
  type AutomationFlow,
  type Device,
  type FlowAction,
  type FlowCondition,
  type FlowTrigger,
  type Weekday,
} from '../store/useHomeStore';
import { useResponsive } from '../theme/layout';
import type { RootStackParamList } from '../app/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'AutomationBuilder'>;
type EditorSection = 'trigger' | 'condition' | 'action';

const TRIGGER_TYPES = [
  { id: 'time', label: 'Time' },
  { id: 'device', label: 'Device' },
  { id: 'presence', label: 'Presence' },
  { id: 'scene', label: 'Scene' },
] as const;

const CONDITION_TYPES = [
  { id: 'time-range', label: 'Time Range' },
  { id: 'device', label: 'Device' },
  { id: 'day', label: 'Days' },
] as const;

const ACTION_TYPES = [
  { id: 'toggle', label: 'Toggle' },
  { id: 'set-ac', label: 'Set AC' },
  { id: 'set-brightness', label: 'Brightness' },
  { id: 'run-scene', label: 'Run Scene' },
  { id: 'delay', label: 'Delay' },
  { id: 'notify', label: 'Notify' },
] as const;

const WEEK_DAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DELAY_PRESETS = [5, 15, 30, 60, 120, 300];

export default function AutomationBuilderScreen({ navigation, route }: Props) {
  const { contentWidth, gutter, topPad, isTablet, scale } = useResponsive(920);
  const flowId = route.params?.flowId;
  const titleSize = Math.round((isTablet ? 28 : 24) * scale);
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const cardPad = Math.round((isTablet ? 18 : 16) * scale);
  const cardRadius = Math.round((isTablet ? 26 : 22) * scale);
  const inputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const inputRadius = Math.round(inputHeight * 0.28);
  const buttonHeight = Math.round((isTablet ? 42 : 38) * scale);
  const buttonRadius = Math.round(buttonHeight / 2);
  const chipHeight = Math.round((isTablet ? 34 : 30) * scale);
  const chipRadius = Math.round(chipHeight / 2);
  const sectionTitleSize = Math.round((isTablet ? 16 : 14) * scale);
  const sectionSubSize = Math.round((isTablet ? 13 : 12) * scale);

  const flows = useHomeStore((s) => s.flows);
  const addFlow = useHomeStore((s) => s.addFlow);
  const updateFlow = useHomeStore((s) => s.updateFlow);
  const removeFlow = useHomeStore((s) => s.removeFlow);
  const devices = useHomeStore((s) => s.devices);
  const scenes = useHomeStore((s) => s.scenes);
  const household = useHomeStore((s) => s.household);

  const existing = flows.find((f) => f.id === flowId);
  const isEditing = Boolean(existing);

  const [name, setName] = useState(existing?.name ?? '');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [triggers, setTriggers] = useState<FlowTrigger[]>(existing?.triggers ?? []);
  const [conditions, setConditions] = useState<FlowCondition[]>(existing?.conditions ?? []);
  const [actions, setActions] = useState<FlowAction[]>(existing?.actions ?? []);

  const [editorSection, setEditorSection] = useState<EditorSection | null>(null);
  const [editorType, setEditorType] = useState<string>('time');
  const [draftTime, setDraftTime] = useState({ hour: '07', minute: '00' });
  const [draftRange, setDraftRange] = useState({
    startHour: '18',
    startMinute: '00',
    endHour: '23',
    endMinute: '00',
  });
  const [draftDeviceId, setDraftDeviceId] = useState('');
  const [draftStateOn, setDraftStateOn] = useState(true);
  const [draftSceneId, setDraftSceneId] = useState('');
  const [draftMemberId, setDraftMemberId] = useState('');
  const [draftPresenceStatus, setDraftPresenceStatus] = useState<'home' | 'away'>('home');
  const [draftDays, setDraftDays] = useState<Weekday[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [draftBrightness, setDraftBrightness] = useState(60);
  const [draftTemp, setDraftTemp] = useState(22);
  const [draftDelaySeconds, setDraftDelaySeconds] = useState(10);
  const [draftMessage, setDraftMessage] = useState('Someone arrived.');

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setEnabled(existing.enabled);
    setTriggers(existing.triggers);
    setConditions(existing.conditions);
    setActions(existing.actions);
  }, [existing]);

  const deviceMap = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);
  const sceneMap = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const memberMap = useMemo(() => new Map(household.map((m) => [m.id, m])), [household]);

  const acDevices = useMemo(() => devices.filter((d) => d.kind === 'ac'), [devices]);
  const lightDevices = useMemo(() => devices.filter((d) => d.kind === 'light'), [devices]);

  const flowName = name.trim() || (isEditing ? existing?.name ?? 'Flow' : 'New Flow');
  const canSave = triggers.length > 0 && actions.length > 0;

  const openEditor = (section: EditorSection) => {
    setEditorSection(section);
    const type =
      section === 'trigger'
        ? TRIGGER_TYPES[0].id
        : section === 'condition'
          ? CONDITION_TYPES[0].id
          : ACTION_TYPES[0].id;
    setEditorType(type);
    setDraftTime({ hour: '07', minute: '00' });
    setDraftRange({ startHour: '18', startMinute: '00', endHour: '23', endMinute: '00' });
    setDraftStateOn(true);
    setDraftPresenceStatus('home');
    setDraftDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    setDraftBrightness(60);
    setDraftTemp(22);
    setDraftDelaySeconds(10);
    setDraftMessage('Someone arrived.');

    const firstDevice = devices[0]?.id ?? '';
    const firstScene = scenes[0]?.id ?? '';
    const firstMember = household[0]?.id ?? '';
    setDraftDeviceId(firstDevice);
    setDraftSceneId(firstScene);
    setDraftMemberId(firstMember);
  };

  useEffect(() => {
    if (!editorSection) return;
    if (editorSection !== 'action') return;
    const options =
      editorType === 'set-ac'
        ? acDevices
        : editorType === 'set-brightness'
          ? lightDevices
          : devices;
    if (!options.length) return;
    if (!options.find((d) => d.id === draftDeviceId)) {
      setDraftDeviceId(options[0].id);
    }
  }, [editorSection, editorType, devices, acDevices, lightDevices, draftDeviceId]);

  const clamp = (value: number, min: number, max: number) => {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  };
  const parseTime = (hour: string, minute: string) => {
    const h = clamp(parseInt(hour || '0', 10), 0, 23);
    const m = clamp(parseInt(minute || '0', 10), 0, 59);
    return { hour: h, minute: m };
  };

  const addItem = () => {
    if (!editorSection) return;
    if (editorSection === 'trigger') {
      if (editorType === 'time') {
        const { hour, minute } = parseTime(draftTime.hour, draftTime.minute);
        setTriggers((prev) => [...prev, { type: 'time', hour, minute }]);
      }
      if (editorType === 'device' && draftDeviceId) {
        setTriggers((prev) => [
          ...prev,
          { type: 'device', deviceId: draftDeviceId, state: draftStateOn ? 'on' : 'off' },
        ]);
      }
      if (editorType === 'presence' && draftMemberId) {
        setTriggers((prev) => [
          ...prev,
          { type: 'presence', memberId: draftMemberId, status: draftPresenceStatus },
        ]);
      }
      if (editorType === 'scene' && draftSceneId) {
        setTriggers((prev) => [...prev, { type: 'scene', sceneId: draftSceneId }]);
      }
    }

    if (editorSection === 'condition') {
      if (editorType === 'time-range') {
        const start = parseTime(draftRange.startHour, draftRange.startMinute);
        const end = parseTime(draftRange.endHour, draftRange.endMinute);
        setConditions((prev) => [
          ...prev,
          { type: 'time-range', startHour: start.hour, startMinute: start.minute, endHour: end.hour, endMinute: end.minute },
        ]);
      }
      if (editorType === 'device' && draftDeviceId) {
        setConditions((prev) => [
          ...prev,
          { type: 'device', deviceId: draftDeviceId, state: draftStateOn ? 'on' : 'off' },
        ]);
      }
      if (editorType === 'day') {
        const days = draftDays.length ? draftDays : WEEK_DAYS;
        setConditions((prev) => [...prev, { type: 'day', days }]);
      }
    }

    if (editorSection === 'action') {
      if (editorType === 'toggle' && draftDeviceId) {
        setActions((prev) => [...prev, { type: 'toggle', deviceId: draftDeviceId, on: draftStateOn }]);
      }
      if (editorType === 'set-ac' && draftDeviceId) {
        setActions((prev) => [
          ...prev,
          {
            type: 'set-ac',
            deviceId: draftDeviceId,
            tempC: clamp(draftTemp, AC_TEMP_MIN_C, AC_TEMP_MAX_C),
            mode: 'cold',
          },
        ]);
      }
      if (editorType === 'set-brightness' && draftDeviceId) {
        setActions((prev) => [
          ...prev,
          { type: 'set-brightness', deviceId: draftDeviceId, brightness: clamp(draftBrightness, 0, 100) },
        ]);
      }
      if (editorType === 'run-scene' && draftSceneId) {
        setActions((prev) => [...prev, { type: 'run-scene', sceneId: draftSceneId }]);
      }
      if (editorType === 'delay') {
        const seconds = clamp(draftDelaySeconds, 1, 600);
        setActions((prev) => [...prev, { type: 'delay', seconds }]);
      }
      if (editorType === 'notify') {
        const message = draftMessage.trim() || 'Notification';
        setActions((prev) => [...prev, { type: 'notify', message }]);
      }
    }

    setEditorSection(null);
  };

  const handleSave = () => {
    if (!canSave) return;
    const payload: Omit<AutomationFlow, 'id'> = {
      name: flowName,
      enabled,
      triggers,
      conditions,
      actions,
    };
    if (isEditing && existing) {
      updateFlow(existing.id, payload);
    } else {
      addFlow(payload);
    }
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!existing) return;
    removeFlow(existing.id);
    navigation.goBack();
  };

  const renderRow = (label: string, text: string, onRemove: () => void) => (
    <View style={[styles.itemRow, { borderRadius: Math.round(cardRadius * 0.6) }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemLabel, { fontSize: labelSize }]}>{label}</Text>
        <Text style={[styles.itemValue, { fontSize: sectionSubSize }]}>{text}</Text>
      </View>
      <Pressable style={styles.removeBtn} onPress={onRemove}>
        <Ionicons name="close" size={Math.round(16 * scale)} color={theme.colors.text} />
      </Pressable>
    </View>
  );

  return (
    <LinearGradient colors={[theme.colors.bg1, theme.colors.bg0]} style={styles.root}>
      <BackgroundLines />

      <View
        style={[
          styles.header,
          { paddingHorizontal: gutter, paddingTop: topPad, width: contentWidth, alignSelf: 'center' },
        ]}
      >
        <Pressable
          style={[styles.headerBtn, { height: buttonHeight, borderRadius: buttonRadius }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={Math.round(18 * scale)} color={theme.colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { fontSize: titleSize }]}>{isEditing ? 'Edit Flow' : 'New Flow'}</Text>
        <Pressable
          style={[
            styles.headerBtn,
            styles.saveBtn,
            { height: buttonHeight, borderRadius: buttonRadius },
            !canSave && styles.saveBtnDisabled,
          ]}
          onPress={handleSave}
          disabled={!canSave}
        >
          <Ionicons name="checkmark" size={Math.round(18 * scale)} color={theme.colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isTablet ? gutter : 0,
            paddingBottom: Math.round((isTablet ? (isLandscape ? 120 : 140) : 120) * scale),
          },
        ]}
      >
        <View style={{ width: contentWidth, alignSelf: 'center', paddingHorizontal: isTablet ? 0 : gutter }}>
          <View style={[styles.card, { padding: cardPad, borderRadius: cardRadius }]}>
            <Text style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}>Flow details</Text>
            <Text style={[styles.sectionSub, { fontSize: sectionSubSize }]}>
              Triggers start the flow, conditions filter it, and actions run when everything matches.
            </Text>

            <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="New flow"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
            />

            <View style={styles.switchRow}>
              <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Enabled</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                thumbColor={enabled ? theme.colors.accent : 'rgba(255,255,255,0.8)'}
                trackColor={{ true: 'rgba(180,107,255,0.45)', false: 'rgba(255,255,255,0.24)' }}
                style={{ transform: [{ scale: isTablet ? 1.05 : 1 }] }}
              />
            </View>
          </View>

          <View style={[styles.sectionCard, { padding: cardPad, borderRadius: cardRadius }]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}>Triggers</Text>
                <Text style={[styles.sectionSub, { fontSize: sectionSubSize }]}>Start this flow when...</Text>
              </View>
              <Pressable style={[styles.addBtn, { height: chipHeight, borderRadius: chipRadius }]} onPress={() => openEditor('trigger')}>
                <Ionicons name="add" size={Math.round(16 * scale)} color={theme.colors.text} />
                <Text style={[styles.addBtnText, { fontSize: labelSize }]}>Add</Text>
              </Pressable>
            </View>
            {triggers.length === 0 ? (
              <Text style={styles.emptyText}>No triggers yet.</Text>
            ) : (
              triggers.map((trigger, index) =>
                renderRow('Trigger', describeTrigger(trigger, deviceMap, sceneMap, memberMap), () =>
                  setTriggers((prev) => prev.filter((_, i) => i !== index))
                )
              )
            )}
          </View>

          <View style={[styles.sectionCard, { padding: cardPad, borderRadius: cardRadius }]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}>Conditions</Text>
                <Text style={[styles.sectionSub, { fontSize: sectionSubSize }]}>Only run when...</Text>
              </View>
              <Pressable style={[styles.addBtn, { height: chipHeight, borderRadius: chipRadius }]} onPress={() => openEditor('condition')}>
                <Ionicons name="add" size={Math.round(16 * scale)} color={theme.colors.text} />
                <Text style={[styles.addBtnText, { fontSize: labelSize }]}>Add</Text>
              </Pressable>
            </View>
            {conditions.length === 0 ? (
              <Text style={styles.emptyText}>No conditions (optional).</Text>
            ) : (
              conditions.map((condition, index) =>
                renderRow('Condition', describeCondition(condition, deviceMap), () =>
                  setConditions((prev) => prev.filter((_, i) => i !== index))
                )
              )
            )}
          </View>

          <View style={[styles.sectionCard, { padding: cardPad, borderRadius: cardRadius }]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { fontSize: sectionTitleSize }]}>Actions</Text>
                <Text style={[styles.sectionSub, { fontSize: sectionSubSize }]}>Then do this...</Text>
              </View>
              <Pressable style={[styles.addBtn, { height: chipHeight, borderRadius: chipRadius }]} onPress={() => openEditor('action')}>
                <Ionicons name="add" size={Math.round(16 * scale)} color={theme.colors.text} />
                <Text style={[styles.addBtnText, { fontSize: labelSize }]}>Add</Text>
              </Pressable>
            </View>
            {actions.length === 0 ? (
              <Text style={styles.emptyText}>Add at least one action.</Text>
            ) : (
              actions.map((action, index) =>
                renderRow('Action', describeAction(action, deviceMap, sceneMap), () =>
                  setActions((prev) => prev.filter((_, i) => i !== index))
                )
              )
            )}
          </View>

          {isEditing && (
            <Pressable style={[styles.deleteBtn, { height: buttonHeight }]} onPress={handleDelete}>
              <Ionicons name="trash" size={Math.round(16 * scale)} color="#FFD0D8" />
              <Text style={[styles.deleteText, { fontSize: labelSize }]}>Delete flow</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <Modal transparent visible={editorSection !== null} animationType="fade" onRequestClose={() => setEditorSection(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setEditorSection(null)} />
          <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })}>
            <LinearGradient
              colors={['rgba(255,255,255,0.98)', 'rgba(236,228,255,0.95)']}
              start={{ x: 0.1, y: 0.1 }}
              end={{ x: 0.9, y: 1 }}
              style={[
                styles.modalCard,
                {
                  padding: cardPad,
                  borderRadius: Math.round(cardRadius * 0.9),
                  width: isTablet ? Math.min(contentWidth - gutter * 2, 580) : undefined,
                  alignSelf: 'center',
                },
              ]}
            >
              <Text style={[styles.modalTitle, { fontSize: sectionTitleSize }]}>
                {editorSection ? `Add ${editorSection}` : ''}
              </Text>

              <View style={styles.typeRow}>
                {(editorSection === 'trigger' ? TRIGGER_TYPES : editorSection === 'condition' ? CONDITION_TYPES : ACTION_TYPES).map(
                  (item) => (
                    <Pressable
                      key={item.id}
                      style={[
                        styles.typeChip,
                        { height: chipHeight, borderRadius: chipRadius },
                        editorType === item.id && styles.typeChipActive,
                      ]}
                      onPress={() => setEditorType(item.id)}
                    >
                      <Text style={[styles.typeChipText, editorType === item.id && styles.typeChipTextActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>

              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {editorSection === 'trigger' && editorType === 'time' && (
                  <View style={styles.formRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Hour</Text>
                      <TextInput
                        value={draftTime.hour}
                        onChangeText={(value) => setDraftTime((prev) => ({ ...prev, hour: value }))}
                        keyboardType="number-pad"
                        style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Minute</Text>
                      <TextInput
                        value={draftTime.minute}
                        onChangeText={(value) => setDraftTime((prev) => ({ ...prev, minute: value }))}
                        keyboardType="number-pad"
                        style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                      />
                    </View>
                  </View>
                )}

                {editorSection === 'trigger' && editorType === 'device' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Device</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {devices.map((d) => (
                        <Pressable
                          key={d.id}
                          style={[
                            styles.choiceChip,
                            { height: chipHeight, borderRadius: chipRadius },
                            draftDeviceId === d.id && styles.choiceChipActive,
                          ]}
                          onPress={() => setDraftDeviceId(d.id)}
                        >
                          <Text style={[styles.choiceChipText, draftDeviceId === d.id && styles.choiceChipTextActive]}>
                            {d.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <View style={styles.switchRow}>
                      <Text style={[styles.inputLabel, { fontSize: labelSize }]}>
                        State: {draftStateOn ? 'On' : 'Off'}
                      </Text>
                      <Switch
                        value={draftStateOn}
                        onValueChange={setDraftStateOn}
                        thumbColor={draftStateOn ? theme.colors.accent : 'rgba(255,255,255,0.8)'}
                        trackColor={{ true: 'rgba(180,107,255,0.45)', false: 'rgba(255,255,255,0.24)' }}
                      />
                    </View>
                  </View>
                )}

                {editorSection === 'trigger' && editorType === 'presence' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Household member</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {household.map((m) => (
                        <Pressable
                          key={m.id}
                          style={[
                            styles.choiceChip,
                            { height: chipHeight, borderRadius: chipRadius },
                            draftMemberId === m.id && styles.choiceChipActive,
                          ]}
                          onPress={() => setDraftMemberId(m.id)}
                        >
                          <Text style={[styles.choiceChipText, draftMemberId === m.id && styles.choiceChipTextActive]}>
                            {m.name.split(' ')[0]}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <View style={styles.switchRow}>
                      <Text style={[styles.inputLabel, { fontSize: labelSize }]}>
                        Status: {draftPresenceStatus === 'home' ? 'Home' : 'Away'}
                      </Text>
                      <Switch
                        value={draftPresenceStatus === 'home'}
                        onValueChange={(v) => setDraftPresenceStatus(v ? 'home' : 'away')}
                        thumbColor={draftPresenceStatus === 'home' ? theme.colors.accent : 'rgba(255,255,255,0.8)'}
                        trackColor={{ true: 'rgba(180,107,255,0.45)', false: 'rgba(255,255,255,0.24)' }}
                      />
                    </View>
                  </View>
                )}

                {editorSection === 'trigger' && editorType === 'scene' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Scene</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {scenes.map((s) => (
                        <Pressable
                          key={s.id}
                          style={[
                            styles.choiceChip,
                            { height: chipHeight, borderRadius: chipRadius },
                            draftSceneId === s.id && styles.choiceChipActive,
                          ]}
                          onPress={() => setDraftSceneId(s.id)}
                        >
                          <Text style={[styles.choiceChipText, draftSceneId === s.id && styles.choiceChipTextActive]}>
                            {s.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {editorSection === 'condition' && editorType === 'time-range' && (
                  <>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Start time</Text>
                    <View style={styles.formRow}>
                      <TextInput
                        value={draftRange.startHour}
                        onChangeText={(value) => setDraftRange((prev) => ({ ...prev, startHour: value }))}
                        keyboardType="number-pad"
                        style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                      />
                      <TextInput
                        value={draftRange.startMinute}
                        onChangeText={(value) => setDraftRange((prev) => ({ ...prev, startMinute: value }))}
                        keyboardType="number-pad"
                        style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                      />
                    </View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>End time</Text>
                    <View style={styles.formRow}>
                      <TextInput
                        value={draftRange.endHour}
                        onChangeText={(value) => setDraftRange((prev) => ({ ...prev, endHour: value }))}
                        keyboardType="number-pad"
                        style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                      />
                      <TextInput
                        value={draftRange.endMinute}
                        onChangeText={(value) => setDraftRange((prev) => ({ ...prev, endMinute: value }))}
                        keyboardType="number-pad"
                        style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                      />
                    </View>
                  </>
                )}

                {editorSection === 'condition' && editorType === 'device' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Device</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {devices.map((d) => (
                        <Pressable
                          key={d.id}
                          style={[
                            styles.choiceChip,
                            { height: chipHeight, borderRadius: chipRadius },
                            draftDeviceId === d.id && styles.choiceChipActive,
                          ]}
                          onPress={() => setDraftDeviceId(d.id)}
                        >
                          <Text style={[styles.choiceChipText, draftDeviceId === d.id && styles.choiceChipTextActive]}>
                            {d.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <View style={styles.switchRow}>
                      <Text style={[styles.inputLabel, { fontSize: labelSize }]}>
                        State: {draftStateOn ? 'On' : 'Off'}
                      </Text>
                      <Switch
                        value={draftStateOn}
                        onValueChange={setDraftStateOn}
                        thumbColor={draftStateOn ? theme.colors.accent : 'rgba(255,255,255,0.8)'}
                        trackColor={{ true: 'rgba(180,107,255,0.45)', false: 'rgba(255,255,255,0.24)' }}
                      />
                    </View>
                  </View>
                )}

                {editorSection === 'condition' && editorType === 'day' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Days</Text>
                    <View style={styles.dayGrid}>
                      {WEEK_DAYS.map((day) => {
                        const active = draftDays.includes(day);
                        return (
                          <Pressable
                            key={day}
                            style={[
                              styles.choiceChip,
                              { height: chipHeight, borderRadius: chipRadius },
                              active && styles.choiceChipActive,
                            ]}
                            onPress={() =>
                              setDraftDays((prev) =>
                                prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                              )
                            }
                          >
                            <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{day}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {editorSection === 'action' && editorType === 'toggle' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Device</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {devices.map((d) => (
                        <Pressable
                          key={d.id}
                          style={[
                            styles.choiceChip,
                            { height: chipHeight, borderRadius: chipRadius },
                            draftDeviceId === d.id && styles.choiceChipActive,
                          ]}
                          onPress={() => setDraftDeviceId(d.id)}
                        >
                          <Text style={[styles.choiceChipText, draftDeviceId === d.id && styles.choiceChipTextActive]}>
                            {d.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <View style={styles.switchRow}>
                      <Text style={[styles.inputLabel, { fontSize: labelSize }]}>
                        Turn {draftStateOn ? 'On' : 'Off'}
                      </Text>
                      <Switch
                        value={draftStateOn}
                        onValueChange={setDraftStateOn}
                        thumbColor={draftStateOn ? theme.colors.accent : 'rgba(255,255,255,0.8)'}
                        trackColor={{ true: 'rgba(180,107,255,0.45)', false: 'rgba(255,255,255,0.24)' }}
                      />
                    </View>
                  </View>
                )}

                {editorSection === 'action' && editorType === 'set-ac' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>AC device</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {(acDevices.length ? acDevices : devices).map((d) => (
                        <Pressable
                          key={d.id}
                          style={[
                            styles.choiceChip,
                            { height: chipHeight, borderRadius: chipRadius },
                            draftDeviceId === d.id && styles.choiceChipActive,
                          ]}
                          onPress={() => setDraftDeviceId(d.id)}
                        >
                          <Text style={[styles.choiceChipText, draftDeviceId === d.id && styles.choiceChipTextActive]}>
                            {d.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Temperature</Text>
                    <TextInput
                      value={String(draftTemp)}
                      onChangeText={(value) => setDraftTemp(parseInt(value || '0', 10))}
                      keyboardType="number-pad"
                      style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                    />
                  </View>
                )}

                {editorSection === 'action' && editorType === 'set-brightness' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Light device</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {(lightDevices.length ? lightDevices : devices).map((d) => (
                        <Pressable
                          key={d.id}
                          style={[
                            styles.choiceChip,
                            { height: chipHeight, borderRadius: chipRadius },
                            draftDeviceId === d.id && styles.choiceChipActive,
                          ]}
                          onPress={() => setDraftDeviceId(d.id)}
                        >
                          <Text style={[styles.choiceChipText, draftDeviceId === d.id && styles.choiceChipTextActive]}>
                            {d.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Brightness %</Text>
                    <TextInput
                      value={String(draftBrightness)}
                      onChangeText={(value) => setDraftBrightness(parseInt(value || '0', 10))}
                      keyboardType="number-pad"
                      style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                    />
                  </View>
                )}

                {editorSection === 'action' && editorType === 'run-scene' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Scene</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {scenes.map((s) => (
                        <Pressable
                          key={s.id}
                          style={[
                            styles.choiceChip,
                            { height: chipHeight, borderRadius: chipRadius },
                            draftSceneId === s.id && styles.choiceChipActive,
                          ]}
                          onPress={() => setDraftSceneId(s.id)}
                        >
                          <Text style={[styles.choiceChipText, draftSceneId === s.id && styles.choiceChipTextActive]}>
                            {s.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {editorSection === 'action' && editorType === 'notify' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Message</Text>
                    <TextInput
                      value={draftMessage}
                      onChangeText={setDraftMessage}
                      placeholder="Send a notification"
                      placeholderTextColor="rgba(12,12,18,0.45)"
                      style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                    />
                  </View>
                )}

                {editorSection === 'action' && editorType === 'delay' && (
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: labelSize }]}>Delay (seconds)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {DELAY_PRESETS.map((seconds) => {
                        const active = draftDelaySeconds === seconds;
                        return (
                          <Pressable
                            key={seconds}
                            style={[
                              styles.choiceChip,
                              { height: chipHeight, borderRadius: chipRadius },
                              active && styles.choiceChipActive,
                            ]}
                            onPress={() => setDraftDelaySeconds(seconds)}
                          >
                            <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                              {formatDelayLabel(seconds)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <TextInput
                      value={String(draftDelaySeconds)}
                      onChangeText={(value) => setDraftDelaySeconds(parseInt(value || '0', 10))}
                      keyboardType="number-pad"
                      style={[styles.input, { height: inputHeight, borderRadius: inputRadius }]}
                    />
                  </View>
                )}
              </ScrollView>

              <Pressable style={[styles.modalBtn, { height: buttonHeight, borderRadius: buttonRadius }]} onPress={addItem}>
                <Text style={[styles.modalBtnText, { fontSize: labelSize }]}>Add {editorSection}</Text>
              </Pressable>
            </LinearGradient>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

function describeTrigger(
  trigger: FlowTrigger,
  devices: Map<string, Device>,
  scenes: Map<string, { id: string; name: string }>,
  members: Map<string, { id: string; name: string }>
) {
  switch (trigger.type) {
    case 'time':
      return `At ${formatTime(trigger.hour, trigger.minute)}`;
    case 'device':
      return `${devices.get(trigger.deviceId)?.name ?? 'Device'} turns ${trigger.state.toUpperCase()}`;
    case 'scene':
      return `${scenes.get(trigger.sceneId)?.name ?? 'Scene'} starts`;
    case 'presence':
      return `${members.get(trigger.memberId)?.name ?? 'Someone'} is ${trigger.status}`;
    default:
      return 'Trigger';
  }
}

function describeCondition(condition: FlowCondition, devices: Map<string, Device>) {
  switch (condition.type) {
    case 'time-range':
      return `${formatTime(condition.startHour, condition.startMinute)} - ${formatTime(
        condition.endHour,
        condition.endMinute
      )}`;
    case 'device':
      return `${devices.get(condition.deviceId)?.name ?? 'Device'} is ${condition.state.toUpperCase()}`;
    case 'day':
      return `Days: ${condition.days.join(', ')}`;
    default:
      return 'Condition';
  }
}

function describeAction(action: FlowAction, devices: Map<string, Device>, scenes: Map<string, { id: string; name: string }>) {
  switch (action.type) {
    case 'toggle':
      return `${devices.get(action.deviceId)?.name ?? 'Device'} ${action.on ? 'ON' : 'OFF'}`;
    case 'set-ac':
      return `Set ${devices.get(action.deviceId)?.name ?? 'AC'} to ${action.tempC}C`;
    case 'set-brightness':
      return `Brightness ${action.brightness}% on ${devices.get(action.deviceId)?.name ?? 'Light'}`;
    case 'run-scene':
      return `Run scene: ${scenes.get(action.sceneId)?.name ?? 'Scene'}`;
    case 'delay':
      return `Wait ${action.seconds}s`;
    case 'notify':
      return `Notify: ${action.message}`;
    default:
      return 'Action';
  }
}

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatDelayLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  return `${mins}m`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: theme.colors.text, fontWeight: '900', letterSpacing: -0.2 },
  headerBtn: {
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card,
  },
  saveBtn: { backgroundColor: 'rgba(180,107,255,0.55)' },
  saveBtnDisabled: { opacity: 0.5 },
  content: { paddingTop: 12 },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card,
    marginBottom: 12,
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card2,
    marginBottom: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: theme.colors.text, fontWeight: '900' },
  sectionSub: { color: theme.colors.subtext, marginTop: 4 },
  inputLabel: { color: theme.colors.subtext, fontWeight: '700', marginTop: 12 },
  input: {
    marginTop: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    color: theme.colors.text,
    fontWeight: '700',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(180,107,255,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(180,107,255,0.45)',
  },
  addBtnText: { color: theme.colors.text, fontWeight: '800' },
  emptyText: { color: theme.colors.muted, fontWeight: '700' },
  itemRow: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemLabel: { color: theme.colors.subtext, fontWeight: '700' },
  itemValue: { color: theme.colors.text, fontWeight: '800', marginTop: 4 },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  deleteBtn: {
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,120,140,0.45)',
    backgroundColor: 'rgba(255,120,140,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteText: { color: '#FFD0D8', fontWeight: '800' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,8,30,0.6)' },
  modalCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: 'rgba(10,8,30,0.4)',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
  },
  modalTitle: { color: '#15101E', fontWeight: '900', marginBottom: 10 },
  modalBtn: {
    marginTop: 14,
    backgroundColor: 'rgba(107,60,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: { color: '#fff', fontWeight: '800' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeChip: {
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.15)',
    backgroundColor: 'rgba(12,12,18,0.05)',
  },
  typeChipActive: { backgroundColor: 'rgba(107,60,255,0.15)', borderColor: 'rgba(107,60,255,0.35)' },
  typeChipText: { color: '#24202E', fontWeight: '700', fontSize: 12 },
  typeChipTextActive: { color: '#2B0A73', fontWeight: '900' },
  formRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  chipRow: { gap: 8, marginTop: 8 },
  choiceChip: {
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(12,12,18,0.15)',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  choiceChipActive: { backgroundColor: 'rgba(107,60,255,0.18)', borderColor: 'rgba(107,60,255,0.35)' },
  choiceChipText: { color: '#24202E', fontWeight: '700', fontSize: 12 },
  choiceChipTextActive: { color: '#2B0A73', fontWeight: '900' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
});
