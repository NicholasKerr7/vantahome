import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import {
  DeepAction,
  DeepScreen,
  DeepTabs,
} from "../components/deep/DeepScreen";
import {
  AccessPage,
  IdentityPage,
  PreferencesPage,
} from "../features/household/ProfilePages";
import { HouseholdPage } from "../features/household/HouseholdPage";
import { householdStyles as styles } from "../features/household/householdStyles";
import { useProfileWorkspace } from "../features/household/useProfileWorkspace";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;
type ProfileSection = "identity" | "household" | "preferences" | "access";
const SECTIONS = [
  { id: "identity", label: "Identity", icon: "person-outline" },
  { id: "household", label: "People", icon: "people-outline" },
  { id: "preferences", label: "Feel", icon: "options-outline" },
  { id: "access", label: "Access", icon: "key-outline" },
] as const;

/** A focused profile workspace that keeps household administration out of a scrolling settings wall. */
export default function ProfileScreen({ navigation, route }: Props) {
  const model = useProfileWorkspace(navigation);
  const requestedSection = route.params?.section ?? "identity";
  const [section, setSection] = useState<ProfileSection>(requestedSection);
  // A menu shortcut may target this screen while its previous route remains mounted.
  useEffect(() => {
    setSection(requestedSection);
  }, [requestedSection]);
  return (
    <DeepScreen
      title="Profile"
      eyebrow="PERSONAL SPACE"
      subtitle="Your identity. Your people. Your home."
      onBack={() => navigation.goBack()}
    >
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <DeepTabs items={SECTIONS} selectedId={section} onSelect={setSection} />
        {section === "identity" && <IdentityPage model={model} />}
        {section === "household" && <HouseholdPage model={model} />}
        {section === "preferences" && <PreferencesPage model={model} />}
        {section === "access" && (
          <AccessPage
            model={model}
            onIntegrations={() => navigation.navigate("Integrations")}
          />
        )}
        {section === "identity" && (
          <View style={styles.footer}>
            <DeepAction
              label="Save profile"
              primary
              disabled={!model.name.trim()}
              onPress={model.onSave}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </DeepScreen>
  );
}
