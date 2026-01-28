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

async function getAccessToken() {
  assertSupabaseReady();
  const { data, error } = await supabase!.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Missing auth session.");
  return token;
}

async function callEdge<T>(
  path: string,
  payload: unknown,
  method = "POST",
): Promise<T> {
  const token = await getAccessToken();
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

export async function bootstrapHome(name: string) {
  return callEdge<{ home: { id: string; name: string } }>("home-bootstrap", {
    name,
  });
}

export type InviteMemberPayload = {
  email: string;
  name?: string;
  role?: "admin" | "member" | "guest" | "tenant";
  roomIds?: string[];
};

export async function inviteHomeMember(payload: InviteMemberPayload) {
  return callEdge<{
    member: { userId: string; email: string; name: string; role: string };
    status?: "invited" | "already_member";
  }>("home-invite", payload);
}

export type HomeInvite = {
  id: string;
  home_id: string;
  email: string;
  invited_user_id: string | null;
  role: string;
  room_ids: string[];
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
};

export async function listPendingInvites() {
  assertSupabaseReady();
  const { data: userData, error: userError } = await supabase!.auth.getUser();
  if (userError || !userData?.user) throw new Error("Missing auth session.");
  const email = userData.user.email ?? "";
  const userId = userData.user.id;
  const { data, error } = await supabase!
    .from("home_invites")
    .select(
      "id, home_id, email, invited_user_id, role, room_ids, status, created_at",
    )
    .eq("status", "pending")
    .or(`invited_user_id.eq.${userId},email.eq.${email}`);
  if (error) throw new Error(error.message);
  return (data as HomeInvite[]) ?? [];
}

export async function respondHomeInvite(inviteId: string, action: "accept" | "decline") {
  return callEdge<{ status: "accepted" | "declined"; inviteId: string }>(
    "home-invite-respond",
    { inviteId, action },
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
