import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { evolutionConfigured, getState } from "@/lib/evolution";
import { alertTeam, adminIds } from "@/lib/push";
import { isOpenNow, type HoursEntry } from "@/lib/hours";

/** WhatsApp bağlantı durumunu kaydeder; kopunca ve geri gelince yöneticiye haber verir. */
export async function applyConnectionState(state: string) {
  const down = ["close", "yok", "hata"].includes(state);
  const up = state === "open";
  if (!down && !up) return; // "connecting" gibi geçici durumlar
  const db = createAdmin();
  const { data: ch } = await db.from("channels").select("id,config").eq("name", "whatsapp").maybeSingle();
  if (!ch) return;
  const alerted = ch.config?.alerted === true;
  const at = new Date().toISOString();

  if (up) {
    await db.from("channels").update({ status: "aktif", config: { state, alerted: false, at } }).eq("id", ch.id);
    if (alerted) await alertTeam({ title: "WhatsApp bağlantısı geri geldi", body: "Bot yeniden çalışıyor.", url: "/kanallar" }, "admins");
  } else if (!alerted) {
    // Önce işareti koy, sonra haber ver (çift bildirim olmasın)
    await db.from("channels").update({ status: "pasif", config: { state, alerted: true, at } }).eq("id", ch.id);
    await alertTeam({ title: "WhatsApp bağlantısı koptu", body: "Bot mesaj alamıyor. Kanallar sayfasından QR okut.", url: "/kanallar" }, "admins");
  }
}

export async function checkConnection() {
  if (!evolutionConfigured()) return;
  await applyConnectionState(await getState());
}

/** İnsana devredilmiş ve müşteri yazalı beri cevapsız kalan konuşmalar için uyarı. */
export async function checkWaiting() {
  const db = createAdmin();
  const { data: s } = await db.from("bot_settings").select("working_hours,timezone,waiting_alert_minutes").eq("id", 1).single();
  if (!s || !isOpenNow(s.working_hours as HoursEntry[], s.timezone)) return 0;
  const limit = Number(s.waiting_alert_minutes) || 30;

  const { data: convs } = await db
    .from("conversations")
    .select("id,display_name,phone,assigned_to,waiting_alerted_at")
    .eq("mode", "human")
    .limit(100);

  let alerts = 0;
  const admins = await adminIds();
  for (const c of convs ?? []) {
    const { data: last } = await db
      .from("messages").select("direction,created_at").eq("conversation_id", c.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!last || last.direction !== "in") continue;
    const waited = (Date.now() - new Date(last.created_at).getTime()) / 60000;
    if (waited < limit) continue;
    if (c.waiting_alerted_at && c.waiting_alerted_at >= last.created_at) continue;

    await db.from("conversations").update({ waiting_alerted_at: new Date().toISOString() }).eq("id", c.id);
    const target = c.assigned_to ? { users: [...new Set([c.assigned_to, ...admins])] } : ("all" as const);
    await alertTeam(
      { title: `Cevap bekliyor: ${c.display_name || "+" + c.phone}`, body: `Müşteri ${Math.round(waited)} dakikadır cevap bekliyor.`, url: `/inbox/${c.id}`, tag: `wait-${c.id}` },
      target
    );
    alerts++;
  }
  return alerts;
}
