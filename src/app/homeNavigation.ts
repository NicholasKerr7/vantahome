import { CommonActions, type NavigationAction } from '@react-navigation/native';
import type { HomeStackParamList } from './HomeNavigator';

/** Reuse the existing main shell and nested feature instead of adding duplicate screen stacks. */
export function openHomeFeature(
  dispatch: (action: NavigationAction) => void,
  screen: keyof HomeStackParamList,
): void {
  // Nested navigators receive their own pop option through params, independently of Main.
  dispatch(CommonActions.navigate({ name: 'Main', params: { screen, pop: true }, pop: true }));
}
