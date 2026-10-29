import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { DeviceDefinition } from '../../../packages/home-scene/src/data';
import type { DeviceState } from '../../../packages/home-scene/src/simulationTypes';
import { COFFEE_CUP_BOUNDS, COFFEE_PREVIEW_NOTE, COFFEE_SIZE_PRESETS, COFFEE_STRENGTHS, coffeeControllerActionId, readCoffeeControllerState } from '../../../packages/home-scene/src/coffeeController';
import type { SimulationDeviceControls } from './modelDeviceControls';
import { CoffeeControllerArtwork } from './CoffeeControllerArtwork';
import { coffeeControllerMaterials, coffeeControllerStyles as styles } from './CoffeeControllerStyles';
import { theme } from '../../theme/theme';

interface Props {
  device: DeviceDefinition; state: DeviceState; client: SimulationDeviceControls;
  disabled: boolean; compact: boolean; fontScale: number; motionAllowed: boolean; onMore: () => void;
}
interface KeyProps {
  label: string; text?: string; icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean; selected?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}

/** Raised keys retain 44-point targets and announce accepted saved recipe selections. */
function CoffeeKey({ label, text, icon, disabled = false, selected, onPress, style }: KeyProps) {
  const choice = selected !== undefined;
  return <Pressable accessibilityRole={choice ? 'radio' : 'button'} accessibilityLabel={label} aria-checked={selected}
    accessibilityState={choice ? { checked: selected, disabled } : { disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.key, style, selected && styles.keyActive, disabled && styles.keyDisabled, pressed && styles.keyPressed]}>
    {icon && <Ionicons accessible={false} name={icon} size={20} color={theme.colors.accentText} />}{text && <Text style={styles.keyLabel}>{text}</Text>}
  </Pressable>;
}

/** Use guarded canonical commands; choosing a recipe never starts or stops the brewing preview. */
export function CoffeeController({ device, state, client, disabled, compact, fontScale, motionAllowed, onMore }: Props) {
  const coffee = readCoffeeControllerState(device, state);
  const [viewportHeight, setViewportHeight] = useState(0);
  const compactLayout = compact || (viewportHeight > 0 && viewportHeight < 590);
  const largeText = fontScale > 1.15;
  /** Size the artwork using actual remaining sheet space before reducing any controls. */
  function measureViewport(event: LayoutChangeEvent) {
    const height = event.nativeEvent.layout.height;
    setViewportHeight((current) => current === height ? current : height);
  }
  /** Guard each recipe preference; it remains independent of activity and sample reservoirs. */
  function choose(field: 'coffeeStrength' | 'coffeeSizeOz', value: string | number) { if (!disabled) client.setSetting(device.id, field, value); }
  /** Relative cup commands use the latest accepted value and cannot overwrite rapid taps. */
  function step(key: 'cupsUp' | 'cupsDown') { if (!disabled) client.runAction(device.id, coffeeControllerActionId(key)); }
  if (!coffee) return null;
  return <ScrollView onLayout={measureViewport} testID="coffee-controller-scroll" style={styles.viewport} contentContainerStyle={styles.scrollContent} bounces={false} overScrollMode="never" nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <LinearGradient testID="coffee-tactile-controller" colors={coffeeControllerMaterials.edge} style={styles.shell}><LinearGradient colors={coffeeControllerMaterials.body} style={[styles.body, compactLayout && styles.bodyCompact]}>
      <View style={styles.header}><View style={styles.mark}><Ionicons accessible={false} name="cafe-outline" size={24} color={theme.colors.accentText} /></View><View style={styles.identity}><Text style={styles.brand}>VANTAHOME</Text><Text style={styles.title}>COFFEE ATELIER</Text></View><CoffeeKey label="More coffee controls" icon="ellipsis-horizontal" onPress={onMore} style={styles.keyCircle} /></View>
      <View style={styles.hero}><CoffeeControllerArtwork on={coffee.on} compact={compactLayout} motionAllowed={motionAllowed} /><Text accessibilityLiveRegion="polite" style={styles.status}>{coffee.status}</Text></View>
      <View style={styles.section}><Text style={styles.caption}>STRENGTH PREFERENCE</Text><View accessibilityRole="radiogroup" accessibilityLabel="Coffee strength preference" style={[styles.row, largeText && styles.rowLarge]}>
        {COFFEE_STRENGTHS.map((option) => <CoffeeKey key={option.value} label={`Coffee strength: ${option.label}`} text={option.label} selected={coffee.strength === option.value} disabled={disabled} onPress={() => choose('coffeeStrength', option.value)} style={[styles.keyWide, largeText && styles.keyLarge]} />)}
      </View></View>
      <View style={styles.section}><View style={styles.captionRow}><Text style={styles.caption}>CUP SIZE PREFERENCE</Text><Text style={styles.savedSize}>{coffee.sizeOz === null ? 'Unavailable' : `${coffee.sizeOz} oz`}</Text></View><View accessibilityRole="radiogroup" accessibilityLabel="Coffee size preference" style={[styles.row, largeText && styles.rowLarge]}>
        {COFFEE_SIZE_PRESETS.map((size) => <CoffeeKey key={size} label={`Save cup size ${size} ounces`} text={`${size} oz`} selected={coffee.sizeOz === size} disabled={disabled} onPress={() => choose('coffeeSizeOz', size)} style={[styles.keyWide, largeText && styles.keyLarge]} />)}
      </View></View>
      <View style={[styles.cups, largeText && styles.cupsLarge]}><View style={styles.cupLabel}><Text style={styles.caption}>CUPS</Text><Text style={styles.note}>Saved preference</Text></View><View style={styles.stepper}>
        <CoffeeKey label="Decrease coffee cups" icon="remove" disabled={disabled || coffee.cups === null || coffee.cups <= COFFEE_CUP_BOUNDS.min} onPress={() => step('cupsDown')} style={styles.keyStep} />
        <Text accessibilityLabel={coffee.cups === null ? 'Coffee cup count unavailable' : `Saved coffee cup count: ${coffee.cups}`} style={styles.cupValue}>{coffee.cups ?? '—'}</Text>
        <CoffeeKey label="Increase coffee cups" icon="add" disabled={disabled || coffee.cups === null || coffee.cups >= COFFEE_CUP_BOUNDS.max} onPress={() => step('cupsUp')} style={styles.keyStep} />
      </View></View>
      <CoffeeKey label={coffee.on ? 'Stop preview' : 'Brew preview'} text={coffee.on ? 'Stop preview' : 'Brew preview'} icon={coffee.on ? 'stop-outline' : 'play-outline'} disabled={disabled} style={styles.primary}
        onPress={() => { if (!disabled) client.runAction(device.id, coffee.on ? 'coffee-stop' : 'coffee-brew'); }} />
      <Text style={styles.feedback}>{COFFEE_PREVIEW_NOTE}</Text>{disabled && <Text style={styles.feedback}>View only · Controls unavailable</Text>}
    </LinearGradient></LinearGradient>
  </ScrollView>;
}
