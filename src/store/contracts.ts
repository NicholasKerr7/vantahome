import type { HomeState } from "./useHomeStore";

/** Focused contracts used while the legacy persisted store is extracted. */
export type RegistryStore = Pick<
  HomeState,
  | "rooms"
  | "devices"
  | "addRoom"
  | "renameRoom"
  | "moveRoom"
  | "removeRoom"
  | "addDevice"
  | "removeDevice"
>;

export type DeviceStateStore = Pick<
  HomeState,
  "devices" | "setDevice" | "setAC" | "toggleDevice"
>;

export type HouseholdStore = Pick<
  HomeState,
  | "household"
  | "roomMembers"
  | "activeMemberId"
  | "addHouseholdMember"
  | "updateHouseholdMember"
  | "removeHouseholdMember"
  | "setHouseholdPresence"
  | "setActiveMember"
  | "setRoomMembership"
  | "grantRoomAccess"
  | "revokeRoomAccess"
>;

export type AutomationStore = Pick<
  HomeState,
  | "scenes"
  | "rules"
  | "flows"
  | "runScene"
  | "addRule"
  | "updateRule"
  | "removeRule"
  | "addFlow"
  | "updateFlow"
  | "removeFlow"
>;

export type PreferenceStore = Pick<
  HomeState,
  "profile" | "preferences" | "realtime" | "setProfile" | "setPreferences" | "setRealtime"
>;

export type IntegrationStore = Pick<
  HomeState,
  "integrations" | "setIntegrationStatus" | "linkIntegration" | "unlinkIntegration" | "resyncIntegration"
>;
