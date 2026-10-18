import React from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { randomUUID } from 'expo-crypto';
import ScenesScreen from '../../screens/ScenesScreen';
import ModalActionRow from '../../components/ModalActionRow';
import LabSlider from '../renderer-lab/LabSlider';
import { useHomeStore, type Scene } from '../../store/useHomeStore';
import { virtualSceneHome } from '../scenes/sceneTestFixtures';
import { clearAssistantDraft, stageAssistantDraft } from './assistantDraftHandoff';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => require('react-native').View);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../theme/layout', () => ({ useResponsive: () => ({ width: 390, height: 844, isLandscape: false, isTablet: false, contentWidth: 390, gutter: 22, topPad: 56, scale: 1 }) }));

const initial = useHomeStore.getState();
const runScene = jest.fn(async () => undefined);

/** A brightness-only proposal must not silently acquire saved power, color or other defaults. */
function lightDraft(): Omit<Scene, 'id'> {
  return { name: 'Suggested evening', scope: 'room', roomId: 'registry-room:living',
    actions: [{ type: 'patch', deviceId: 'registry-device:living-light', patch: { brightness: 25 } }] };
}

/** Mount the actual one-use handoff and ordinary scene editor without saving the draft. */
function openDraft(draft = lightDraft()) {
  const token = stageAssistantDraft(draft, Date.now() + 60_000);
  return render(<ScenesScreen embedded assistantDraftToken={token} />);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  let sequence = 0;
  jest.mocked(randomUUID).mockImplementation(() => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`);
  const home = virtualSceneHome();
  // Deliberately different registry defaults expose accidental broadening during import/save.
  home.devices = home.devices.map((device) => device.kind === 'light'
    ? { ...device, isOn: false, brightness: 85, color: '#AABBCC', colorTempK: 4200 }
    : device.kind === 'tv' ? { ...device, isOn: false, volume: 65, channel: 9, muted: true, source: 'HDMI2' } : device);
  useHomeStore.setState({ ...home, runScene }, true);
});

afterEach(() => {
  clearAssistantDraft();
  useHomeStore.setState(initial, true);
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('import opens an editable unsaved draft and Cancel leaves the home and scenes untouched', () => {
  const devices = useHomeStore.getState().devices;
  const screen = openDraft();
  expect(screen.getByLabelText('Scene name').props.value).toBe('Suggested evening');
  expect(screen.getByText('Create')).toBeTruthy();
  expect(useHomeStore.getState().scenes).toEqual([]);
  expect(useHomeStore.getState().activeSceneId).toBeNull();
  expect(useHomeStore.getState().devices).toBe(devices);
  expect(runScene).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Cancel'));
  expect(screen.queryByLabelText('Scene name')).toBeNull();
  expect(useHomeStore.getState().scenes).toEqual([]);
  expect(useHomeStore.getState().devices).toBe(devices);
  screen.unmount();
});

test.each(['Owner', 'Member'] as const)('%s saves a brightness-only proposal without adding settings or running it', (role) => {
  const home = useHomeStore.getState();
  useHomeStore.setState({ household: [{ ...home.household[0], role }] });
  const screen = openDraft();
  fireEvent.press(screen.getByText('Create'));
  expect(useHomeStore.getState().scenes).toHaveLength(1);
  expect(useHomeStore.getState().scenes[0]).toMatchObject(lightDraft());
  expect(useHomeStore.getState().scenes[0].actions).toEqual(lightDraft().actions);
  expect(useHomeStore.getState().scenes[0].modelPreset).toBeUndefined();
  expect(useHomeStore.getState().activeSceneId).toBeNull();
  expect(runScene).not.toHaveBeenCalled();
  screen.unmount();
});

// Exercise the regular entry point as well as AI handoff under a verified Member fixture.
test('Member creates a scene manually, reopens it, and requests execution only on Run scene', async () => {
  const home = useHomeStore.getState();
  useHomeStore.setState({ household: [{ ...home.household[0], role: 'Member' }] });
  const light = home.devices.find((device) => device.id === 'registry-device:living-light')!;
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Create scene'));
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'Member evening');
  fireEvent.press(screen.getByLabelText('One room'));
  fireEvent.press(screen.getByLabelText('Scene room: Living room'));
  fireEvent.press(screen.getByLabelText(`Include ${light.name}`));
  fireEvent.press(screen.getByText('Create'));

  const saved = useHomeStore.getState().scenes;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ name: 'Member evening', scope: 'room', roomId: light.roomId });
  expect(saved[0].actions).toHaveLength(1);
  expect(saved[0].actions[0].deviceId).toBe(light.id);
  expect(useHomeStore.getState().devices).toBe(home.devices);
  expect(useHomeStore.getState().activeSceneId).toBeNull();
  expect(runScene).not.toHaveBeenCalled();
  screen.unmount();

  // Remount proves the collection reads the saved store entry; native cold-start persistence is a separate check.
  const reopened = render(<ScenesScreen embedded />);
  fireEvent.press(reopened.getByLabelText('Details for Member evening'));
  expect(runScene).not.toHaveBeenCalled();
  const detailActions = reopened.UNSAFE_getAllByType(ModalActionRow)
    .find((row) => row.props.actions.some((action: { label: string }) => action.label === 'Run scene'))!;
  await act(async () => { fireEvent.press(within(detailActions).getByText('Run scene')); });
  expect(runScene).toHaveBeenCalledTimes(1);
  expect(runScene).toHaveBeenCalledWith(saved[0].id);
  reopened.unmount();
});

test('saving a TV power-only proposal never captures its current channel, volume, mute or source', () => {
  const draft: Omit<Scene, 'id'> = { name: 'Suggested movie', scope: 'room', roomId: 'registry-room:family',
    actions: [{ type: 'patch', deviceId: 'registry-device:family-tv', patch: { isOn: true } }] };
  const screen = openDraft(draft);
  fireEvent.press(screen.getByText('Create'));
  expect(useHomeStore.getState().scenes[0].actions).toEqual(draft.actions);
  expect(useHomeStore.getState().devices.find((device) => device.modelDeviceId === 'family-tv')?.isOn).toBe(false);
  expect(runScene).not.toHaveBeenCalled();
  screen.unmount();
});

test('editing a proposed brightness changes that field without adding unrelated defaults', () => {
  const screen = openDraft();
  const slider = screen.UNSAFE_getAllByType(LabSlider).find((node) => node.props.label.endsWith(' brightness'))!;
  expect(slider.props.value).toBe(25);
  act(() => { slider.props.onValueChange(42); });
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'My evening');
  fireEvent.press(screen.getByText('Create'));
  expect(useHomeStore.getState().scenes[0]).toMatchObject({ name: 'My evening',
    actions: [{ type: 'patch', deviceId: 'registry-device:living-light', patch: { brightness: 42 } }] });
  expect(useHomeStore.getState().scenes[0].actions).toEqual([{ type: 'patch', deviceId: 'registry-device:living-light', patch: { brightness: 42 } }]);
  screen.unmount();
});

test('live registry updates during review cannot silently change the proposed actions', () => {
  const screen = openDraft();
  act(() => { useHomeStore.setState({ devices: useHomeStore.getState().devices.map((device) => ({ ...device, isOn: true, brightness: 99 })) }); });
  fireEvent.press(screen.getByText('Create'));
  expect(useHomeStore.getState().scenes[0].actions).toEqual(lightDraft().actions);
  screen.unmount();
});

test('a retained Create handler cannot save after an away-and-back home change', () => {
  const screen = openDraft();
  const save = screen.UNSAFE_getAllByType(ModalActionRow)[0].props.actions[1].onPress;
  const homeId = useHomeStore.getState().activeHomeId;
  act(() => {
    useHomeStore.setState({ activeHomeId: 'different-home' });
    useHomeStore.setState({ activeHomeId: homeId });
  });
  expect(screen.queryByLabelText('Scene name')).toBeNull();
  act(() => { save(); });
  expect(useHomeStore.getState().scenes).toEqual([]);
  expect(runScene).not.toHaveBeenCalled();
  screen.unmount();
});

test('revoked scene permission is rechecked by Save after review was already opened', () => {
  const home = useHomeStore.getState();
  useHomeStore.setState({ household: [{ ...home.household[0], role: 'Member' }] });
  const screen = openDraft();
  const save = screen.UNSAFE_getAllByType(ModalActionRow)[0].props.actions[1].onPress;
  act(() => { useHomeStore.setState({ memberPermissionOverrides: [{ memberId: home.activeMemberId, permission: 'automation.manage', allowed: false }] }); });
  act(() => { save(); });
  expect(useHomeStore.getState().scenes).toEqual([]);
  expect(runScene).not.toHaveBeenCalled();
  screen.unmount();
});

test('expired handoff tokens cannot open or save a scene draft', () => {
  const token = stageAssistantDraft(lightDraft(), Date.now() + 1000);
  act(() => { jest.advanceTimersByTime(1001); });
  const screen = render(<ScenesScreen embedded assistantDraftToken={token} />);
  expect(screen.queryByLabelText('Scene name')).toBeNull();
  expect(useHomeStore.getState().scenes).toEqual([]);
  screen.unmount();
});
