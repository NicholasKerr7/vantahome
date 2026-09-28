import { CommonActions, StackActions, StackRouter } from '@react-navigation/routers';
import type { HomeStackParamList } from './HomeNavigator';
import { openHomeFeature } from './homeNavigation';

type NavigateAction = Extract<ReturnType<typeof CommonActions.navigate>, { type: 'NAVIGATE' }>;
const rootOptions = { routeNames: ['Main', 'Room', 'Cameras', 'Onboarding'], routeParamList: {}, routeGetIdList: {} };
const homeOptions = { routeNames: ['Home', 'Scenes', 'Automations', 'Settings'], routeParamList: {}, routeGetIdList: {} };

type Router = ReturnType<typeof StackRouter>;
type RouterState = ReturnType<Router['getInitialState']>;

/** Apply and hydrate an actual router transition as the navigation builder does. */
function transition(
  router: Router,
  state: RouterState,
  action: Parameters<Router['getStateForAction']>[1],
  options: Parameters<Router['getStateForAction']>[2],
): RouterState {
  const next = router.getStateForAction(state, action, options);
  expect(next).not.toBeNull();
  return router.getRehydratedState(next!, options);
}


/** Capture the real public action instead of mocking the stack router's route reuse behavior. */
function featureAction(screen: keyof HomeStackParamList): NavigateAction {
  const dispatch = jest.fn();
  openHomeFeature(dispatch, screen);
  expect(dispatch).toHaveBeenCalledTimes(1);
  const action = dispatch.mock.calls[0][0] as NavigateAction;
  expect(action.type).toBe('NAVIGATE');
  return action;
}

/** Mirror useNavigationBuilder's documented forwarding of nested screen and pop parameters. */
function nestedAction(action: NavigateAction) {
  const params = action.payload.params as { screen: keyof HomeStackParamList; pop: boolean };
  return CommonActions.navigate({ name: params.screen, pop: params.pop });
}

test('requests reuse in both the root Main route and its nested feature route', () => {
  expect(featureAction('Settings')).toEqual({
    type: 'NAVIGATE', payload: { name: 'Main', params: { screen: 'Settings', pop: true }, pop: true },
  });
});

test('repeated room, feature and home journeys preserve one Main and one original Home', () => {
  const rootRouter = StackRouter({ initialRouteName: 'Main' });
  const homeRouter = StackRouter({ initialRouteName: 'Home' });
  let root = rootRouter.getInitialState(rootOptions);
  let home = homeRouter.getInitialState(homeOptions);
  const mainKey = root.routes[0].key;
  const homeKey = home.routes[0].key;
  for (let index = 0; index < 20; index++) {
    root = transition(rootRouter, root, CommonActions.navigate('Room'), rootOptions);
    const action = featureAction(index % 2 === 0 ? 'Scenes' : 'Automations');
    root = transition(rootRouter, root, action, rootOptions);
    home = transition(homeRouter, home, nestedAction(action), homeOptions);
    expect(root.routes.map((route) => route.name)).toEqual(['Main']);
    expect(root.routes[0].key).toBe(mainKey);
    expect(home.routes).toHaveLength(2);
    home = transition(homeRouter, home, StackActions.popTo('Home'), homeOptions);
    expect(home.routes.map((route) => route.name)).toEqual(['Home']);
    expect(home.routes[0].key).toBe(homeKey);
  }
});

test('opening an existing feature pops intervening nested screens without replacing its state key', () => {
  const router = StackRouter({ initialRouteName: 'Home' });
  let state = router.getInitialState(homeOptions);
  state = transition(router, state, CommonActions.navigate('Settings'), homeOptions);
  const settingsKey = state.routes[1].key;
  state = transition(router, state, CommonActions.navigate('Scenes'), homeOptions);
  state = transition(router, state, nestedAction(featureAction('Settings')), homeOptions);
  expect(state.routes.map((route) => route.name)).toEqual(['Home', 'Settings']);
  expect(state.routes[1].key).toBe(settingsKey);
});

test('a legacy camera Home shortcut returns to the original nested Home instead of pushing another', () => {
  const rootRouter = StackRouter({ initialRouteName: 'Main' });
  const homeRouter = StackRouter({ initialRouteName: 'Home' });
  let root = rootRouter.getInitialState(rootOptions);
  let home = homeRouter.getInitialState(homeOptions);
  const homeKey = home.routes[0].key;
  home = transition(homeRouter, home, CommonActions.navigate('Settings'), homeOptions);
  root = transition(rootRouter, root, CommonActions.navigate('Cameras'), rootOptions);
  const action = featureAction('Home');
  root = transition(rootRouter, root, action, rootOptions);
  home = transition(homeRouter, home, nestedAction(action), homeOptions);
  expect(root.routes.map((route) => route.name)).toEqual(['Main']);
  expect(home.routes.map((route) => route.name)).toEqual(['Home']);
  expect(home.routes[0].key).toBe(homeKey);
});
