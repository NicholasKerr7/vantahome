import React from 'react';
import { Image } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { useHomeStore, type HouseholdMember } from '../../../store/useHomeStore';
import { HouseholdPage } from '../../household/HouseholdPage';
import type { ProfileWorkspaceModel } from '../../household/useProfileWorkspace';
import CameraPeoplePanel from '../../cameras/CameraPeoplePanel';

jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').View }));
jest.mock('@expo/vector-icons/Ionicons', () => require('react-native').View);
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockCloudAvailable = false;
jest.mock('../../../services/supabaseClient', () => ({ get supabase() { return mockCloudAvailable ? {} : null; } }));
jest.mock('../../../config/runtimeMode', () => ({ runtimePolicy: { allowUnauthenticatedDemo: true } }));

const initial = useHomeStore.getState();
const members: HouseholdMember[] = [
  { id: 'alice-member', userId: 'alice', name: 'Server Alice', role: 'Owner', status: 'home' },
  { id: 'bob-member', userId: 'bob', name: 'Bob', role: 'Member', status: 'away', avatarUri: 'file:///bob.jpg' },
];

beforeEach(() => {
  mockCloudAvailable = false;
  useHomeStore.setState({
  ...initial, authenticatedUserId: 'alice', accountUserId: 'alice', activeHomeId: 'home', accountHomeId: 'home', membershipReady: true,
  profile: { name: 'Alice Smith', email: '', homeName: '', avatarUri: 'file:///alice.jpg', avatarColor: '#A0E9FF' },
  household: members,
  });
});
afterEach(() => useHomeStore.setState(initial, true));

/** Supply only member-page data; administrative actions stay disabled in this presentation test. */
function memberModel() {
  return {
    household: members, rooms: [], roomMembers: [], canManageHousehold: false,
    canEditMember: () => false, handleRemoveMember: jest.fn(),
    newMemberName: '', newMemberEmail: '', newMemberRole: 'Guest', newMemberAvatar: '',
    activeMember: members[0], canInviteMembers: true, pickHouseholdAvatar: jest.fn(),
  } as unknown as ProfileWorkspaceModel;
}

test('household cards reflect saved self portraits and preserve other member identities', () => {
  const screen = render(<HouseholdPage model={memberModel()} />);
  expect(screen.getByText('Alice Smith')).toBeTruthy();
  expect(screen.UNSAFE_getByType(Image).props.source.uri).toBe('file:///alice.jpg');
  act(() => { useHomeStore.setState((state) => ({ profile: { ...state.profile, avatarUri: 'file:///alice-new.jpg' } })); });
  expect(screen.UNSAFE_getByType(Image).props.source.uri).toBe('file:///alice-new.jpg');
  fireEvent.press(screen.getByLabelText('Next household member'));
  expect(screen.getByText('Bob')).toBeTruthy();
  expect(screen.UNSAFE_getByType(Image).props.source.uri).toBe('file:///bob.jpg');
});

test('camera household portraits update locally while callbacks retain the actual member identity', () => {
  const known = jest.fn();
  const screen = render(<CameraPeoplePanel household={members} events={[]} disabled={false}
    onKnownFace={known} onUnknownFace={jest.fn()} onPresence={jest.fn()} />);
  expect(screen.getByText('Alice Smith')).toBeTruthy();
  expect(screen.UNSAFE_getByType(Image).props.source.uri).toBe('file:///alice.jpg');
  fireEvent.press(screen.getByLabelText('Recognize Alice Smith'));
  expect(known).toHaveBeenCalledWith('alice-member', 'Server Alice');
  act(() => { useHomeStore.setState({ authenticatedUserId: 'bob' }); });
  expect(screen.queryByText('Alice Smith')).toBeNull();
  expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  fireEvent.press(screen.getByLabelText('Next household members'));
  expect(screen.getByText('Bob')).toBeTruthy();
  expect(screen.UNSAFE_getByType(Image).props.source.uri).toBe('file:///bob.jpg');
});


test.each([false, true])('invitation photos are offered only for local demonstration members (cloud=%s)', (cloud) => {
  mockCloudAvailable = cloud;
  const screen = render(<HouseholdPage model={memberModel()} />);
  fireEvent.press(screen.getByLabelText('Invite'));
  expect(Boolean(screen.queryByLabelText('Add photo'))).toBe(!cloud);
  expect(screen.getByLabelText('Review invitation access')).toBeTruthy();
});
