import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ScenesScreen from '../ScenesScreen';
import ModalCard from '../../components/ModalCard';
import ModalActionRow from '../../components/ModalActionRow';
import Pressable from '../../components/Pressable';
import { ScrollView, StyleSheet } from 'react-native';
import { useHomeStore, type HomeState, type Scene } from '../../store/useHomeStore';

jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => require('react-native').View);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../theme/layout', () => ({ useResponsive: () => ({ width: 390, height: 844, isLandscape: false, isTablet: false, contentWidth: 390, gutter: 22, topPad: 56, scale: 1 }) }));

const legacyScene: Scene = { id: 'evening', name: 'Evening', roomId: 'living', actions: [{ type: 'patch', deviceId: 'lamp', patch: { isOn: true, brightness: 35 } }] };
const wholeScene: Scene = { id: 'night', name: 'Good night', roomId: '', scope: 'home', actions: [...legacyScene.actions, { type: 'patch', deviceId: 'bedside', patch: { isOn: false, brightness: 20 } }] };

/** Inspect web ARIA inputs before native Pressable translates them into accessibilityState. */
function choice(screen: ReturnType<typeof render>, label: string) {
  return screen.UNSAFE_getAllByType(Pressable).find((node) => node.props.accessibilityLabel === label)!;
}

beforeEach(() => {
  useHomeStore.setState({
    accountUserId: null, accountHomeId: null, authenticatedUserId: null, activeHomeId: null, sessionEpoch: 0,
    membershipReady: true, activeMemberId: 'owner', activeSceneId: null,
    household: [{ id: 'owner', name: 'Owner', role: 'Owner', status: 'home' }],
    roomMembers: [], memberPermissionOverrides: [],
    rooms: [{ id: 'living', name: 'Living room' }, { id: 'bedroom', name: 'Bedroom' }],
    devices: [
      { id: 'lamp', name: 'Lamp', roomId: 'living', kind: 'light', isOn: true, brightness: 65 },
      { id: 'bedside', name: 'Bedside', roomId: 'bedroom', kind: 'light', isOn: false, brightness: 20 },
    ],
    scenes: [legacyScene, wholeScene],
  });
});

test('creates a whole-home scene with selections retained across room filters', () => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Create scene'));
  expect(choice(screen, 'Whole home').props['aria-checked']).toBe(true);
  expect(choice(screen, 'Scene room: All rooms').props['aria-checked']).toBe(true);
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'Entertain');
  fireEvent.press(screen.getByLabelText('Scene room: Living room'));
  fireEvent.press(screen.getByLabelText('Include Lamp'));
  fireEvent.press(screen.getByLabelText('Scene room: Bedroom'));
  fireEvent.press(screen.getByLabelText('Include Bedside'));
  fireEvent.press(screen.getByLabelText('Scene room: Living room'));
  expect(screen.getByLabelText('Include Lamp').props.accessibilityState.checked).toBe(true);
  expect(choice(screen, 'Include Lamp').props['aria-checked']).toBe(true);
  expect(screen.getByText('2 devices selected across your home')).toBeTruthy();
  fireEvent.press(screen.getByText('Create'));
  const scene = useHomeStore.getState().scenes.find((entry) => entry.name === 'Entertain');
  expect(scene).toMatchObject({ scope: 'home', roomId: '' });
  expect(scene?.actions.map((action) => action.deviceId)).toEqual(['lamp', 'bedside']);
});

test('edits a whole-home scene without dropping devices or saved values from another room', () => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Details for Good night'));
  fireEvent.press(screen.getByText('Edit'));
  expect(screen.getByRole('radio', { name: 'Whole home' }).props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByLabelText('Scene room: Bedroom'));
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'Rest');
  fireEvent.press(screen.getByText('Save'));
  expect(useHomeStore.getState().scenes.find((scene) => scene.id === 'night')).toMatchObject({ name: 'Rest', scope: 'home', roomId: '', actions: wholeScene.actions });
});

test('preserves the original room and values when editing an existing room scene', () => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Next scenes page'));
  fireEvent.press(screen.getByLabelText('Details for Evening'));
  fireEvent.press(screen.getByText('Edit'));
  expect(screen.getByRole('radio', { name: 'One room' }).props.accessibilityState.checked).toBe(true);
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'Evening lights');
  fireEvent.press(screen.getByText('Save'));
  expect(useHomeStore.getState().scenes.find((scene) => scene.id === 'evening')).toMatchObject({ roomId: 'living', scope: 'room', name: 'Evening lights', actions: legacyScene.actions });
});

test('restricted members cannot inspect or select hidden-room scene devices', () => {
  useHomeStore.setState({ household: [{ id: 'guest', name: 'Guest', role: 'Guest', status: 'home' }], activeMemberId: 'guest', roomMembers: [{ memberId: 'guest', roomIds: ['living'] }] });
  const screen = render(<ScenesScreen embedded />);
  expect(screen.queryByLabelText('Details for Good night')).toBeNull();
  expect(screen.getByLabelText('Details for Evening')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Create scene'));
  expect(screen.queryByLabelText('Scene room: Bedroom')).toBeNull();
  expect(screen.queryByLabelText('Include Bedside')).toBeNull();
});

test('closes an editor when access to one of its whole-home devices is revoked', () => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Details for Good night'));
  fireEvent.press(screen.getByText('Edit'));
  act(() => { useHomeStore.setState({ household: [{ id: 'guest', name: 'Guest', role: 'Guest', status: 'home' }], activeMemberId: 'guest', roomMembers: [{ memberId: 'guest', roomIds: ['living'] }] }); });
  expect(screen.UNSAFE_getAllByType(ModalCard)[0].props.visible).toBe(false);
  expect(screen.queryByLabelText('Scene name')).toBeNull();
  expect(screen.queryByLabelText('Details for Good night')).toBeNull();
  expect(useHomeStore.getState().scenes.find((scene) => scene.id === 'night')).toEqual(wholeScene);
});

test.each([
  { accountUserId: 'another-account' }, { authenticatedUserId: 'another-user' },
  { accountHomeId: 'another-house' }, { activeHomeId: 'another-house' },
  { sessionEpoch: 1 }, { membershipReady: false },
  { activeMemberId: 'other-owner', household: [{ id: 'other-owner', name: 'Other owner', role: 'Owner', status: 'home' }] },
] satisfies Partial<HomeState>[])('closes and clears a new scene on household identity change even with reused device IDs %#', (change) => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Create scene'));
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'Private draft');
  fireEvent.press(screen.getByLabelText('Include Lamp'));
  const save = screen.UNSAFE_getAllByType(ModalActionRow)[0].props.actions[1].onPress;
  const before = useHomeStore.getState().scenes;
  act(() => { useHomeStore.setState(change); });
  expect(screen.UNSAFE_getAllByType(ModalCard)[0].props.visible).toBe(false);
  act(() => { save(); });
  expect(useHomeStore.getState().scenes).toBe(before);
  fireEvent.press(screen.getByLabelText('Create scene'));
  expect(screen.getByLabelText('Scene name').props.value).toBe('');
});

test('latches an away-and-back home change and rejects a previous editor callback after reopening', () => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Details for Good night'));
  fireEvent.press(screen.getByText('Edit'));
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'Private edit');
  const save = screen.UNSAFE_getAllByType(ModalActionRow)[0].props.actions[1].onPress;
  const before = useHomeStore.getState().scenes;
  act(() => {
    useHomeStore.setState({ activeHomeId: 'temporary-home' });
    useHomeStore.setState({ activeHomeId: null });
  });
  expect(screen.UNSAFE_getAllByType(ModalCard)[0].props.visible).toBe(false);
  fireEvent.press(screen.getByLabelText('Create scene'));
  act(() => { save(); });
  expect(useHomeStore.getState().scenes).toBe(before);
  expect(screen.getByLabelText('Scene name').props.value).toBe('');
});

test('keeps normal telemetry from discarding a draft and keeps save controls outside scrolling content', () => {
  const screen = render(<ScenesScreen embedded />);
  fireEvent.press(screen.getByLabelText('Create scene'));
  fireEvent.changeText(screen.getByLabelText('Scene name'), 'Telemetry-safe draft');
  fireEvent.press(screen.getByLabelText('Include Lamp'));
  act(() => { useHomeStore.setState({ devices: useHomeStore.getState().devices.map((device) => ({ ...device, brightness: 42 })) }); });
  expect(screen.getByLabelText('Scene name').props.value).toBe('Telemetry-safe draft');
  expect(choice(screen, 'Include Lamp').props['aria-checked']).toBe(true);
  const modal = screen.UNSAFE_getAllByType(ModalCard)[0];
  expect(modal.props.animationType).toBe('none');
  expect(StyleSheet.flatten(modal.props.cardStyle).maxHeight).toBe(808);
  const children = React.Children.toArray(modal.props.children) as React.ReactElement[];
  expect(children.map((child) => child.type)).toEqual([ScrollView, ModalActionRow]);
  fireEvent.press(screen.getByText('Create'));
  expect(useHomeStore.getState().scenes.some((scene) => scene.name === 'Telemetry-safe draft')).toBe(true);
});
