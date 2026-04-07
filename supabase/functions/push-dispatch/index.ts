import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/supabaseClient.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

type NotificationCategory =
  | "alert"
  | "device"
  | "scene"
  | "automation"
  | "security"
  | "info";

type PushDispatchBody = {
  title?: string;
  body?: string;
  category?: NotificationCategory;
  data?: Record<string, unknown>;
  bypassQuietHours?: boolean;
  originPushToken?: string | null;
  appNotificationId?: string;
  isNew?: boolean;
};

type PushNotificationDeviceRow = {
  id: string;
  home_id: string;
  expo_push_token: string | null;
  preference_state: Record<string, unknown> | null;
};

type PendingTicketRow = {
  id: string;
  push_device_id: string;
  expo_ticket_id: string;
};

const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function parseClockForTimezone(timeZone: string | null | undefined, at = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(at);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(
      parts.find((part) => part.type === "minute")?.value ?? "0",
    );
    return { hour, minute };
  } catch {
    return { hour: at.getUTCHours(), minute: at.getUTCMinutes() };
  }
}

function isQuietHoursActive(
  preferences: Record<string, unknown> | null | undefined,
  bypassQuietHours: boolean,
  at = new Date(),
) {
  if (bypassQuietHours) return false;
  if (!preferences?.notificationQuietHoursEnabled) return false;

  const startHour =
    typeof preferences.notificationQuietHoursStartHour === "number"
      ? Math.max(0, Math.min(23, Math.round(preferences.notificationQuietHoursStartHour)))
      : 22;
  const endHour =
    typeof preferences.notificationQuietHoursEndHour === "number"
      ? Math.max(0, Math.min(23, Math.round(preferences.notificationQuietHoursEndHour)))
      : 7;
  const { hour, minute } = parseClockForTimezone(
    typeof preferences.timezone === "string" ? preferences.timezone : null,
    at,
  );
  const nowMinutes = hour * 60 + minute;
  const startMinutes = startHour * 60;
  const endMinutes = endHour * 60;

  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

function isCategoryEnabled(
  preferences: Record<string, unknown> | null | undefined,
  category: NotificationCategory,
) {
  if (preferences?.notifications === false) return false;
  const categorySettings =
    preferences?.notificationCategories &&
    typeof preferences.notificationCategories === "object"
      ? (preferences.notificationCategories as Record<string, unknown>)
      : null;
  const categoryFlag = categorySettings?.[category];
  return categoryFlag === undefined ? true : categoryFlag !== false;
}

async function reconcilePendingReceipts(admin: ReturnType<typeof getSupabaseAdmin>) {
  const { data: pendingRows, error: pendingError } = await admin
    .from("push_notification_tickets")
    .select("id, push_device_id, expo_ticket_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (pendingError || !pendingRows?.length) return;

  for (const batch of chunkArray(pendingRows as PendingTicketRow[], 100)) {
    const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: batch.map((row) => row.expo_ticket_id),
      }),
    }).catch(() => null);

    if (!response?.ok) continue;
    const payload = (await response.json().catch(() => ({}))) as {
      data?: Record<
        string,
        { status?: string; message?: string; details?: { error?: string } }
      >;
    };
    const receiptMap = payload.data ?? {};
    const disableIds = new Set<string>();

    for (const row of batch) {
      const receipt = receiptMap[row.expo_ticket_id];
      if (!receipt) continue;
      const errorMessage =
        receipt.message ||
        (typeof receipt.details?.error === "string" ? receipt.details.error : null);
      const nextStatus = receipt.status === "ok" ? "ok" : "error";

      await admin
        .from("push_notification_tickets")
        .update({
          status: nextStatus,
          error: errorMessage,
          checked_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (receipt.details?.error === "DeviceNotRegistered") {
        disableIds.add(row.push_device_id);
      }
    }

    if (disableIds.size) {
      await admin
        .from("push_notification_devices")
        .update({
          disabled_at: new Date().toISOString(),
          last_receipt_status: "error",
          last_receipt_error: "DeviceNotRegistered",
        })
        .in("id", Array.from(disableIds));
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getSupabaseClient(req);
    const admin = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as PushDispatchBody;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.body === "string" ? body.body.trim() : "";
    const category: NotificationCategory =
      body.category === "alert" ||
      body.category === "device" ||
      body.category === "scene" ||
      body.category === "automation" ||
      body.category === "security" ||
      body.category === "info"
        ? body.category
        : "info";
    const payloadData =
      body.data && typeof body.data === "object" ? body.data : {};
    const originPushToken =
      typeof body.originPushToken === "string" ? body.originPushToken.trim() : "";

    if (!title || !message) {
      return jsonResponse({ error: "title and body are required." }, 400);
    }

    const { data: membership, error: membershipError } = await supabase
      .from("home_members")
      .select("home_id")
      .eq("user_id", userData.user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      return jsonResponse({ error: "Home not found." }, 404);
    }

    await reconcilePendingReceipts(admin).catch(() => {});

    const { data: recipientRows, error: recipientsError } = await admin
      .from("push_notification_devices")
      .select("id, home_id, expo_push_token, preference_state")
      .eq("home_id", membership.home_id)
      .is("disabled_at", null)
      .not("expo_push_token", "is", null);

    if (recipientsError) {
      return jsonResponse({ error: recipientsError.message }, 400);
    }

    const eligibleRows = (recipientRows as PushNotificationDeviceRow[] | null)?.filter(
      (row) => {
        if (!row.expo_push_token) return false;
        if (originPushToken && row.expo_push_token === originPushToken) return false;
        if (!isCategoryEnabled(row.preference_state, category)) return false;
        if (isQuietHoursActive(row.preference_state, body.bypassQuietHours === true)) {
          return false;
        }
        return true;
      },
    ) ?? [];

    if (!eligibleRows.length) {
      return jsonResponse({ sent: 0, tickets: 0 });
    }

    let sent = 0;
    let ticketCount = 0;

    for (const batch of chunkArray(eligibleRows, 100)) {
      const messages = batch.map((row) => ({
        to: row.expo_push_token,
        sound: "default",
        title,
        body: message,
        channelId: "default",
        data: {
          ...payloadData,
          category,
          title,
          body: message,
          appNotificationId: body.appNotificationId,
          isNew: body.isNew !== false,
          deliveryOrigin: "remote",
        },
      }));

      const response = await fetch(EXPO_PUSH_SEND_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        data?: Array<{
          id?: string;
          status?: string;
          message?: string;
          details?: { error?: string };
        }>;
      };

      if (!response.ok) {
        return jsonResponse(
          {
            error:
              "Expo push delivery failed.",
          },
          502,
        );
      }

      for (const [index, ticket] of (payload.data ?? []).entries()) {
        const row = batch[index];
        if (!row) continue;
        sent += 1;

        if (ticket.id && ticket.status === "ok") {
          ticketCount += 1;
          await admin.from("push_notification_tickets").insert({
            push_device_id: row.id,
            expo_ticket_id: ticket.id,
            status: "pending",
          });
          continue;
        }

        const errorMessage =
          ticket.message ||
          (typeof ticket.details?.error === "string" ? ticket.details.error : null);
        await admin
          .from("push_notification_devices")
          .update({
            last_receipt_status: "error",
            last_receipt_error: errorMessage,
            disabled_at:
              ticket.details?.error === "DeviceNotRegistered"
                ? new Date().toISOString()
                : null,
          })
          .eq("id", row.id);
      }
    }

    return jsonResponse({ sent, tickets: ticketCount });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
