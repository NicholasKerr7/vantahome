import React from 'react';
import { ScrollView, Text, TextInput } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { PROPERTY_LOCATION, type WeatherLocation } from '../../../packages/home-scene/src/environment/types';
import Pressable from '../../components/Pressable';
import { useHomeStore } from '../../store/useHomeStore';
import type { HomeWeatherSettings as SavedSettings } from '../../services/homeWeather';
import type { HomeWeatherSettingsState } from './useHomeWeatherSettings';
import HomeWeatherSettings from './HomeWeatherSettings';

const mockSave = jest.fn<Promise<SavedSettings>, [WeatherLocation]>();
const mockReset = jest.fn<Promise<void>, []>();
const mockReload = jest.fn();
let mockModel: HomeWeatherSettingsState;
jest.mock('./useHomeWeatherSettings', () => ({ useHomeWeatherSettings: () => mockModel }));
jest.mock('../../services/supabaseClient', () => ({ supabase: null }));
jest.mock('../../services/homeWeather', () => ({
  ...jest.requireActual('../../services/homeWeather'),
  saveHomeWeatherSettings: (location: WeatherLocation) => mockSave(location),
  resetHomeWeatherSettings: () => mockReset(),
}));

const initialStore = useHomeStore.getState();
const CONSENT = 'I confirm the location and agree to share these coordinates';
type TestNode = { props: {
  accessibilityLabel?: string; children?: React.ReactNode; disabled?: boolean; editable?: boolean;
  onPress: () => void; onChangeText: (value: string) => void; onFocus: () => void;
} };

/** Look up the same labelled action that VoiceOver and keyboard navigation expose. */
function action(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType(Pressable).find((node: TestNode) => node.props.accessibilityLabel === label);
}

/** Edit a native field through its public input callback without touching internal state. */
function typeField(tree: ReactTestRenderer, label: string, text: string): void {
  act(() => { tree.root.findAllByType(TextInput).find((node: TestNode) => node.props.accessibilityLabel === label)!.props.onChangeText(text); });
}

/** Read rendered native text for validation and confirmed-result assertions. */
function textContent(tree: ReactTestRenderer): string {
  return tree.root.findAllByType(Text).map((node: TestNode) => React.Children.toArray(node.props.children).join('')).join(' ');
}

describe('Owner property weather editor', () => {
  let tree: ReactTestRenderer | undefined;
  const onEditingChange = jest.fn();

  /** Render the editor after each test selects an independently verified account and settings state. */
  function renderEditor(): ReactTestRenderer {
    act(() => { tree = renderer.create(<HomeWeatherSettings onEditingChange={onEditingChange} />); });
    return tree!;
  }

  /** Open the first review page from an explicitly labelled town fallback. */
  function startEdit(): ReactTestRenderer {
    const result = renderEditor();
    act(() => { action(result, 'Set property location')!.props.onPress(); });
    return result;
  }

  /** Review coordinates and the property time zone on separate, keyboard-independent pages. */
  function reviewLocation(result: ReactTestRenderer): void {
    act(() => { action(result, 'Next')!.props.onPress(); });
    expect(textContent(result)).toContain('2 / 3 · PROPERTY TIME ZONE');
    act(() => { action(result, 'Next')!.props.onPress(); });
    expect(textContent(result)).toContain('3 / 3 · REVIEW & SHARE');
  }

  beforeEach(() => {
    jest.clearAllMocks();
    useHomeStore.setState({ ...initialStore, sessionEpoch: 1, authenticatedUserId: 'owner', accountUserId: 'owner',
      activeHomeId: 'home', accountHomeId: 'home', membershipReady: true, activeMemberId: 'owner',
      household: [{ id: 'owner', name: 'Owner', role: 'Owner', status: 'home' }] });
    mockModel = { location: PROPERTY_LOCATION, configured: false, loading: false, error: null, canManage: true, reload: mockReload };
    mockSave.mockImplementation(async (location) => {
      mockModel = { ...mockModel, location, configured: true };
      return { location, updatedAt: '2026-10-08T00:00:00Z' };
    });
    mockReset.mockImplementation(async () => { mockModel = { ...mockModel, location: PROPERTY_LOCATION, configured: false }; });
  });

  afterEach(() => {
    if (tree) act(() => { tree?.unmount(); });
    tree = undefined;
  });

  it('identifies the town fallback and blocks edits while loading, unavailable or not Owner', () => {
    const result = renderEditor();
    expect(textContent(result)).toContain('TOWN FALLBACK');
    expect(result.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(result.root.findAllByType(TextInput)).toHaveLength(0);
    mockModel = { ...mockModel, location: null, loading: true };
    act(() => { result.update(<HomeWeatherSettings />); });
    expect(action(result, 'Set property location')).toBeUndefined();
    mockModel = { ...mockModel, loading: false, error: 'Settings unavailable.' };
    act(() => { result.update(<HomeWeatherSettings />); });
    act(() => { action(result, 'Retry weather settings')!.props.onPress(); });
    expect(mockReload).toHaveBeenCalledTimes(1);
    mockModel = { ...mockModel, error: null, canManage: false };
    act(() => { result.update(<HomeWeatherSettings />); });
    expect(action(result, 'Set property location')).toBeUndefined();
    expect(textContent(result)).toContain('Only the home Owner');
  });

  it('keeps invalid coordinates on page one with precise field errors', () => {
    const result = startEdit();
    typeField(result, 'Location name', '');
    typeField(result, 'Latitude', '91');
    typeField(result, 'Longitude', '');
    act(() => { action(result, 'Next')!.props.onPress(); });
    expect(textContent(result)).toContain('Enter a name from 1 to 120 characters.');
    expect(textContent(result)).toContain('Use a number from −90 to 90.');
    expect(textContent(result)).toContain('Use a number from −180 to 180.');
    expect(action(result, CONSENT)).toBeUndefined();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('requires fresh consent, validates the time zone and sends only the reviewed values', async () => {
    const result = startEdit();
    typeField(result, 'Location name', ' My home ');
    typeField(result, 'Latitude', '18.5');
    typeField(result, 'Longitude', '-78.1');
    act(() => { action(result, 'Next')!.props.onPress(); });
    expect(action(result, CONSENT)).toBeUndefined();
    typeField(result, 'Property time zone', 'Wrong/Zone');
    act(() => { action(result, 'Next')!.props.onPress(); });
    expect(textContent(result)).toContain('Use a time zone such as America/Jamaica.');
    expect(mockSave).not.toHaveBeenCalled();
    typeField(result, 'Property time zone', 'America/Jamaica');
    act(() => { action(result, 'Next')!.props.onPress(); });
    expect(action(result, 'Save location')!.props.disabled).toBe(true);
    act(() => { action(result, 'Save location')!.props.onPress(); });
    expect(mockSave).not.toHaveBeenCalled();
    act(() => { action(result, CONSENT)!.props.onPress(); });
    act(() => { action(result, 'Back')!.props.onPress(); });
    typeField(result, 'Property time zone', 'America/Jamaica');
    act(() => { action(result, 'Next')!.props.onPress(); });
    expect(action(result, 'Save location')!.props.disabled).toBe(true);
    act(() => { action(result, CONSENT)!.props.onPress(); });
    await act(async () => { action(result, 'Save location')!.props.onPress(); });
    expect(mockSave).toHaveBeenCalledWith({ name: 'My home', latitude: 18.5, longitude: -78.1, timeZone: 'America/Jamaica' });
    expect(textContent(result)).toContain('Weather location saved for this home.');
    expect(textContent(result)).toContain('OWNER-CONFIRMED LOCATION');
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('coalesces double presses and keeps the final review locked during saving', async () => {
    let resolve!: (settings: SavedSettings) => void;
    mockSave.mockImplementation(() => new Promise((finish) => { resolve = finish; }));
    const result = startEdit();
    reviewLocation(result);
    act(() => { action(result, CONSENT)!.props.onPress(); });
    const save = action(result, 'Save location')!.props.onPress;
    act(() => { save(); save(); });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(action(result, 'Saving…')!.props.disabled).toBe(true);
    expect(action(result, 'Cancel')!.props.disabled).toBe(true);
    expect(action(result, CONSENT)!.props.disabled).toBe(true);
    expect(action(result, 'Back')!.props.disabled).toBe(true);
    expect(result.root.findAllByType(TextInput)).toHaveLength(0);
    await act(async () => { resolve({ location: PROPERTY_LOCATION, updatedAt: '2026-10-08T00:00:00Z' }); });
    expect(textContent(result)).toContain('OWNER-CONFIRMED LOCATION');
  });

  it('reports save errors without exposing service details and retains the review for retry or cancel', async () => {
    mockSave.mockRejectedValue(new Error('private provider details'));
    const result = startEdit();
    reviewLocation(result);
    act(() => { action(result, CONSENT)!.props.onPress(); });
    await act(async () => { action(result, 'Save location')!.props.onPress(); });
    expect(textContent(result)).toContain('Could not save.');
    expect(textContent(result)).not.toContain('private provider');
    expect(action(result, 'Save location')!.props.disabled).toBe(false);
    act(() => { action(result, 'Cancel')!.props.onPress(); });
    expect(textContent(result)).toContain('TOWN FALLBACK');
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('confirms reset separately and changes the displayed source only after success', async () => {
    mockModel = { ...mockModel, configured: true, location: { ...PROPERTY_LOCATION, name: 'Home' } };
    const result = renderEditor();
    act(() => { action(result, 'Use town fallback')!.props.onPress(); });
    expect(mockReset).not.toHaveBeenCalled();
    expect(textContent(result)).toContain('Future weather requests use public town coordinates.');
    await act(async () => { action(result, 'Restore town weather')!.props.onPress(); });
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(textContent(result)).toContain('TOWN FALLBACK');
    expect(textContent(result)).toContain('Town fallback restored.');
  });

  it('rejects a retained save callback after the Owner role has been revoked', () => {
    const result = startEdit();
    reviewLocation(result);
    act(() => { action(result, CONSENT)!.props.onPress(); });
    const save = action(result, 'Save location')!.props.onPress;
    useHomeStore.setState({ household: [{ id: 'owner', name: 'Member', role: 'Member', status: 'home' }] });
    act(() => { save(); });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('provides a keyboard completion action without scrolling or submitting coordinates', () => {
    const result = startEdit();
    act(() => { result.root.findAllByType(TextInput).find((node: TestNode) => node.props.accessibilityLabel === 'Latitude')!.props.onFocus(); });
    expect(action(result, 'Done typing')).toBeTruthy();
    expect(result.root.findAllByType(ScrollView)).toHaveLength(0);
    act(() => { action(result, 'Done typing')!.props.onPress(); });
    expect(action(result, 'Next')).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
  });
});
