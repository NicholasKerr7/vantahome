import type { Device } from "../store/useHomeStore";
import { supabase } from "./supabaseClient";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type DeviceStateEvent = {
  deviceId: string;
  state: Record<string, unknown>;
};

function assertSupabaseReady() {
  if (!supabase || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured.");
  }
}

async function getAccessToken(expectedUserId?: string) {
  assertSupabaseReady();
  const { data, error } = await supabase!.auth.getSession();
  if (error) throw error;
  if (expectedUserId && data.session?.user.id !== expectedUserId) {
    throw new Error("The account changed. Please try again.");
  }
  const token = data.session?.access_token;
  if (!token) throw new Error("Missing auth session.");
  return token;
}

async function callEdge<T>(
  path: string,
  payload: unknown,
  method = "POST",
  expectedUserId?: string,
): Promise<T> {
  const token = await getAccessToken(expectedUserId);
  const response = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { error?: string })?.error ?? "Request failed.";
    throw new Error(message);
  }
  return data as T;
}

export async function bootstrapHome(name: string, expectedUserId?: string) {
  return callEdge<{ home: { id: string; name: string } }>(
    "home-bootstrap",
    { name },
    "POST",
    expectedUserId,
  );
}

export type InviteMemberPayload = {
  homeId?: string;
  email: string;
  name?: string;
  role?: "admin" | "member" | "guest" | "tenant";
  roomIds?: string[];
  accessExpiresAt?: string | null;
};

export async function inviteHomeMember(
  payload: InviteMemberPayload,
  expectedUserId?: string,
) {
  return callEdge<{
    member: { userId: string; email: string; name: string; role: string };
    status?: "invited" | "already_member";
    delivery?: "email_code" | "in_app" | "none";
  }>("home-invite", payload, "POST", expectedUserId);
}

export type HomeInvite = {
  id: string;
  home_id: string;
  home_name: string;
  email: string;
  invited_user_id: string | null;
  role: string;
  room_ids: string[];
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  expires_at?: string;
  access_expires_at?: string | null;
};

/** Read only invitations addressed to the verified account, never an editable profile email. */
export async function listPendingInvites(expectedUserId?: string) {
  assertSupabaseReady();
  const { data: userData, error: userError } = await supabase!.auth.getUser();
  if (userError || !userData?.user) throw new Error("Missing auth session.");
  if (expectedUserId && userData.user.id !== expectedUserId) {
    throw new Error("The account changed. Please try again.");
  }
  const email = userData.user.email?.trim().toLowerCase();
  if (!email || !userData.user.email_confirmed_at) throw new Error("Verify your account email before reviewing invitations.");
  const userId = userData.user.id;
  // This recipient-only RPC reveals a home's name without granting access to its registry.
  const { data, error } = await supabase!.rpc("list_my_home_invitations");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  const rows: unknown[] = data;
  return rows.filter((row): row is HomeInvite => {
    if (!row || typeof row !== "object") return false;
    const invite = row as Record<string, unknown>;
    return typeof invite.id === "string" && invite.id.trim().length > 0
      && typeof invite.home_id === "string" && invite.home_id.trim().length > 0
      && typeof invite.home_name === "string" && invite.home_name.trim().length > 0
      && invite.email === email && (invite.invited_user_id === null || invite.invited_user_id === userId)
      && invite.status === "pending" && typeof invite.role === "string" && ["admin", "member", "guest", "tenant"].includes(invite.role)
      && Array.isArray(invite.room_ids) && invite.room_ids.every((roomId) => typeof roomId === "string" && roomId.trim().length > 0)
      && typeof invite.created_at === "string" && Number.isFinite(Date.parse(invite.created_at))
      && (invite.expires_at === undefined || (typeof invite.expires_at === "string" && Number.isFinite(Date.parse(invite.expires_at))))
      && (invite.access_expires_at == null || (invite.role === "guest" && typeof invite.access_expires_at === "string" && Number.isFinite(Date.parse(invite.access_expires_at))));
  });
}

export async function respondHomeInvite(
  inviteId: string,
  action: "accept" | "decline",
  expectedUserId?: string,
) {
  return callEdge<{ status: "accepted" | "declined"; inviteId: string }>(
    "home-invite-respond",
    { inviteId, action },
    "POST",
    expectedUserId,
  );
}

export async function logDeviceAuditEvent(payload: {
  deviceId: string;
  action: string;
  payload?: Record<string, unknown>;
}) {
  return callEdge<{ ok: boolean }>("device-audit", payload);
}

export async function pushDeviceState(
  deviceId: string,
  state: Record<string, unknown>,
) {
  return callEdge<{ state: { device_id: string; updated_at: string } }>(
    "device-state",
    { deviceId, state },
    "POST",
  );
}

export async function pushDeviceStateBatch(events: DeviceStateEvent[]) {
  return callEdge<{ updated: number }>(
    "device-state-batch",
    { events },
    "POST",
  );
}

export function deviceToStateEvent(device: Device): DeviceStateEvent {
  const { id, name, kind, roomId, ...state } = device;
  return { deviceId: id, state };
}

export function devicesToStateEvents(devices: Device[]) {
  return devices.map(deviceToStateEvent);
}
