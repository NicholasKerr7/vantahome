import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useHomeStore } from '../../store/useHomeStore';
import HomeDestinationGuard from './HomeDestinationGuard';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ dispatch: jest.fn() }) }));

const seed = useHomeStore.getState();
beforeEach(() => useHomeStore.setState({ ...seed, accountUserId: 'person', authenticatedUserId: 'person', accountHomeId: 'home', activeHomeId: 'home', membershipReady: true,
  activeMemberId: 'person', household: [{ id: 'person', role: 'Admin', name: 'Person', status: 'home' }], memberPermissionOverrides: [] }));
afterEach(() => useHomeStore.setState(seed));

test('unmounts an already-open private destination immediately when its administrator role is revoked', () => {
  const screen = render(<HomeDestinationGuard destination="integrations"><Text>Private connection settings</Text></HomeDestinationGuard>);
  expect(screen.getByText('Private connection settings')).toBeTruthy();
  act(() => { useHomeStore.setState({ household: [{ id: 'person', role: 'Tenant', name: 'Person', status: 'home' }] }); });
  expect(screen.queryByText('Private connection settings')).toBeNull();
  expect(screen.getByLabelText('Return to your home')).toBeTruthy();
});

test('never mounts private children while membership is refreshing', () => {
  useHomeStore.setState({ membershipReady: false });
  const mounted = jest.fn();
  /** Detect execution of private screen hooks, rather than just hidden text. */
  function PrivateScreen() { mounted(); return <Text>Private content</Text>; }
  const screen = render(<HomeDestinationGuard destination="renderer"><PrivateScreen /></HomeDestinationGuard>);
  expect(mounted).not.toHaveBeenCalled();
  expect(screen.queryByText('Private content')).toBeNull();
});
