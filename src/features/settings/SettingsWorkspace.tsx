import React, { useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Text, TextInput, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../app/AppNavigator";
import Pressable from "../../components/Pressable";
import ThemedSwitch from "../../components/ThemedSwitch";
import CinematicSurface from "../../components/CinematicSurface";
import { theme } from "../../theme/theme";
import { settingsStyles as styles } from "./settingsWorkspaceStyles";
import { useSettingsWorkspace, type SettingsWorkspaceModel } from "./useSettingsWorkspace";

type Category = "home" | "preferences" | "voice" | "activity" | "about" | "development";
type SettingsCategory = { id: Category; label: string; icon: keyof typeof Ionicons.glyphMap };
const CATEGORIES: readonly SettingsCategory[] = [
  { id: "home", label: "Home", icon: "home-outline" },
  { id: "preferences", label: "Feel", icon: "options-outline" },
  { id: "voice", label: "Voice", icon: "mic-outline" },
  { id: "activity", label: "Activity", icon: "time-outline" },
  { id: "about", label: "About", icon: "information-circle-outline" },
  { id: "development", label: "Tools", icon: "code-slash-outline" },
];
const TOOL_PAGES = ["Connection", "MQTT", "Delivery", "Security"] as const;

/** One quiet row for a real saved value, without decorative dashboard metrics. */
function SettingValue({ label, value }: { label: string; value: string | number }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text accessibilityLabel={`${label}: ${value}`} numberOfLines={2} style={styles.value}>{value}</Text></View>;
}

/** Retain native switch accessibility and existing preference mutations. */
function SettingToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><ThemedSwitch accessibilityLabel={label} value={value} onValueChange={onChange} activeThumbColor={theme.colors.accent} thumbColor={theme.colors.subtext} /></View>;
}

/** Share a restrained, touch-sized action between settings categories. */
function SettingAction({ label, accessibilityLabel = label, onPress, primary = false, disabled = false }: { label: string; accessibilityLabel?: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.action, primary && styles.primaryAction, disabled && styles.disabled]}>
    <Text style={[styles.actionLabel, primary && styles.primaryActionLabel]}>{label}</Text>
  </Pressable>;
}

/** Split development settings into four bounded pages; none creates or starts a new transport. */
function DevelopmentPage({ page, model, editing, setEditing }: { page: number; model: SettingsWorkspaceModel; editing: boolean; setEditing: (value: boolean) => void }) {
  if (page === 0) return <>
    {!editing && <View style={styles.rows}>
      <SettingToggle label="Enable realtime" value={model.realtime.enabled} onChange={(enabled) => model.setRealtime({ enabled })} />
      <SettingToggle label="Use MQTT bridge" value={model.realtime.useMqtt} onChange={(useMqtt) => model.setRealtime({ useMqtt })} />
      <SettingValue label="Status" value={model.connectionLabel} />
    </View>}
    <View style={styles.inputGroup}><Text style={styles.label}>WebSocket endpoint</Text><TextInput accessibilityLabel="WebSocket endpoint" value={model.realtime.wsUrl}
      onChangeText={(wsUrl) => model.setRealtime({ wsUrl })} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
      onSubmitEditing={() => { Keyboard.dismiss(); setEditing(false); }} placeholder="ws://localhost:8088" placeholderTextColor={theme.colors.muted}
      autoCapitalize="none" autoCorrect={false} returnKeyType="done" style={styles.input} /></View>
    {editing && <View style={styles.actions}><SettingAction label="Done" onPress={() => { Keyboard.dismiss(); setEditing(false); }} /></View>}
  </>;
  if (page === 1) return <View style={styles.rows}>
    <SettingValue label="Endpoint" value={model.mqtt.endpoint || "Not set"} />
    <SettingValue label="State topic" value={model.mqtt.stateTopic} />
    <SettingValue label="Command topic" value={model.mqtt.commandTopic} />
    <SettingValue label="Publish state" value={model.mqtt.publishesState ? "Yes" : "No"} />
  </View>;
  if (page === 2) return <>
    <View style={styles.rows}><SettingValue label="Command retries" value={model.retryLabel} /><SettingValue label="Status" value={model.connectionLabel} /></View>
    <Text style={styles.detail}>{model.realtime.useMqtt && model.realtime.mqttError ? model.realtime.mqttError : "Delivery status does not confirm that a physical device changed."}</Text>
  </>;
  return <>
    <Text style={styles.description}>Keep remote connections private.</Text>
    <Text style={styles.detail}>Use authenticated, encrypted access with TLS or a private VPN. Never expose an anonymous MQTT broker to the public internet.</Text>
    <View style={styles.notice}><Text style={styles.detail}>Recommended: strong credentials, TLS, and a firewall or private VPN.</Text></View>
  </>;
}

/** Present one complete settings category at a time, with a tablet index and compact phone tabs. */
export default function SettingsWorkspace() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const model = useSettingsWorkspace();
  const { width, height } = useWindowDimensions();
  const wide = width >= 800 && width > height;
  const compact = height < 720;
  const [category, setCategory] = useState<Category>("home");
  const [toolPage, setToolPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const categories = CATEGORIES.filter((item) => item.id !== "development" || model.developmentTools);
  const titles: Record<Category, string> = { home: "A place of your own.", preferences: "Make it feel right.", voice: "A home that listens.", activity: "Know what happened.", about: "VantaHome.", development: TOOL_PAGES[toolPage] };
  const chapter = categories.findIndex((item) => item.id === category) + 1;

  /** Change categories without carrying the keyboard or a previous tool page into the next section. */
  function selectCategory(next: Category) {
    Keyboard.dismiss(); setEditing(false); setToolPage(0); setCategory(next);
  }

  return <CinematicSurface variant="quiet" style={styles.root}><KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={64}>
    <View style={[styles.workspace, compact && styles.compactWorkspace, wide && styles.wideWorkspace]}>
      {!editing && <View accessibilityRole="tablist" style={[styles.navigation, wide && styles.sideNavigation]}>
        {categories.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={`${item.label} settings`} accessibilityState={{ selected: category === item.id }}
          onPress={() => selectCategory(item.id)} style={[styles.category, wide && styles.sideCategory, category === item.id && styles.selectedCategory]}>
          <Ionicons name={item.icon} size={18} color={category === item.id ? theme.colors.accent : theme.colors.subtext} />
          <Text style={[styles.categoryLabel, wide && styles.sideCategoryLabel, category === item.id && styles.selectedLabel]}>{item.label}</Text>
        </Pressable>)}
      </View>}
      <View style={[styles.panel, compact && styles.compactPanel]}>
        <View pointerEvents="none" accessible={false} style={styles.panelOrbit} />
        <View style={styles.panelHeading}><Text style={styles.eyebrow}>{String(chapter).padStart(2, "0")} / {category === "development" ? "DEVELOPMENT" : category.toUpperCase()}</Text>
          <Text accessibilityRole="header" style={[styles.title, compact && styles.compactTitle]}>{titles[category]}</Text></View>

        {category === "home" && <>
          <Text numberOfLines={2} style={styles.homeName}>{model.homeTitle}</Text>
          <View style={styles.rows}><SettingValue label="Rooms" value={model.roomCount} /><SettingValue label="Devices" value={model.deviceCount} /></View>
          <View style={styles.actions}><SettingAction label="Edit profile" onPress={() => navigation.navigate("Profile")} /><SettingAction label={model.cloudBusy ? "Preparing…" : "Cloud setup"} accessibilityLabel="Initialize cloud home" primary disabled={model.cloudBusy} onPress={() => { void model.initializeCloudHome(); }} /></View>
        </>}
        {category === "preferences" && <View style={styles.rows}>
          <SettingToggle label="Haptics" value={model.preferences.haptics} onChange={(haptics) => model.setPreferences({ haptics })} />
          <SettingToggle label="Notifications" value={model.preferences.notifications} onChange={(notifications) => model.setPreferences({ notifications })} />
          <SettingValue label="Appearance" value="Vanta violet" />
        </View>}
        {category === "voice" && <>
          <Text style={styles.description}>Your assistants and home connections, together in one place.</Text>
          <View style={styles.notice}><Text style={styles.detail}>Review account authorization, planned integrations and local hub setup.</Text></View>
          <View style={styles.actions}><SettingAction label="Voice & integrations" accessibilityLabel="Open voice and integrations" primary onPress={() => navigation.navigate("Integrations")} /></View>
        </>}
        {category === "activity" && <>
          <Text style={styles.description}>Review recent requests and the home activity log.</Text>
          <View style={styles.actions}>{model.commandActivity && <SettingAction label="Command activity" accessibilityLabel="Open command activity" onPress={model.commandActivity.open} />}
            <SettingAction label="Activity log" accessibilityLabel="View activity log" onPress={() => navigation.navigate("AuditLog")} /></View>
          <Text style={styles.detail}>A delivered command is a request. A confirmed device state shows what happened.</Text>
        </>}
        {category === "about" && <>
          <View style={styles.rows}><SettingValue label="Version" value={model.version} /><SettingValue label="Experience" value={model.runtimeLabel} /></View>
          {model.supportEmail && <View style={styles.actions}><SettingAction label="Send feedback" accessibilityLabel="Send VantaHome feedback by email" onPress={() => { void model.sendFeedback(); }} /></View>}
        </>}
        {category === "development" && model.developmentTools && <>
          <DevelopmentPage page={toolPage} model={model} editing={editing} setEditing={setEditing} />
          {!editing && <View style={styles.subpageNavigation}>
            <Pressable accessibilityLabel="Previous connection page" disabled={toolPage === 0} accessibilityState={{ disabled: toolPage === 0 }} onPress={() => setToolPage(toolPage - 1)} style={[styles.pagerButton, toolPage === 0 && styles.disabled]}><Ionicons name="arrow-back" size={20} color={theme.colors.text} /></Pressable>
            <Text style={styles.pageLabel}>{TOOL_PAGES[toolPage]} · {toolPage + 1} / {TOOL_PAGES.length}</Text>
            <Pressable accessibilityLabel="Next connection page" disabled={toolPage === TOOL_PAGES.length - 1} accessibilityState={{ disabled: toolPage === TOOL_PAGES.length - 1 }} onPress={() => setToolPage(toolPage + 1)} style={[styles.pagerButton, toolPage === TOOL_PAGES.length - 1 && styles.disabled]}><Ionicons name="arrow-forward" size={20} color={theme.colors.text} /></Pressable>
          </View>}
        </>}
      </View>
    </View>
  </KeyboardAvoidingView></CinematicSurface>;
}
