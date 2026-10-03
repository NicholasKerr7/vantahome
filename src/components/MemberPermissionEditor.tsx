import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Pressable from "./Pressable";
import { theme } from "../theme/theme";
import { DeepPager } from "./deep/DeepScreen";
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
  canChange?: (permission: ActionPermission) => boolean;
  onChange: (permission: ActionPermission, allowed: boolean | null) => void;
};

/** Review four permissions at a time while keeping role defaults and protected actions explicit. */
export default function MemberPermissionEditor({
  role,
  overrides,
  disabled = false,
  canChange,
  onChange,
}: Props) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(ACTION_PERMISSIONS.length / 4);
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
      {ACTION_PERMISSIONS.slice(page * 4, (page + 1) * 4).map((permission) => {
        const override = overrides.find(
          (item) => item.permission === permission,
        );
        const roleAllows = roleHasPermission(role, permission);
        const requiresAdministrator = permission === "member.invite" && role !== "Admin";
        const readOnly = disabled || requiresAdministrator || canChange?.(permission) === false;
        return (
          <View key={permission} style={styles.row}>
            <View style={styles.labelWrap}>
              <Text style={styles.label}>{PERMISSION_LABELS[permission]}</Text>
              <Text style={styles.defaultText}>
                {requiresAdministrator ? "Requires an Owner or Admin role" : `Role default: ${roleAllows ? "allow" : "deny"}`}
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
                    accessibilityState={{ selected, disabled: readOnly }}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => { if (!readOnly) onChange(permission, value); }}
                    disabled={readOnly}
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
      <DeepPager label="permissions" page={page} pageCount={pageCount} onChange={setPage} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  heading: { color: theme.colors.text, fontSize: 17, fontWeight: "500" },
  help: { color: theme.colors.subtext, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 64, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.stroke },
  labelWrap: { flex: 1, minWidth: 0, gap: 4 },
  label: { color: theme.colors.text, fontSize: 12, fontWeight: "500" },
  defaultText: { color: theme.colors.subtext, fontSize: 10 },
  options: { flexDirection: "row", gap: 5 },
  option: { minWidth: 46, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 7, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.stroke, backgroundColor: theme.colors.card2 },
  optionSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.bg1 },
  optionText: { color: theme.colors.subtext, fontSize: 11, fontWeight: "500" },
  optionTextSelected: { color: theme.colors.accentText },
  ownerNote: { color: theme.colors.subtext, fontSize: 13, lineHeight: 20 },
});
