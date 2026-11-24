import "server-only";
import webpush from "web-push";
import { createAdmin } from "@/lib/supabase/admin";
import { listStaff } from "@/lib/staff";
import { sendText } from "@/lib/evolution";

export type Payload = { title: string; body: string; url?: string; tag?: string };
export type Target = "all" | "admins" | { users: string[] };

let ready = false;
function init() {
  if (ready) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  ready = true;
  return true;
}

export async function adminIds() {
  return (await listStaff()).filter((s) => s.role === "admin" && !s.banned).map((s) => s.id);
}

/** Telefona/bilgisayara anlık bildirim (PWA push). */
export async function notify(target: Target, payload: Payload) {
  if (!init()) return;
  let ids: string[];
  if (target === "admins") ids = await adminIds();
  else if (target === "all") ids = (await listStaff()).filter((s) => !s.banned).map((s) => s.id);
  else ids = target.users;
  if (ids.length === 0) return;

  const db = createAdmin();
  const { data: subs } = await db.from("push_subscriptions").select("*").in("user_id", ids);
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3600, urgency: "high" }
        );
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      }
    })
  );
}

/** Bot ayarlarındaki bildirim telefonlarına WhatsApp mesajı (isteğe bağlı). */
async function notifyPhones(text: string) {
  const { data: s } = await createAdmin().from("bot_settings").select("notify_phones").eq("id", 1).single();
  const phones = String(s?.notify_phones ?? "").split(",").map((p) => p.replace(/\D/g, "")).filter(Boolean);
  await Promise.allSettled(phones.map((p) => sendText(p, text)));
}

/** Önemli olaylar için: push + (tanımlıysa) WhatsApp. */
export async function alertTeam(payload: Payload, target: Target) {
  await Promise.allSettled([notify(target, payload), notifyPhones(`${payload.title}: ${payload.body}`)]);
}
