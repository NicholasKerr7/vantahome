import { CommonActions, type NavigationAction } from '@react-navigation/native';
import type { HomeStackParamList } from './HomeNavigator';

/** Reuse the existing main shell and nested feature instead of adding duplicate screen stacks. */
export function openHomeFeature<Screen extends keyof HomeStackParamList>(
  dispatch: (action: NavigationAction) => void,
  screen: Screen,
  params?: HomeStackParamList[Screen],
): void {
  // Nested navigators receive their own pop option through params, independently of Main.
  dispatch(CommonActions.navigate({ name: 'Main', params: { screen, ...(params === undefined ? {} : { params }), pop: true }, pop: true }));
}
