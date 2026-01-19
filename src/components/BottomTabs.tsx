import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import HomeScreen from "../screens/HomeScreen";
import AutomationsScreen from "../screens/AutomationsScreen";
import ScenesScreen from "../screens/ScenesScreen";
import SettingsScreen from "../screens/SettingsScreen";
import TabBar from "./TabBar";

export type BottomTabParamList = {
  Home: undefined;
  Automations: undefined;
  Scenes: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

export default function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Automations" component={AutomationsScreen} />
      <Tab.Screen name="Scenes" component={ScenesScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
