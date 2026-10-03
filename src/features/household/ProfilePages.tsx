import { useHomeStore } from "../../store/useHomeStore";
import { selectHomeNavigationAccess } from "../home-shell/homeNavigationAccess";
import React, { useState } from "react";
import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import AvatarChip from "../../components/AvatarChip";
import Pressable from "../../components/Pressable";
import {
  DeepAction,
  DeepCard,
  DeepTabs,
} from "../../components/deep/DeepScreen";
import { theme } from "../../theme/theme";
import { integrationStatusLabel } from "../integrations/integrationCatalog";
import { getVoiceLinkConfiguration } from "../integrations/voiceLinkService";
import { householdStyles as styles } from "./householdStyles";
import {
  ProfileChoice,
  ProfileField,
  ProfileForm,
  ProfileToggle,
  ProfileAvailabilityRow,
} from "./ProfileControls";
import type { ProfileWorkspaceModel } from "./useProfileWorkspace";
import {
  PRIVACY_AVAILABILITY,
  REPORT_AVAILABILITY,
} from "./profileAvailability";

const IDENTITY_TABS = [
  { id: "details", label: "Details" },
  { id: "portrait", label: "Portrait" },
] as const;
const PREFERENCE_TABS = [
  { id: "comfort", label: "Comfort" },
  { id: "privacy", label: "Privacy" },
  { id: "reports", label: "Reports" },
] as const;
const SWATCHES = [
  { color: "#B46BFF", label: "Violet", style: styles.violet },
  { color: "#7A5CFF", label: "Purple", style: styles.purple },
  { color: "#FF9AA2", label: "Rose", style: styles.rose },
  { color: "#A0E9FF", label: "Sky", style: styles.blue },
  { color: "#FFD166", label: "Gold", style: styles.gold },
  { color: "#A5FF9B", label: "Leaf", style: styles.green },
] as const;

/** Separate personal details from the avatar editor while retaining one profile draft. */
export function IdentityPage({ model }: { model: ProfileWorkspaceModel }) {
  const [page, setPage] = useState<"details" | "portrait">("details");
  return (
    <View style={styles.body}>
      <DeepTabs items={IDENTITY_TABS} selectedId={page} onSelect={setPage} />
      <DeepCard style={styles.fill}>
        <ProfileForm>
          {page === "details" ? (
            <>
              <View style={styles.header}>
                <AvatarChip
                  name={model.name}
                  size={48}
                  color={model.avatarColor}
                  uri={model.avatarUri}
                />
                <View style={styles.heading}>
                  <Text style={styles.eyebrow}>YOUR HOME, YOUR DETAILS</Text>
                  <Text style={styles.subtitle}>
                    {model.activeMember?.role ?? "Household member"} ·{" "}
                    {model.roomsCount} rooms · {model.devicesCount} devices
                  </Text>
                </View>
              </View>
              <ProfileField
                label="Name"
                value={model.name}
                onChangeText={model.setName}
                placeholder="Your name"
                autoComplete="name"
              />
              <ProfileField
                label="Email"
                value={model.email}
                onChangeText={model.setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              <ProfileField
                label="Phone"
                value={model.phone}
                onChangeText={model.setPhone}
                placeholder="+1 (555) 000-0000"
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <ProfileField
                label="Home name"
                value={model.homeName}
                onChangeText={model.setHomeName}
                placeholder="Vanta Home"
              />
            </>
          ) : (
            <>
              <View style={styles.avatar}>
                <View style={styles.avatarRing}>
                  <AvatarChip
                    name={model.name || "Vanta Home"}
                    size={92}
                    color={model.avatarColor}
                    uri={model.avatarUri}
                  />
                </View>
                <Text style={styles.title}>
                  {model.name || "Your portrait"}
                </Text>
                <Text style={styles.subtitle}>
                  A familiar face for your home.
                </Text>
              </View>
              <View style={styles.actions}>
                <DeepAction
                  label="Upload photo"
                  icon="image-outline"
                  onPress={() => void model.pickAvatar()}
                />
                {Boolean(model.avatarUri) && (
                  <DeepAction
                    label="Remove photo"
                    icon="close-outline"
                    onPress={() => model.setAvatarUri("")}
                  />
                )}
              </View>
              <Text style={styles.label}>Glow color</Text>
              <View style={styles.swatches}>
                {SWATCHES.map((swatch) => (
                  <Pressable
                    key={swatch.color}
                    accessibilityLabel={`${swatch.label} avatar color`}
                    accessibilityState={{
                      selected: model.avatarColor === swatch.color,
                    }}
                    onPress={() => model.setAvatarColor(swatch.color)}
                    style={[
                      styles.swatch,
                      swatch.style,
                      model.avatarColor === swatch.color &&
                        styles.swatchSelected,
                    ]}
                  >
                    {model.avatarColor === swatch.color && (
                      <Ionicons
                        name="checkmark"
                        size={22}
                        color={theme.colors.bg0}
                      />
                    )}
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ProfileForm>
      </DeepCard>
    </View>
  );
}

/** Group locale, privacy, and reports into focused cards instead of one settings wall. */
export function PreferencesPage({ model }: { model: ProfileWorkspaceModel }) {
  const [page, setPage] = useState<"comfort" | "privacy" | "reports">(
    "comfort",
  );
  return (
    <View style={styles.body}>
      <DeepTabs items={PREFERENCE_TABS} selectedId={page} onSelect={setPage} />
      <DeepCard style={styles.fill}>
        <ProfileForm>
          {page === "comfort" ? (
            <>
              <View style={styles.section}>
                <Text style={styles.title}>Make it feel right.</Text>
                <Text style={styles.label}>Temperature unit</Text>
                <View style={styles.choices}>
                  {(["C", "F"] as const).map((unit) => (
                    <ProfileChoice
                      key={unit}
                      label={unit === "C" ? "Celsius" : "Fahrenheit"}
                      selected={model.tempUnit === unit}
                      onPress={() => model.setTempUnit(unit)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.label}>Time format</Text>
                <View style={styles.choices}>
                  {(["12h", "24h"] as const).map((format) => (
                    <ProfileChoice
                      key={format}
                      label={format === "12h" ? "12-hour" : "24-hour"}
                      selected={model.timeFormat === format}
                      onPress={() => model.setTimeFormat(format)}
                    />
                  ))}
                </View>
              </View>
              <ProfileField
                label="Timezone"
                value={model.timezone}
                onChangeText={model.setTimezone}
                placeholder="Auto"
                autoCapitalize="none"
              />
              <ProfileToggle
                label="Haptics"
                value={model.prefs.haptics}
                onChange={(haptics) => model.setPreferences({ haptics })}
              />
              <ProfileToggle
                label="Notifications"
                value={model.prefs.notifications}
                onChange={(notifications) =>
                  model.setPreferences({ notifications })
                }
              />
            </>
          ) : (
            <>
              <Text style={styles.title}>
                {page === "privacy"
                  ? "Your personal space."
                  : "Stay in the know."}
              </Text>
              {(page === "privacy"
                ? PRIVACY_AVAILABILITY
                : REPORT_AVAILABILITY
              ).map((item) => (
                <ProfileAvailabilityRow key={item.id} item={item} />
              ))}
            </>
          )}
        </ProfileForm>
      </DeepCard>
      {page === "comfort" && (
        <View style={styles.footer}>
          <DeepAction
            label="Save profile"
            primary
            disabled={!model.name.trim()}
            onPress={model.onSave}
          />
        </View>
      )}
    </View>
  );
}

/** Keep linked-service status and account access together, with direct setup routes. */
export function AccessPage({
  model,
  onIntegrations,
}: {
  model: ProfileWorkspaceModel;
  onIntegrations: () => void;
}) {
  const canManageIntegrations = useHomeStore((state) => selectHomeNavigationAccess(state).integrations);
  /** Recheck current membership before opening a previously rendered service action. */
  const reviewIntegrations = () => {
    if (selectHomeNavigationAccess(useHomeStore.getState()).integrations) onIntegrations();
  };
  return (
    <DeepCard style={styles.fill}>
      <ProfileForm>
        <View style={styles.section}>
          <Text style={styles.eyebrow}>CONNECTED LIVING</Text>
          <Text style={styles.title}>A home that listens.</Text>
          <Text style={styles.subtitle}>
            Voice assistants, bridges, and your account.
          </Text>
        </View>
        {canManageIntegrations && model.serviceItems.map((item) => (
          <View key={item.provider} style={[styles.row, styles.rowDivider]}>
            <View style={styles.serviceIcon}>
              <Ionicons
                name={item.icon}
                size={20}
                color={theme.colors.accentText}
              />
            </View>
            <View style={styles.heading}>
              <Text style={styles.rowText}>{item.label}</Text>
              <Text style={styles.detail}>
                {integrationStatusLabel(
                  item.provider,
                  model.integrations[item.provider]?.status,
                  Boolean(getVoiceLinkConfiguration(item.provider)),
                )}
              </Text>
            </View>
            <DeepAction
              label="Review"
              accessibilityLabel={`Review ${item.label} setup`}
              onPress={reviewIntegrations}
            />
          </View>
        ))}
        <View style={styles.section}>
          <Text style={styles.label}>Account</Text>
          <DeepAction
            label="Sign out"
            icon="log-out-outline"
            onPress={model.handleSignOut}
          />
        </View>
      </ProfileForm>
    </DeepCard>
  );
}
