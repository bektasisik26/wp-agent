import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { sendText } from "@/lib/evolution";
import { isOpenNow, type HoursEntry } from "@/lib/hours";
import { logError } from "@/lib/whatsapp";

const MAX_PER_RUN = 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runFollowups() {
  const db = createAdmin();
  const { data: s } = await db.from("bot_settings").select("*").eq("id", 1).single();
  if (!s) return { sent: 0, note: "ayar yok" };
  if (!s.followup_enabled) return { sent: 0, note: "takip kapalı" };
  if (!isOpenNow(s.working_hours as HoursEntry[], s.timezone)) return { sent: 0, note: "mesai dışı" };

  const { data: leads } = await db
    .from("leads")
    .select("id,status,conversation_id,followup_6h_sent_at,followup_24h_sent_at")
    .in("status", ["yeni", "urunler_netlesiyor", "teklif_gonderildi"])
    .not("conversation_id", "is", null)
    .or("followup_6h_sent_at.is.null,followup_24h_sent_at.is.null");

  let sent = 0;
  for (const lead of leads ?? []) {
    if (sent >= MAX_PER_RUN) break;
    try {
      if (await followupOne(db, s, lead)) {
        sent++;
        await sleep(1500); // art arda gönderimi yavaşlat
      }
    } catch (e) {
      await logError("takip", e);
    }
  }
  return { sent, note: "tamam" };
}

async function followupOne(db: ReturnType<typeof createAdmin>, s: Record<string, any>, lead: Record<string, any>) {
  const { data: conv } = await db.from("conversations").select("id,phone,mode").eq("id", lead.conversation_id).single();
  if (!conv) return false;
  const { data: ex } = await db.from("bot_excluded_numbers").select("id").eq("phone", conv.phone).maybeSingle();
  if (ex) return false;

  // Teklif gönderilmiş lead'ler her modda takip edilir. Diğerleri yalnızca bot konuşmasında sessiz kalanlar:
  // insana devredilmiş konuşmada cevap borcu bizdedir.
  const quote = lead.status === "teklif_gonderildi";
  if (!quote && conv.mode !== "bot") return false;

  // Takip mesajlarını saymadan son mesaj: giden ise top müşterideydir.
  const { data: last } = await db
    .from("messages")
    .select("direction,created_at")
    .eq("conversation_id", conv.id)
    .eq("is_followup", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last || last.direction !== "out") return false;

  const hours = (Date.now() - new Date(last.created_at).getTime()) / 3600e3;
  if (hours < 6) return false;

  const now = new Date().toISOString();
  if (hours >= 72) {
    // Çok eski: artık yazma, bir daha bakma
    await db.from("leads").update({ followup_6h_sent_at: lead.followup_6h_sent_at ?? now, followup_24h_sent_at: lead.followup_24h_sent_at ?? now }).eq("id", lead.id);
    return false;
  }

  let stage: 6 | 24 | null = null;
  if (hours >= 24 && !lead.followup_24h_sent_at) stage = 24;
  else if (hours < 24 && !lead.followup_6h_sent_at) stage = 6;
  if (!stage) return false;

  // Aynı takibin iki kez gitmemesi için önce kaydı sahiplen
  const col = stage === 24 ? "followup_24h_sent_at" : "followup_6h_sent_at";
  const claim: Record<string, string> =
    stage === 24 ? { followup_24h_sent_at: now, followup_6h_sent_at: lead.followup_6h_sent_at ?? now } : { followup_6h_sent_at: now };
  const { data: claimed } = await db.from("leads").update(claim).eq("id", lead.id).is(col, null).select("id");
  if (!claimed || claimed.length === 0) return false;

  const text: string = s[`followup_${quote ? "teklif" : "talep"}_${stage}`];
  const mid = await sendText(conv.phone, text);
  await db.from("messages").insert({ conversation_id: conv.id, direction: "out", sender: "bot", body: text, is_followup: true, external_id: mid });
  await db.from("conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: text.slice(0, 120) }).eq("id", conv.id);
  return true;
}
