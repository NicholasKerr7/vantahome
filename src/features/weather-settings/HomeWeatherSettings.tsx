import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { PROPERTY_LOCATION, type WeatherLocation } from '../../../packages/home-scene/src/environment/types';
import Pressable from '../../components/Pressable';
import { canManageHomeWeather, resetHomeWeatherSettings, saveHomeWeatherSettings } from '../../services/homeWeather';
import { useHomeStore } from '../../store/useHomeStore';
import { theme } from '../../theme/theme';
import { useHomeWeatherSettings } from './useHomeWeatherSettings';
import { homeWeatherSettingsStyles as styles } from './homeWeatherSettingsStyles';
import {
  validateWeatherLocationDraft, weatherLocationDraft,
  type WeatherLocationDraft, type WeatherLocationErrors, type WeatherLocationField,
} from './homeWeatherForm';

type Page = 'summary' | 'coordinates' | 'timeZone' | 'consent' | 'reset';
type PendingAction = 'save' | 'reset' | null;
type Notice = { error: boolean; text: string } | null;
type Props = { onEditingChange?: (editing: boolean) => void };
type ConfirmedChange = {
  previousLocation: WeatherLocation | null; previousConfigured: boolean;
  location: WeatherLocation; configured: boolean;
};

/** Keep every form action touch-sized and expose its disabled state to assistive technology. */
function WeatherAction({ label, accessibilityLabel = label, onPress, primary = false, disabled = false }: {
  label: string; accessibilityLabel?: string; onPress: () => void; primary?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.action, primary && styles.primaryAction, disabled && styles.disabled]}>
    <Text style={[styles.actionLabel, primary && styles.primaryLabel]}>{label}</Text>
  </Pressable>;
}

/** Label native inputs and keep field validation beside the value that needs correction. */
function WeatherField({ field, label, draft, errors, focused, pending, onChange, onFocus, onBlur, onDone, standalone = false }: {
  field: WeatherLocationField; label: string; draft: WeatherLocationDraft; errors: WeatherLocationErrors;
  focused: WeatherLocationField | null; pending: boolean; onChange: (field: WeatherLocationField, text: string) => void;
  onFocus: (field: WeatherLocationField) => void; onBlur: () => void; onDone: () => void; standalone?: boolean;
}) {
  const error = errors[field];
  return <View style={[styles.field, standalone && styles.standaloneField, focused !== null && focused !== field && styles.hidden]}>
    <Text nativeID={`weather-${field}-label`} style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} accessibilityLabelledBy={`weather-${field}-label`}
      accessibilityHint={error} value={draft[field]} editable={!pending} onChangeText={(text) => onChange(field, text)}
      onFocus={() => onFocus(field)} onBlur={onBlur} onSubmitEditing={onDone} returnKeyType="done"
      autoCapitalize={field === 'name' ? 'words' : 'none'} autoCorrect={false}
      keyboardType={field === 'latitude' || field === 'longitude' ? 'numbers-and-punctuation' : 'default'}
      maxLength={field === 'name' ? 120 : field === 'timeZone' ? 80 : 24}
      placeholderTextColor={theme.colors.muted}
      style={[styles.input, focused === field && styles.focusedInput, Boolean(error) && styles.invalidInput]} />
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

/** Let the verified Owner review precise coordinates and provider consent before any shared write. */
export default function HomeWeatherSettings({ onEditingChange }: Props) {
  const model = useHomeWeatherSettings();
  const { height } = useWindowDimensions();
  const [page, setPage] = useState<Page>('summary');
  const [draft, setDraft] = useState(() => weatherLocationDraft(PROPERTY_LOCATION));
  const [errors, setErrors] = useState<WeatherLocationErrors>({});
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmation, setConfirmation] = useState<ConfirmedChange | null>(null);
  const [focused, setFocused] = useState<WeatherLocationField | null>(null);
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  const editingCallback = useRef(onEditingChange);
  editingCallback.current = onEditingChange;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; editingCallback.current?.(false); };
  }, []);
  useEffect(() => { onEditingChange?.(page !== 'summary' || focused !== null); }, [page, focused, onEditingChange]);
  // A verified write can complete before the read subscription; stop overriding as soon as that read changes.
  const currentConfirmation = confirmation?.previousLocation === model.location && confirmation.previousConfigured === model.configured
    ? confirmation : null;
  const location = currentConfirmation?.location ?? model.location ?? PROPERTY_LOCATION;
  const configured = currentConfirmation?.configured ?? model.configured;

  /** Shrink to the active field while the keyboard is visible; the parent removes its category index. */
  function focusField(field: WeatherLocationField | null) {
    setFocused(field);
  }

  /** Restore the complete current page after typed input without submitting an unreviewed value. */
  function dismissKeyboard() {
    Keyboard.dismiss();
    focusField(null);
  }

  /** Discard unsaved edits; opening the form always starts from the latest verified configuration. */
  function cancel() {
    if (pendingRef.current) return;
    dismissKeyboard(); setPage('summary'); setConsent(false); setErrors({}); setNotice(null);
  }

  /** Start only after configuration is loaded, never guessing a saved property's coordinates. */
  function beginEdit() {
    if (model.loading || model.error || !model.canManage || !canManageHomeWeather(useHomeStore.getState())) return;
    setDraft(weatherLocationDraft(location));
    setConsent(false); setErrors({}); setNotice(null); setPage('coordinates');
  }

  /** Any changed value invalidates prior consent and its field's obsolete validation message. */
  function changeField(field: WeatherLocationField, value: string) {
    if (pendingRef.current) return;
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setConsent(false); setNotice(null);
  }

  /** Keep malformed coordinates on their input page before requesting provider consent. */
  function reviewCoordinates() {
    dismissKeyboard();
    const validation = validateWeatherLocationDraft(draft);
    const coordinateErrors = { name: validation.errors.name, latitude: validation.errors.latitude, longitude: validation.errors.longitude };
    setErrors(coordinateErrors);
    if (Object.values(coordinateErrors).some(Boolean)) return;
    setPage('timeZone'); setConsent(false); setNotice(null);
  }

  /** Validate the time zone on its own short page before displaying the final sharing review. */
  function reviewTimeZone() {
    dismissKeyboard();
    const validation = validateWeatherLocationDraft(draft);
    setErrors({ timeZone: validation.errors.timeZone });
    if (validation.errors.timeZone) return;
    setPage('consent'); setConsent(false); setNotice(null);
  }

  /** Write once, retain failures for retry, and ignore UI results after this account's editor unmounts. */
  async function save() {
    if (pendingRef.current || !model.canManage || !canManageHomeWeather(useHomeStore.getState()) || !consent) return;
    const validation = validateWeatherLocationDraft(draft);
    setErrors(validation.errors);
    if (!validation.location) {
      if (validation.errors.name || validation.errors.latitude || validation.errors.longitude) setPage('coordinates');
      else setPage('timeZone');
      return;
    }
    dismissKeyboard(); pendingRef.current = true; setPending('save'); setNotice(null);
    try {
      const saved = await saveHomeWeatherSettings(validation.location);
      if (!mounted.current) return;
      setConfirmation({ previousLocation: model.location, previousConfigured: model.configured, location: saved.location, configured: true });
      setPage('summary'); setConsent(false);
      setNotice({ error: false, text: 'Weather location saved for this home.' });
    } catch {
      if (mounted.current) setNotice({ error: true, text: 'Could not save. Check your connection and Owner access, then try again.' });
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(null);
    }
  }

  /** Revoke the saved location only after the Owner explicitly confirms the public town fallback. */
  async function reset() {
    if (pendingRef.current || !model.canManage || !canManageHomeWeather(useHomeStore.getState())) return;
    pendingRef.current = true; setPending('reset'); setNotice(null);
    try {
      await resetHomeWeatherSettings();
      if (!mounted.current) return;
      setConfirmation({ previousLocation: model.location, previousConfigured: model.configured, location: PROPERTY_LOCATION, configured: false });
      setPage('summary'); setConsent(false);
      setNotice({ error: false, text: 'Town fallback restored. Saved property coordinates removed.' });
    } catch {
      if (mounted.current) setNotice({ error: true, text: 'Could not restore town weather. Check your connection and try again.' });
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(null);
    }
  }

  if (!model.canManage) return <Text style={styles.description}>Only the home Owner can change the weather location.</Text>;
  if (model.loading && page === 'summary') return <Text accessibilityLiveRegion="polite" style={styles.description}>Loading weather location…</Text>;
  if (model.error && page === 'summary') return <View style={styles.content}>
    <Text accessibilityRole="alert" style={styles.error}>{model.error}</Text>
    <View style={styles.actions}><WeatherAction label="Retry weather settings" onPress={model.reload} /></View>
  </View>;

  const fieldProps = { draft, errors, focused, pending: pending !== null, onChange: changeField, onFocus: focusField, onBlur: () => focusField(null), onDone: dismissKeyboard };
  return <View style={[styles.content, height < 720 && styles.compactContent]}>
    {page === 'summary' && <>
      <Text style={styles.step}>{configured ? 'OWNER-CONFIRMED LOCATION' : 'TOWN FALLBACK'}</Text>
      <Text numberOfLines={2} style={styles.locationName}>{location.name}</Text>
      <Text numberOfLines={2} style={styles.coordinates}>{location.latitude}, {location.longitude}</Text>
      <Text numberOfLines={2} style={styles.detail}>{location.timeZone}</Text>
      {!notice && <Text style={styles.description}>{configured ? 'Open-Meteo estimates weather for this location. It does not measure conditions at your home.' : 'Using public Hopewell town coordinates. Your property location has not been set.'}</Text>}
      <View style={styles.actions}><WeatherAction label={configured ? 'Edit location' : 'Set property location'} accessibilityLabel={configured ? 'Edit weather location' : 'Set property location'} primary onPress={beginEdit} />
        {configured && <WeatherAction label="Use town fallback" onPress={() => { setNotice(null); setPage('reset'); }} />}</View>
    </>}
    {page === 'coordinates' && <>
      {!focused && <><Text style={styles.step}>1 / 3 · PROPERTY LOCATION</Text>
        <Text style={styles.detail}>{configured ? 'Enter the property coordinates, even if you are away from home.' : 'These starting values are Hopewell town centre. Enter the property coordinates.'}</Text></>}
      <WeatherField {...fieldProps} standalone field="name" label="Location name" />
      <View style={[styles.fieldRow, focused === 'name' && styles.hidden]}>
        <WeatherField {...fieldProps} field="latitude" label="Latitude" />
        <WeatherField {...fieldProps} field="longitude" label="Longitude" />
      </View>
      {!focused && <Text style={styles.detail}>Type coordinates manually. The phone’s location is never used.</Text>}
      <View style={styles.actions}><WeatherAction label="Cancel" onPress={cancel} />
        <WeatherAction label={focused ? 'Done typing' : 'Next'} primary onPress={focused ? dismissKeyboard : reviewCoordinates} /></View>
    </>}
    {page === 'timeZone' && <>
      {!focused && <><Text style={styles.step}>2 / 3 · PROPERTY TIME ZONE</Text>
        <Text style={styles.detail}>Use the time zone at the property, even when you are away from home.</Text></>}
      <WeatherField {...fieldProps} standalone field="timeZone" label="Property time zone" />
      <View style={styles.actions}>
        {!focused && <WeatherAction label="Back" onPress={() => { setPage('coordinates'); setNotice(null); }} />}
        <WeatherAction label="Cancel" onPress={cancel} />
        <WeatherAction label={focused ? 'Done typing' : 'Next'} primary onPress={focused ? dismissKeyboard : reviewTimeZone} />
      </View>
    </>}
    {page === 'consent' && <>
      <Text style={styles.step}>3 / 3 · REVIEW & SHARE</Text>
      <View style={styles.review}>
        <Text numberOfLines={2} style={styles.reviewName}>{draft.name.trim()}</Text>
        <Text numberOfLines={2} style={styles.detail}>{Number(draft.latitude)}, {Number(draft.longitude)}</Text>
        <Text numberOfLines={2} style={styles.detail}>{draft.timeZone.trim()}</Text>
      </View>
      <View style={styles.notice}><Text style={styles.detail}>Share these precise coordinates with authorized household members and send them to Open-Meteo for weather.</Text></View>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="I confirm the location and agree to share these coordinates" accessibilityState={{ checked: consent, disabled: pending !== null }}
        disabled={pending !== null} onPress={() => setConsent((current) => !current)} style={[styles.consent, consent && styles.consentSelected]}>
        <View accessible={false} style={styles.checkbox}>{consent && <Text style={styles.checkmark}>✓</Text>}</View>
        <Text style={styles.consentLabel}>I confirm and agree.</Text>
      </Pressable>
      <View style={styles.actions}>
        <WeatherAction label="Back" disabled={pending !== null} onPress={() => { setPage('timeZone'); setConsent(false); setNotice(null); }} />
        <WeatherAction label="Cancel" disabled={pending !== null} onPress={cancel} />
        <WeatherAction label={pending === 'save' ? 'Saving…' : 'Save'} accessibilityLabel={pending === 'save' ? 'Saving…' : 'Save location'} primary
          disabled={pending !== null || !consent} onPress={() => { void save(); }} />
      </View>
    </>}
    {page === 'reset' && <>
      <Text style={styles.locationName}>Use Hopewell town weather?</Text>
      <Text style={styles.description}>This removes this home’s saved property coordinates and consent. Future weather requests use public town coordinates.</Text>
      <View style={styles.actions}><WeatherAction label="Cancel" disabled={pending !== null} onPress={cancel} />
        <WeatherAction label={pending === 'reset' ? 'Restoring…' : 'Restore town weather'} primary disabled={pending !== null} onPress={() => { void reset(); }} /></View>
    </>}
    {notice && <Text accessibilityRole={notice.error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={notice.error ? styles.error : styles.success}>{notice.text}</Text>}
  </View>;
}
