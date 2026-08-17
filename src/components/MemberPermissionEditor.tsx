import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Pressable from "./Pressable";
import { theme } from "../theme/theme";
import {
  ACTION_PERMISSIONS,
  roleHasPermission,
  type ActionPermission,
  type HouseholdRole,
  type PermissionOverride,
} from "../security/permissions";

const PERMISSION_LABELS: Record<ActionPermission, string> = {
  "device.view": "View devices",
  "device.control": "General controls",
  "appliance.control": "Appliances",
  "stove.control": "Cooking devices",
  "safety.control": "Safety devices",
  "light.control": "Lights",
  "climate.control": "Climate",
  "camera.live": "Live cameras",
  "camera.history": "Camera history",
  "camera.manage": "Camera settings",
  "lock.unlock": "Unlock doors",
  "garage.open": "Open garage or gate",
  "alarm.arm": "Arm alarm",
  "alarm.disarm": "Disarm alarm",
  "automation.manage": "Manage automations",
  "member.invite": "Invite members",
};

type Props = {
  role: HouseholdRole;
  overrides: readonly PermissionOverride[];
  disabled?: boolean;
  onChange: (permission: ActionPermission, allowed: boolean | null) => void;
};

export default function MemberPermissionEditor({
  role,
  overrides,
  disabled = false,
  onChange,
}: Props) {
  if (role === "Owner") {
    return (
      <Text style={styles.ownerNote}>
        Owner permissions are permanent and cannot be overridden.
      </Text>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Action permissions</Text>
      <Text style={styles.help}>
        Inherit follows the member role. Explicit grants and denials take
        priority.
      </Text>
      {ACTION_PERMISSIONS.map((permission) => {
        const override = overrides.find(
          (item) => item.permission === permission,
        );
        const roleAllows = roleHasPermission(role, permission);
        return (
          <View key={permission} style={styles.row}>
            <View style={styles.labelWrap}>
              <Text style={styles.label}>{PERMISSION_LABELS[permission]}</Text>
              <Text style={styles.defaultText}>
                Role default: {roleAllows ? "allow" : "deny"}
              </Text>
            </View>
            <View style={styles.options}>
              {(
                [
                  ["Role", null],
                  ["Allow", true],
                  ["Deny", false],
                ] as const
              ).map(([label, value]) => {
                const selected =
                  value === null
                    ? override === undefined
                    : override?.allowed === value;
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityLabel={`${PERMISSION_LABELS[permission]}: ${label}`}
                    accessibilityState={{ selected, disabled }}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => onChange(permission, value)}
                    disabled={disabled}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selected && styles.optionTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.14)",
    gap: 8,
  },
  heading: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  help: { color: theme.colors.subtext, fontSize: 11, lineHeight: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 4,
  },
  labelWrap: { flex: 1 },
  label: { color: theme.colors.text, fontSize: 12, fontWeight: "600" },
  defaultText: { color: theme.colors.subtext, fontSize: 10, marginTop: 2 },
  options: { flexDirection: "row", gap: 4 },
  option: {
    minWidth: 45,
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  optionSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(180,107,255,0.22)",
  },
  optionText: { color: theme.colors.subtext, fontSize: 10, fontWeight: "600" },
  optionTextSelected: { color: theme.colors.text },
  ownerNote: { color: theme.colors.subtext, fontSize: 11, marginTop: 10 },
});
