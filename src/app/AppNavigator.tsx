import React from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import AuthScreen from "../screens/AuthScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import BottomTabs from "../components/BottomTabs";
import DeviceDetailScreen from "../screens/DeviceDetailScreen";
import RoomScreen from "../screens/RoomScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import ManageRoomsScreen from "../screens/ManageRoomsScreen";
import AutomationBuilderScreen from "../screens/AutomationBuilderScreen";
import { theme } from "../theme/theme";

/**
 * Root stack for the app.
 *
 * Notes:
 * - We wrap the navigator with `BottomSheetModalProvider` so any screen can
 *   present a Gorhom bottom sheet (e.g. device long-press sheet).
 * - The `GestureHandlerRootView` lives in `App.tsx`; both are required for
 *   bottom sheet + gestures to work reliably.
 */
export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
  Room: { roomId?: string; showAll?: boolean };
  DeviceDetail: { deviceId: string };
  Notifications: undefined;
  Profile: undefined;
  ManageRooms: undefined;
  AutomationBuilder: { flowId?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <BottomSheetModalProvider>
      <NavigationContainer
        theme={{
          ...DefaultTheme,
          // Ensure the “safe” default background matches our gradient base.
          colors: { ...DefaultTheme.colors, background: theme.colors.bg0 },
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Main" component={BottomTabs} />
          <Stack.Screen name="Room" component={RoomScreen} />
          <Stack.Screen name="DeviceDetail" component={DeviceDetailScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="ManageRooms" component={ManageRoomsScreen} />
          <Stack.Screen
            name="AutomationBuilder"
            component={AutomationBuilderScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </BottomSheetModalProvider>
  );
}
