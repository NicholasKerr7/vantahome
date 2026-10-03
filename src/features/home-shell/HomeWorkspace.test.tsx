import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import type { HomeDestination } from './homeDestinations';
import type { HomeSection } from './HomeNavigation';
import HomeWorkspace from './HomeWorkspace';
import { useHomeStore } from '../../store/useHomeStore';

const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
const mockNavigation = jest.fn();
const mockMenu = jest.fn();
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true, useNavigation: () => ({ navigate: mockNavigate, dispatch: mockDispatch }) }));
jest.mock('../../app/homeNavigation', () => ({ openHomeFeature: (dispatch: (value: string) => void, screen: string) => dispatch(screen) }));
jest.mock('../../components/command-feedback/CommandActivityContext', () => ({ useCommandActivityLauncher: () => null }));
jest.mock('../../components/useDecorativeMotion', () => ({ useDecorativeMotion: () => false }));
jest.mock('./HomeNavigation', () => ({ __esModule: true, default: (props: { children: React.ReactNode }) => { mockNavigation(props); return props.children; } }));
jest.mock('./HomeMenu', () => ({ __esModule: true, default: (props: unknown) => { mockMenu(props); return null; } }));
jest.mock('./HomeDeviceLibrary', () => ({ __esModule: true, default: () => null }));

const seed = useHomeStore.getState();
beforeEach(() => {
  jest.clearAllMocks();
  useHomeStore.setState({ ...seed, accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home', membershipReady: true,
    activeMemberId: 'person', household: [{ id: 'person', role: 'Admin', name: 'Person', status: 'home' }], memberPermissionOverrides: [] });
});
afterEach(() => useHomeStore.setState(seed));

test('rechecks current permissions inside retained dock and menu callbacks', () => {
  render(<HomeWorkspace section="home"><Text>Property</Text></HomeWorkspace>);
  const selectSection = mockNavigation.mock.calls.at(-1)![0].onSelect as (section: HomeSection) => void;
  act(() => { selectSection('more'); });
  const selectDestination = mockMenu.mock.calls.at(-1)![0].onSelect as (destination: HomeDestination) => void;
  act(() => { useHomeStore.setState({ household: [{ id: 'person', role: 'Tenant', name: 'Person', status: 'home' }] }); });
  act(() => { selectDestination('integrations'); selectDestination('renderer'); selectSection('automations'); });
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockDispatch).not.toHaveBeenCalled();
  act(() => { selectDestination('household'); });
  expect(mockNavigate).toHaveBeenCalledWith('Profile', { section: 'household' });
});

test('blocks an already-mounted routines workspace after its effective permission is revoked', () => {
  const screen = render(<HomeWorkspace section="automations"><Text>Private routines</Text></HomeWorkspace>);
  expect(screen.getByText('Private routines')).toBeTruthy();
  act(() => { useHomeStore.setState({ memberPermissionOverrides: [{ memberId: 'person', permission: 'automation.manage', allowed: false }] }); });
  expect(screen.queryByText('Private routines')).toBeNull();
  expect(screen.getByLabelText('Return to your home')).toBeTruthy();
});
