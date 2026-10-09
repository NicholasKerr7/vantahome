import React, { useState } from 'react';
import { Modal, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { HomeChromeCommand, HomeChromeSnapshot } from '../../../packages/home-scene/src/homeChromeProtocol';
import CinematicSurface from '../../components/CinematicSurface';
import Pressable from '../../components/Pressable';
import { theme } from '../../theme/theme';
import { accountPreferencesStyles as styles } from './accountPreferencesStyles';
import { useAccountPreferences } from './useAccountPreferences';
import { preferenceSwitchKeyboard } from './preferenceSwitchKeyboard';

type Props = {
  onClose: () => void;
  onBack?: () => void;
  scene: HomeChromeSnapshot | null;
  onSceneCommand: (command: HomeChromeCommand) => void;
};
const TABS = [
  { id: 'experience', label: 'Experience' },
  { id: 'comfort', label: 'Comfort' },
  { id: 'display', label: 'Display' },
] as const;
type PreferenceTab = typeof TABS[number]['id'];

/** Pair each persisted preference with a readable explanation and a full-size switch target. */
function PreferenceToggle({ title, detail, value, disabled, onChange }: {
  title: string;
  detail: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return <Pressable style={[styles.row, disabled && styles.disabled]} accessibilityRole="switch" accessibilityLabel={title}
    accessibilityHint={detail} accessibilityState={{ checked: value, disabled }} aria-checked={value} disabled={disabled} onPress={() => onChange(!value)}
    {...preferenceSwitchKeyboard(() => onChange(!value), disabled)}>
    <View style={styles.copy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.detail}>{detail}</Text></View>
    <View style={styles.toggle} pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}><View style={[styles.toggleThumb, value && styles.toggleThumbOn]} /></View>
    </View>
  </Pressable>;
}

/** Present a small, directly saved display choice without creating an unsaved profile draft. */
function PreferenceChoice({ label, selected, disabled, onPress }: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return <Pressable accessibilityLabel={label} accessibilityState={{ selected, disabled }} aria-pressed={selected} disabled={disabled} onPress={onPress}
    style={[styles.choice, selected && styles.selectedChoice, disabled && styles.disabled]}>
    <Text style={styles.choiceText}>{label}</Text>
  </Pressable>;
}

/** Consolidate personal experience settings while leaving home administration in its existing workspace. */
export default function AccountPreferences({ onClose, onBack, scene, onSceneCommand }: Props) {
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 600;
  const [tab, setTab] = useState<PreferenceTab>('experience');
  const model = useAccountPreferences();
  const sceneUnavailable = !scene || !model.available;
  const motionReduced = Boolean(scene?.motionDisabled || scene?.systemReducedMotion);

  /** Send explicit settings only while this sheet still belongs to the current account. */
  function updateScene(command: HomeChromeCommand) {
    if (scene && model.canUpdate()) onSceneCommand(command);
  }

  /** Close native preferences before the host resumes the scene's existing help and recovery panel. */
  function openSceneHelp() {
    if (!scene || !model.canUpdate()) return;
    onClose();
    onSceneCommand({ type: 'open-preferences' });
  }

  return <Modal transparent visible animationType="none" onRequestClose={onClose}>
    <SafeAreaView style={[styles.overlay, tablet && styles.tabletOverlay]}>
      <CinematicSurface style={styles.panel}>
        <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={styles.content}>
          <View style={styles.heading}>
            {onBack && <Pressable style={styles.iconButton} onPress={onBack} accessibilityLabel="Back to account">
              <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
            </Pressable>}
            <View style={styles.copy}><Text style={styles.eyebrow}>PERSONAL SPACE</Text><Text accessibilityRole="header" style={styles.title}>Preferences</Text></View>
            <Pressable style={styles.iconButton} onPress={onClose} accessibilityLabel="Close preferences"><Ionicons name="close" size={23} color={theme.colors.text} /></Pressable>
          </View>
          <View accessibilityRole="tablist" style={styles.tabs}>
            {TABS.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label}
              accessibilityState={{ selected: tab === item.id }} aria-selected={tab === item.id} onPress={() => setTab(item.id)}
              style={[styles.tab, tab === item.id && styles.selectedTab]}>
              <Text style={[styles.tabText, tab === item.id && styles.selectedTabText]}>{item.label}</Text>
            </Pressable>)}
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false}>
            {!model.available && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.detail}>Reopen your account to change preferences.</Text></View>}
            {tab === 'experience' && <>
              <View style={styles.section}><Text style={styles.sectionTitle}>Your pace. Your atmosphere.</Text></View>
              <PreferenceToggle title="Scene motion" value={Boolean(scene) && !motionReduced} disabled={sceneUnavailable || scene?.systemReducedMotion}
                detail={scene?.systemReducedMotion ? 'Reduce Motion is enabled in device settings.' : 'Subtle animation throughout your 3D home.'}
                onChange={(enabled) => updateScene({ type: 'set-motion', disabled: !enabled })} />
              <PreferenceToggle title="Automatic cinematic tour" value={scene?.idleEnabled ?? false} disabled={sceneUnavailable}
                detail={motionReduced ? 'Paused while motion is reduced.' : 'A gentle property film when the home is idle.'}
                onChange={(enabled) => updateScene({ type: 'set-tour', enabled })} />
              {!scene && <Text accessibilityLiveRegion="polite" style={styles.detail}>3D settings will be available when your home is ready.</Text>}
              {scene?.preferenceError && <Text accessibilityRole="alert" style={styles.detail}>This preference could not be saved. Please try again.</Text>}
              <Pressable style={[styles.action, sceneUnavailable && styles.disabled]} disabled={sceneUnavailable}
                accessibilityState={{ disabled: sceneUnavailable }} accessibilityLabel="3D help and reset" onPress={openSceneHelp}>
                <Ionicons name="help-circle-outline" size={19} color={theme.colors.accentText} />
                <Text style={styles.actionText}>3D help & reset</Text>
              </Pressable>
            </>}
            {tab === 'comfort' && <>
              <View style={styles.section}><Text style={styles.sectionTitle}>Make every interaction yours.</Text></View>
              <PreferenceToggle title="Haptics" value={model.preferences.haptics} disabled={!model.available}
                detail="Touch feedback on supported devices." onChange={(haptics) => model.setComfortPreferences({ haptics })} />
              <PreferenceToggle title="Notifications" value={model.preferences.notifications} disabled={!model.available}
                detail="Your app preference. Device permission still applies." onChange={(notifications) => model.setComfortPreferences({ notifications })} />
            </>}
            {tab === 'display' && <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Temperature</Text>
                <View style={styles.choices}>{(['C', 'F'] as const).map((unit) => <PreferenceChoice key={unit}
                  label={unit === 'C' ? 'Celsius' : 'Fahrenheit'} selected={model.tempUnit === unit} disabled={!model.available}
                  onPress={() => model.setDisplayPreferences({ tempUnit: unit })} />)}</View>
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Time format</Text>
                <View style={styles.choices}>{(['12h', '24h'] as const).map((format) => <PreferenceChoice key={format}
                  label={format === '12h' ? '12-hour' : '24-hour'} selected={model.timeFormat === format} disabled={!model.available}
                  onPress={() => model.setDisplayPreferences({ timeFormat: format })} />)}</View>
              </View>
              <Text style={styles.detail}>Property time and weather follow your home’s configured location.</Text>
            </>}
          </ScrollView>
          <View style={styles.footer}><Ionicons name="phone-portrait-outline" size={13} color={theme.colors.subtext} /><Text style={styles.footerText}>Personal to this device</Text></View>
        </View>
      </CinematicSurface>
    </SafeAreaView>
  </Modal>;
}
