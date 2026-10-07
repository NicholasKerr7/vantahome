import { StyleSheet } from "react-native";
import { theme } from "../../theme/theme";

/** Focused guest access surfaces reuse the household palette and touch target scale. */
export const guestExtensionStyles = StyleSheet.create({
  content: { gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  clockBadge: {
    width: 46, height: 46, borderRadius: 17, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.card2, borderWidth: 1, borderColor: theme.colors.stroke,
  },
  title: { color: theme.colors.text, fontSize: 21, lineHeight: 27, fontWeight: "500" },
  deadlineAction: {
    minHeight: 44, alignSelf: "stretch", alignItems: "center", flexDirection: "row", gap: 10,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: theme.colors.card2,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.stroke, borderRadius: 14,
  },
  deadlineCopy: { flex: 1, minWidth: 0, gap: 3 },
  deadlineLabel: { color: theme.colors.accentText, fontSize: 10, fontWeight: "600" },
  deadlineActionLabel: { color: theme.colors.accentText, fontSize: 12, fontWeight: "600" },
  deadlineValue: { color: theme.colors.text, fontSize: 11, lineHeight: 15 },
  deadlinePanel: {
    padding: 14, gap: 7, borderRadius: 17, borderWidth: 1,
    borderColor: theme.colors.stroke, backgroundColor: theme.colors.card2,
  },
  deadlineText: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  deadlineDivider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.stroke, marginVertical: 3 },
  newDeadlineLabel: { color: theme.colors.accentText, fontSize: 11, lineHeight: 16, fontWeight: "500" },
  confirmedDeadline: { color: theme.colors.text, fontSize: 18, lineHeight: 25, fontWeight: "500" },
  durationChoices: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  customChoice: {
    flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46,
    paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.stroke,
    backgroundColor: theme.colors.card2,
  },
  customLabel: { flex: 1, color: theme.colors.text, fontSize: 12, fontWeight: "500" },
  dateFields: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1.5, minWidth: 0 },
  timeField: { flex: 1, minWidth: 0 },
  permissionSummary: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
});
