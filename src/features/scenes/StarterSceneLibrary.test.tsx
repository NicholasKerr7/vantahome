import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ScenesScreen from '../../screens/ScenesScreen';
import { useHomeStore } from '../../store/useHomeStore';
import ModalActionRow from '../../components/ModalActionRow';
import { virtualSceneHome } from './sceneTestFixtures';
import { availableStarterScenes } from './starterScenes';
import { createDefaultSimulationSnapshot } from '../../../packages/home-scene/src/simulationBridgeProtocol';
import { upgradeModelHomeCatalog } from '../three-d-home/modelHomeCatalog';
import { SimulationSession } from '../three-d-home/simulationSession';
import { simulationPersistence } from '../three-d-home/simulationPersistence';
import { createModelScenes } from '../three-d-home/modelSceneCatalog';

jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => require('react-native').View);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../theme/layout', () => ({ useResponsive: () => ({ width: 390, height: 844, isLandscape: false, isTablet: false, contentWidth: 390, gutter: 22, topPad: 56, scale: 1 }) }));

beforeEach(() => useHomeStore.setState(virtualSceneHome()));

test('preset review creates a renamed ordinary scene only after saving, then permits edit and confirmed delete', () => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Browse scene presets'));
  expect(screen.getByText('Good morning')).toBeTruthy();
  expect(useHomeStore.getState().scenes).toEqual([]);
  fireEvent.press(screen.getByLabelText('Next preset'));
  fireEvent.press(screen.getByLabelText('Review Movie time preset'));
  expect(screen.getByLabelText('Scene name').props.value).toBe('Movie time');
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'Friday movie');
  fireEvent.press(screen.getByText('Create'));
  const saved = useHomeStore.getState().scenes[0];
  expect(saved.name).toBe('Friday movie'); expect(saved.actions).toHaveLength(3);
  expect(saved.modelPreset).toBeUndefined();
  expect(useHomeStore.getState().activeSceneId).toBeNull();
  fireEvent.press(screen.getByLabelText('Details for Friday movie'));
  fireEvent.press(screen.getByText('Edit'));
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'Cinema evening');
  fireEvent.press(screen.getByText('Save'));
  fireEvent.press(screen.getByLabelText('Details for Cinema evening'));
  fireEvent.press(screen.getByLabelText('Delete Cinema evening'));
  fireEvent.press(screen.getByText('Keep scene'));
  expect(useHomeStore.getState().scenes).toHaveLength(1);
  fireEvent.press(screen.getByLabelText('Details for Cinema evening'));
  fireEvent.press(screen.getByLabelText('Delete Cinema evening'));
  fireEvent.press(screen.getByText('Delete scene'));
  expect(useHomeStore.getState().scenes).toEqual([]);
  expect(screen.queryByLabelText('Details for Cinema evening')).toBeNull();
});

test('a retained delete callback cannot act after an away-and-back identity transition', () => {
  const state = useHomeStore.getState(); const scene = { ...availableStarterScenes(state)[1].draft, id: 'movie' };
  useHomeStore.setState({ scenes: [scene] });
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Details for Movie time'));
  fireEvent.press(screen.getByLabelText('Delete Movie time'));
  const action = screen.UNSAFE_getAllByType(ModalActionRow).flatMap((node) => node.props.actions).find((action) => action.label === 'Delete scene');
  act(() => { useHomeStore.setState({ activeHomeId: 'another' }); useHomeStore.setState({ activeHomeId: 'scene-home' }); });
  act(() => action.onPress());
  expect(useHomeStore.getState().scenes).toEqual([scene]);
  expect(screen.queryByText('Delete this scene?')).toBeNull();
});

test('Guests do not receive the starter library or deletion controls', () => {
  const state = useHomeStore.getState();
  useHomeStore.setState({ household: [{ ...state.household[0], role: 'Guest' }], roomMembers: [{ memberId: 'scene-owner', roomIds: ['registry-room:living'] }] });
  const screen = render(<ScenesScreen embedded />);
  expect(screen.queryByLabelText('Browse scene presets')).toBeNull();
});

test('a removed model binding during editing produces a recoverable error instead of saving invalid actions', () => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Browse scene presets'));
  fireEvent.press(screen.getByLabelText('Next preset'));
  fireEvent.press(screen.getByLabelText('Review Movie time preset'));
  act(() => { useHomeStore.setState({ devices: useHomeStore.getState().devices.map((device) => device.modelDeviceId === 'family-tv' ? { ...device, modelDeviceId: undefined } : device) }); });
  expect(() => fireEvent.press(screen.getByText('Create'))).not.toThrow();
  expect(screen.getByText('This device is no longer linked to the 3D home. Review the scene before saving.')).toBeTruthy();
  expect(useHomeStore.getState().scenes).toEqual([]);
});

test('movie editor sliders expose their device labels and actual saved values', () => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Browse scene presets'));
  expect(screen.getByLabelText('Dismiss scene presets')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Next preset'));
  fireEvent.press(screen.getByLabelText('Review Movie time preset'));
  expect(screen.getByLabelText('Television volume').props.accessibilityValue).toMatchObject({ min: 0, max: 100, now: 25, text: '25 percent' });
  expect(screen.getByLabelText('Family ceiling light brightness').props.accessibilityValue).toMatchObject({ now: 15 });
  expect(screen.getByLabelText('Pendant light brightness').props.accessibilityValue).toMatchObject({ now: 20 });
});

test('an edited demo movie scene preserves TV Off in both the saved commands and rendered simulation', async () => {
  const snapshot = createDefaultSimulationSnapshot();
  const initial = { ...useHomeStore.getState(), accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null,
    realtime: { enabled: false, useMqtt: false, wsUrl: '' }, modelCatalogVersion: undefined, scenes: [] };
  useHomeStore.setState({ ...initial, ...upgradeModelHomeCatalog(initial, snapshot) });
  simulationPersistence.save('demo', snapshot);
  const session = new SimulationSession(jest.fn(), jest.fn());
  session.handleMessage({ channel: 'vantahome-simulation', version: 1, type: 'request' });
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  const screen = render(<ScenesScreen embedded />);
  try {
    fireEvent.press(screen.getByLabelText('Browse scene presets'));
    fireEvent.press(screen.getByLabelText('Next preset'));
    fireEvent.press(screen.getByLabelText('Review Movie time preset'));
    expect(screen.queryByLabelText('Include Family smoke sensor')).toBeNull();
    fireEvent.press(screen.getAllByText('Off')[0]);
    fireEvent.press(screen.getByText('Create'));
    const saved = useHomeStore.getState().scenes[0];
    expect(saved.actions.find((action) => action.deviceId === 'family-tv')).toMatchObject({ patch: { isOn: false } });
    await act(async () => { await useHomeStore.getState().runScene(saved.id); });
    expect(useHomeStore.getState().devices.find((device) => device.id === 'family-tv')?.isOn).toBe(false);
    expect((await simulationPersistence.load('demo')).deviceStates['family-tv'].on).toBe(false);
  } finally { session.dispose(); }
});

test('renaming a complete authored demo preset retains its original atmosphere while monitor power choices stay hidden', () => {
  const initial = { ...useHomeStore.getState(), accountUserId: null, authenticatedUserId: null, accountHomeId: null, activeHomeId: null,
    realtime: { enabled: false, useMqtt: false, wsUrl: '' }, modelCatalogVersion: undefined, scenes: [] };
  const preset = createModelScenes().find((scene) => scene.modelPreset === 'night')!;
  useHomeStore.setState({ ...initial, ...upgradeModelHomeCatalog(initial, createDefaultSimulationSnapshot()), scenes: [preset] });
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Details for Good night'));
  fireEvent.press(screen.getByText('Edit'));
  expect(screen.queryByLabelText('Include Family smoke sensor')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'Evening rest');
  fireEvent.press(screen.getByText('Save'));
  expect(useHomeStore.getState().scenes[0]).toMatchObject({ name: 'Evening rest', modelPreset: 'night', actions: preset.actions });
});
