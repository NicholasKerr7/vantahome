/** Read-only product availability; these entries never imply an enabled service or save a preference. */
export type ProfileAvailability = {
  id: string;
  label: string;
  status: string;
  detail: string;
};

export const PRIVACY_AVAILABILITY: readonly ProfileAvailability[] = [
  {
    id: "biometric",
    label: "App biometric lock",
    status: "Not available",
    detail:
      "Locking the whole app with Face ID or Touch ID is not available. Sensitive actions use separate confirmation when required; that protection cannot be disabled here.",
  },
  {
    id: "location",
    label: "Location sharing",
    status: "Not available",
    detail:
      "Live location sharing and location-based presence are not connected. This page does not enable location tracking.",
  },
  {
    id: "activity",
    label: "Activity sharing",
    status: "Not available",
    detail:
      "An optional household usage-sharing preference is not available. Existing home activity follows household access permissions.",
  },
];

export const REPORT_AVAILABILITY: readonly ProfileAvailability[] = [
  {
    id: "updates",
    label: "Automatic app updates",
    status: "Managed by your platform",
    detail:
      "VantaHome does not schedule overnight updates. Updates depend on your app store or preview installation method.",
  },
  {
    id: "digest",
    label: "Weekly digest",
    status: "Not available",
    detail:
      "Scheduled energy and safety summaries are not connected. No weekly report is being sent.",
  },
];
