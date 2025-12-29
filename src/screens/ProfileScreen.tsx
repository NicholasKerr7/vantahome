import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import Pressable from "../components/Pressable";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { theme } from "../theme/theme";
import { useHomeStore } from "../store/useHomeStore";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../app/AppNavigator";
import AvatarChip from "../components/AvatarChip";
import { useResponsive } from "../theme/layout";
import * as ImagePicker from "expo-image-picker";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export default function ProfileScreen({ navigation }: Props) {
  const { contentWidth, gutter, topPad, isTablet, isLandscape, scale } =
    useResponsive(640);
  const isWide = isTablet && isLandscape;
  const iconSize = Math.round((isTablet ? 46 : 40) * scale);
  const iconRadius = Math.round(iconSize * 0.4);
  const titleSize = Math.round((isTablet ? 26 : 24) * scale);
  const cardPad = Math.round((isTablet ? 20 : 16) * scale);
  const cardRadius = Math.round((isTablet ? 26 : 24) * scale);
  const avatarSize = Math.round((isTablet ? 84 : 72) * scale);
  const hintSize = Math.round((isTablet ? 13 : 12) * scale);
  const labelSize = Math.round((isTablet ? 13 : 12) * scale);
  const inputHeight = Math.round((isTablet ? 48 : 44) * scale);
  const inputRadius = Math.round(inputHeight * 0.32);
  const saveHeight = Math.round((isTablet ? 54 : 50) * scale);
  const saveRadius = Math.round(saveHeight * 0.32);
  const gridGap = Math.round((isTablet ? 18 : 12) * scale);
  const profile = useHomeStore((s) => s.profile);
  const setProfile = useHomeStore((s) => s.setProfile);
  const prefs = useHomeStore((s) => s.preferences);
  const setPreferences = useHomeStore((s) => s.setPreferences);
  const roomsCount = useHomeStore((s) => s.rooms.length);
  const devicesCount = useHomeStore((s) => s.devices.length);
  const household = useHomeStore((s) => s.household);
  const addHouseholdMember = useHomeStore((s) => s.addHouseholdMember);
  const removeHouseholdMember = useHomeStore((s) => s.removeHouseholdMember);

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [homeName, setHomeName] = useState(profile.homeName ?? "");
  const [avatarColor, setAvatarColor] = useState(
    profile.avatarColor ?? "#B46BFF",
  );
  const [avatarUri, setAvatarUri] = useState(profile.avatarUri ?? "");
  const [timeFormat, setTimeFormat] = useState(profile.timeFormat ?? "12h");
  const [tempUnit, setTempUnit] = useState(profile.tempUnit ?? "C");
  const [timezone, setTimezone] = useState(profile.timezone ?? "Auto");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<
    "Owner" | "Admin" | "Guest"
  >("Guest");
  const [newMemberAvatar, setNewMemberAvatar] = useState("");

  const onSave = () => {
    setProfile({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      homeName: homeName.trim(),
      avatarColor,
      avatarUri,
      timeFormat,
      tempUnit,
      timezone: timezone.trim() || "Auto",
    });
    navigation.goBack();
  };

  const pickAvatar = async () => {
    // Request library access at runtime to avoid startup permission prompts.
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Enable photo access to upload a profile avatar.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const pickHouseholdAvatar = async () => {
    // Reuse the image picker for household members to keep uploads consistent.
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Enable photo access to add a household member.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setNewMemberAvatar(result.assets[0].uri);
    }
  };

  const handleAddMember = () => {
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    // New members default to away until recognition/proximity updates them.
    addHouseholdMember({
      name: trimmed,
      role: newMemberRole,
      status: "away",
      avatarUri: newMemberAvatar,
      avatarColor: avatarColor,
    });
    setNewMemberName("");
    setNewMemberRole("Guest");
    setNewMemberAvatar("");
  };

  return (
    <LinearGradient
      colors={[theme.colors.bg1, theme.colors.bg0]}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isTablet ? gutter : 0,
            paddingTop: topPad,
            paddingBottom: Math.round(
              (isTablet ? (isLandscape ? 120 : 140) : 120) * scale,
            ),
          },
        ]}
      >
        <View
          style={{
            width: contentWidth,
            paddingHorizontal: isTablet ? 0 : gutter,
          }}
        >
          <View style={styles.top}>
            <Pressable
              style={[
                styles.iconBtn,
                { width: iconSize, height: iconSize, borderRadius: iconRadius },
              ]}
              onPress={() => navigation.goBack()}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={theme.colors.text}
              />
            </Pressable>
            <Text style={[styles.title, { fontSize: titleSize }]}>Profile</Text>
            <View style={{ width: iconSize }} />
          </View>

          <View
            style={[
              styles.card,
              { padding: cardPad, borderRadius: cardRadius },
            ]}
          >
            <View style={styles.avatarRow}>
              <AvatarChip
                name={name || "Vanta Home"}
                size={avatarSize}
                color={avatarColor}
                uri={avatarUri}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.hint, { fontSize: hintSize }]}>
                  Add a photo or pick a glow color for your avatar.
                </Text>
                <View style={styles.avatarActions}>
                  <Pressable style={styles.avatarBtn} onPress={pickAvatar}>
                    <Ionicons
                      name="cloud-upload-outline"
                      size={Math.round(16 * scale)}
                      color={theme.colors.text}
                    />
                    <Text
                      style={[styles.avatarBtnText, { fontSize: hintSize }]}
                    >
                      Upload photo
                    </Text>
                  </Pressable>
                  {avatarUri ? (
                    <Pressable
                      style={[styles.avatarBtn, styles.avatarBtnGhost]}
                      onPress={() => setAvatarUri("")}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={Math.round(16 * scale)}
                        color={theme.colors.subtext}
                      />
                      <Text
                        style={[styles.avatarBtnText, { fontSize: hintSize }]}
                      >
                        Remove
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.swatchRow}>
                  {[
                    "#B46BFF",
                    "#7A5CFF",
                    "#FF9AA2",
                    "#A0E9FF",
                    "#FFD166",
                    "#A5FF9B",
                  ].map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setAvatarColor(c)}
                      style={[
                        styles.swatch,
                        {
                          width: Math.round((isTablet ? 30 : 26) * scale),
                          height: Math.round((isTablet ? 30 : 26) * scale),
                          borderRadius: Math.round(
                            (isTablet ? 12 : 10) * scale,
                          ),
                          backgroundColor: c,
                        },
                        avatarColor === c && styles.swatchActive,
                      ]}
                    />
                  ))}
                </View>
              </View>
            </View>

            <View
              style={[
                styles.formGrid,
                isWide && { flexDirection: "row", gap: gridGap },
              ]}
            >
              <View style={[styles.formColumn, isWide && { flex: 1 }]}>
                <Text style={[styles.label, { fontSize: labelSize }]}>
                  Name
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={[
                    styles.input,
                    { height: inputHeight, borderRadius: inputRadius },
                  ]}
                />

                <Text style={[styles.label, { fontSize: labelSize }]}>
                  Email
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={[
                    styles.input,
                    { height: inputHeight, borderRadius: inputRadius },
                  ]}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View style={[styles.formColumn, isWide && { flex: 1 }]}>
                <Text style={[styles.label, { fontSize: labelSize }]}>
                  Phone
                </Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={[
                    styles.input,
                    { height: inputHeight, borderRadius: inputRadius },
                  ]}
                  keyboardType="phone-pad"
                />

                <Text style={[styles.label, { fontSize: labelSize }]}>
                  Home name
                </Text>
                <TextInput
                  value={homeName}
                  onChangeText={setHomeName}
                  placeholder="Vanta Home"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={[
                    styles.input,
                    { height: inputHeight, borderRadius: inputRadius },
                  ]}
                />
              </View>
            </View>
          </View>

          <View
            style={[
              styles.card,
              { padding: cardPad, borderRadius: cardRadius },
            ]}
          >
            <Text style={[styles.sectionTitle, { fontSize: labelSize }]}>
              Personalization
            </Text>
            <Text style={[styles.cardHint, { fontSize: hintSize }]}>
              Temperature unit
            </Text>
            <View style={styles.chipRow}>
              {(["C", "F"] as const).map((unit) => {
                const active = tempUnit === unit;
                return (
                  <Pressable
                    key={unit}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTempUnit(unit)}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {unit === "C" ? "Celsius" : "Fahrenheit"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={[styles.cardHint, { fontSize: hintSize, marginTop: 10 }]}
            >
              Time format
            </Text>
            <View style={styles.chipRow}>
              {(["12h", "24h"] as const).map((fmt) => {
                const active = timeFormat === fmt;
                return (
                  <Pressable
                    key={fmt}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setTimeFormat(fmt)}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {fmt === "12h" ? "12-hour" : "24-hour"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={[styles.cardHint, { fontSize: hintSize, marginTop: 10 }]}
            >
              Timezone
            </Text>
            <TextInput
              value={timezone}
              onChangeText={setTimezone}
              placeholder="Auto"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={[
                styles.input,
                { height: inputHeight, borderRadius: inputRadius },
              ]}
            />
          </View>

          <View
            style={[
              styles.card,
              { padding: cardPad, borderRadius: cardRadius },
            ]}
          >
            <Text style={[styles.sectionTitle, { fontSize: labelSize }]}>
              Home overview
            </Text>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { fontSize: labelSize }]}>
                Home
              </Text>
              <Text style={[styles.rowValue, { fontSize: labelSize }]}>
                {homeName || profile.homeName || "Vanta Home"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { fontSize: labelSize }]}>
                Rooms
              </Text>
              <Text style={[styles.rowValue, { fontSize: labelSize }]}>
                {roomsCount}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { fontSize: labelSize }]}>
                Devices
              </Text>
              <Text style={[styles.rowValue, { fontSize: labelSize }]}>
                {devicesCount}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.card,
              { padding: cardPad, borderRadius: cardRadius },
            ]}
          >
            <Text style={[styles.sectionTitle, { fontSize: labelSize }]}>
              Quick preferences
            </Text>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { fontSize: labelSize }]}>
                Haptics
              </Text>
              <Switch
                value={prefs.haptics}
                onValueChange={(v) => setPreferences({ haptics: v })}
                thumbColor={
                  prefs.haptics ? theme.colors.accent : "rgba(255,255,255,0.8)"
                }
                trackColor={{
                  true: "rgba(180,107,255,0.45)",
                  false: "rgba(255,255,255,0.24)",
                }}
                style={{ transform: [{ scale: isTablet ? 1.05 : 1 }] }}
              />
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { fontSize: labelSize }]}>
                Notifications
              </Text>
              <Switch
                value={prefs.notifications}
                onValueChange={(v) => setPreferences({ notifications: v })}
                thumbColor={
                  prefs.notifications
                    ? theme.colors.accent
                    : "rgba(255,255,255,0.8)"
                }
                trackColor={{
                  true: "rgba(180,107,255,0.45)",
                  false: "rgba(255,255,255,0.24)",
                }}
                style={{ transform: [{ scale: isTablet ? 1.05 : 1 }] }}
              />
            </View>
          </View>

          <View
            style={[
              styles.card,
              { padding: cardPad, borderRadius: cardRadius },
            ]}
          >
            <Text style={[styles.sectionTitle, { fontSize: labelSize }]}>
              Household
            </Text>
            {household.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                <AvatarChip
                  name={member.name}
                  size={Math.round(36 * scale)}
                  color={member.avatarColor}
                  uri={member.avatarUri}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.memberName, { fontSize: labelSize }]}>
                    {member.name}
                  </Text>
                  <Text style={[styles.memberRole, { fontSize: hintSize }]}>
                    {member.role}
                  </Text>
                </View>
                <View style={styles.memberBadge}>
                  <Text
                    style={[styles.memberBadgeText, { fontSize: hintSize }]}
                  >
                    {member.status === "home" ? "Home" : "Away"}
                  </Text>
                </View>
                <Pressable
                  style={styles.memberRemove}
                  onPress={() => removeHouseholdMember(member.id)}
                  hitSlop={8}
                >
                  <Ionicons
                    name="close"
                    size={Math.round(14 * scale)}
                    color={theme.colors.subtext}
                  />
                </Pressable>
              </View>
            ))}

            <View style={styles.addMemberCard}>
              <Text style={[styles.cardHint, { fontSize: hintSize }]}>
                Add person
              </Text>
              <TextInput
                value={newMemberName}
                onChangeText={setNewMemberName}
                placeholder="Full name"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={[
                  styles.input,
                  { height: inputHeight, borderRadius: inputRadius },
                ]}
              />
              <View style={styles.chipRow}>
                {(["Owner", "Admin", "Guest"] as const).map((role) => {
                  const active = newMemberRole === role;
                  return (
                    <Pressable
                      key={role}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setNewMemberRole(role)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {role}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.avatarActions}>
                <Pressable
                  style={styles.avatarBtn}
                  onPress={pickHouseholdAvatar}
                >
                  <Ionicons
                    name="image-outline"
                    size={Math.round(16 * scale)}
                    color={theme.colors.text}
                  />
                  <Text style={[styles.avatarBtnText, { fontSize: hintSize }]}>
                    {newMemberAvatar ? "Change photo" : "Add photo"}
                  </Text>
                </Pressable>
                {newMemberAvatar ? (
                  <Pressable
                    style={[styles.avatarBtn, styles.avatarBtnGhost]}
                    onPress={() => setNewMemberAvatar("")}
                  >
                    <Ionicons
                      name="close"
                      size={Math.round(16 * scale)}
                      color={theme.colors.subtext}
                    />
                    <Text
                      style={[styles.avatarBtnText, { fontSize: hintSize }]}
                    >
                      Remove
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                style={[
                  styles.secondaryBtn,
                  !newMemberName.trim() && { opacity: 0.6 },
                ]}
                onPress={handleAddMember}
                disabled={!newMemberName.trim()}
              >
                <Ionicons
                  name="person-add"
                  size={Math.round(16 * scale)}
                  color={theme.colors.text}
                />
                <Text
                  style={[styles.secondaryBtnText, { fontSize: labelSize }]}
                >
                  Add person
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={[
              styles.save,
              { height: saveHeight, borderRadius: saveRadius },
              !name.trim() && { opacity: 0.6 },
            ]}
            onPress={onSave}
            disabled={!name.trim()}
          >
            <Text style={[styles.saveText, { fontSize: labelSize }]}>
              Save profile
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { alignItems: "center" },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900" },

  card: {
    width: "100%",
    borderRadius: 24,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: theme.colors.stroke,
    marginTop: 12,
  },
  avatarRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  hint: { color: theme.colors.subtext, fontWeight: "700", fontSize: 12 },
  avatarActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  avatarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  avatarBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  avatarBtnText: { color: theme.colors.text, fontWeight: "800" },
  swatchRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },
  formGrid: { gap: 12 },
  formColumn: { flexShrink: 0 },
  label: { color: theme.colors.subtext, fontWeight: "800", marginTop: 10 },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: "900",
    marginBottom: 10,
  },
  cardHint: { color: theme.colors.subtext, fontWeight: "700", marginBottom: 6 },
  input: {
    marginTop: 6,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    color: theme.colors.text,
    fontWeight: "800",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  chip: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: "rgba(180,107,255,0.32)",
    borderColor: "rgba(180,107,255,0.45)",
  },
  chipText: { color: theme.colors.subtext, fontWeight: "800" },
  chipTextActive: { color: theme.colors.text },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  rowLabel: { color: theme.colors.subtext, fontWeight: "800" },
  rowValue: { color: theme.colors.text, fontWeight: "800" },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  memberRemove: {
    marginLeft: 6,
    padding: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  memberName: { color: theme.colors.text, fontWeight: "900" },
  memberRole: { color: theme.colors.subtext, fontWeight: "700" },
  memberBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  memberBadgeText: { color: theme.colors.text, fontWeight: "800" },
  addMemberCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  secondaryBtnText: { color: theme.colors.text, fontWeight: "800" },
  save: {
    marginTop: 18,
    height: 50,
    borderRadius: 16,
    backgroundColor: "rgba(180,107,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  saveText: { color: "#fff", fontWeight: "900" },
});
