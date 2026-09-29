import type { IntegrationProvider } from "../../store/useHomeStore";

export type IntegrationId = IntegrationProvider | "bridge";
export type IntegrationEntry = {
  id: IntegrationId;
  title: string;
  shortLabel: string;
  icon: "logo-amazon" | "logo-google" | "logo-apple" | "link-outline" | "git-network-outline";
  description: string;
  nextStep: string;
};

export const INTEGRATION_ENTRIES: readonly IntegrationEntry[] = [
  { id: "alexa", title: "Amazon Alexa", shortLabel: "Alexa", icon: "logo-amazon",
    description: "Voice control for compatible lights, climate, TVs, fans and speakers.",
    nextStep: "Voice control isn’t connected yet. Account linking and real device setup still need to be completed." },
  { id: "google", title: "Google Home", shortLabel: "Google", icon: "logo-google",
    description: "Control compatible home devices with Google Assistant.",
    nextStep: "Voice control isn’t connected yet. Account linking and real device setup still need to be completed." },
  { id: "homekit", title: "Apple Home", shortLabel: "Apple", icon: "logo-apple",
    description: "Planned support for compatible devices in Apple Home and Siri.",
    nextStep: "Not connected yet. Support will require a compatible home hub and connected devices." },
  { id: "matter", title: "Matter", shortLabel: "Matter", icon: "link-outline",
    description: "Planned support for compatible Matter devices through your home hub.",
    nextStep: "Pairing Matter devices directly in VantaHome is not available. A compatible home hub will be required." },
  { id: "bridge", title: "Vanta Bridge", shortLabel: "Bridge", icon: "git-network-outline",
    description: "The planned connection to Home Assistant on a local home hub.",
    nextStep: "Hub not connected. Routines currently run while the app is open. Secure pairing and verified device linking are still required." },
];

/** Existing persisted “linked” flags record authorization progress, not a verified assistant connection. */
export function integrationStatusLabel(id: IntegrationId, savedStatus?: string, configured = false): string {
  if (id === "bridge") return "Bridge setup pending";
  if (id === "homekit" || id === "matter") return "Planned";
  if (savedStatus === "linked") return "Authorization saved";
  if (savedStatus === "linking") return "Authorizing…";
  return configured ? "Verification pending" : "Setup required";
}
