import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { WEATHER_LABELS, type WeatherChoice } from '../../../packages/home-scene/src/renderer-lab/weather';
import type { LabWeather } from './useLabWeather';
import { labStyles as styles } from './styles';

interface WeatherPickerProps {
  choice: WeatherChoice;
  weather: LabWeather;
  motionAllowed: boolean;
  onChange: (choice: WeatherChoice) => void;
}

const OPTIONS: readonly WeatherChoice[] = ['auto', 'clear', 'light', 'heavy', 'storm'];
const SHORT_LABELS = { clear: 'Clear', light: 'Light rain', heavy: 'Heavy rain', storm: 'Storm' };
const STATUS_LABELS = { preview: 'Preview', loading: 'Loading', live: 'Live', stale: 'Last known', unavailable: 'Unavailable' };

/** Weather choices use an overlay so phone controls never push the scene into a scroll view. */
export function LabWeatherPicker({ choice, weather, motionAllowed, onChange }: WeatherPickerProps) {
  const [open, setOpen] = useState(false);
  const label = choice === 'auto' && (weather.status === 'loading' || weather.status === 'unavailable')
    ? 'Auto' : SHORT_LABELS[weather.settings.weather];

  /** Apply one preview source and immediately return focus to the compact scene controls. */
  const select = (value: WeatherChoice) => {
    if (value === 'auto' && choice === 'auto') weather.refresh();
    onChange(value);
    setOpen(false);
  };

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Weather: ${weather.title}. ${STATUS_LABELS[weather.status]}. Change weather`}
      accessibilityState={{ expanded: open }} aria-expanded={open} onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.smallButton, weather.settings.weather !== 'clear' && styles.smallButtonActive, pressed && styles.pressFeedback]}>
      <Text style={[styles.segmentText, weather.settings.weather !== 'clear' && styles.segmentSelectedText]}>{label} ⌄</Text>
      <Text style={[styles.weatherStatus, weather.settings.weather !== 'clear' && styles.segmentSelectedText]}>{STATUS_LABELS[weather.status]}</Text>
    </Pressable>
    <Modal transparent visible={open} animationType={motionAllowed ? 'fade' : 'none'} onRequestClose={() => setOpen(false)}>
      <View style={styles.weatherModal}>
        <Pressable style={styles.weatherBackdrop} accessibilityRole="button" accessibilityLabel="Close weather options" onPress={() => setOpen(false)} />
        <View style={styles.weatherCard} accessibilityViewIsModal>
          <View style={styles.weatherHeading}>
            <Text style={[styles.overlayTitle, styles.grow]}>Property weather</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Done choosing weather" onPress={() => setOpen(false)} style={styles.weatherClose}>
              <Text style={styles.buttonText}>Done</Text>
            </Pressable>
          </View>
          <View accessibilityRole="radiogroup" accessibilityLabel="Weather source" style={styles.weatherOptions}>
            {OPTIONS.map((option) => <Pressable key={option} accessibilityRole="radio"
              accessibilityLabel={option === 'auto' ? 'Automatic live weather' : `Preview ${WEATHER_LABELS[option].toLowerCase()}`}
              accessibilityState={{ checked: choice === option }} aria-checked={choice === option} onPress={() => select(option)}
              style={({ pressed }) => [styles.weatherOption, choice === option && styles.smallButtonActive, pressed && styles.pressFeedback]}>
              <Text style={[styles.buttonText, choice === option && styles.segmentSelectedText]}>{option === 'auto' ? 'Auto · Hopewell weather' : WEATHER_LABELS[option]}</Text>
              <Text style={[styles.buttonText, choice === option && styles.segmentSelectedText]}>{choice === option ? '✓' : ''}</Text>
            </Pressable>)}
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.detailDescription}>{weather.detail}</Text>
          {!motionAllowed && <Text style={styles.footnote}>Rain, plant motion, and lightning stay off. Wet surfaces remain visible.</Text>}
        </View>
      </View>
    </Modal>
  </>;
}
