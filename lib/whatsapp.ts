import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { sendText, getMediaBase64 } from "@/lib/evolution";
import { generateReply, containsPrice, transcribeAudio, type Turn } from "@/lib/bot";
import { isOpenNow, type HoursEntry } from "@/lib/hours";
import { alertTeam, notify } from "@/lib/push";

export type Incoming = {
  phone: string;
  pushName?: string;
  externalId: string;
  kind: "text" | "document" | "image" | "audio" | "other";
  text: string;
  fileName?: string;
  fromMe: boolean;
};

const STATUS_ORDER = ["yeni", "urunler_netlesiyor", "teklif_bekliyor", "teklif_gonderildi", "musteri", "kaybedildi"];
const DEBOUNCE_MS = 6000; // art arda gelen mesajları toplamak için bekleme
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const eventOf = (body: any) => String(body?.event ?? "").toLowerCase().replace(/_/g, ".");

export function parseWebhook(body: any): Incoming | null {
  if (eventOf(body) !== "messages.upsert") return null;
  const d = Array.isArray(body.data) ? body.data[0] : body.data;
  if (!d) return null;
  const key = d.key ?? {};
  let jid = String(key.remoteJid ?? "");
  if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return null;
  if (jid.endsWith("@lid")) jid = String(key.remoteJidAlt ?? d.senderPn ?? jid);
  const phone = jid.split("@")[0].replace(/\D/g, "");
  const externalId = String(key.id ?? "");
  if (!phone || !externalId) return null;

  const m = d.message ?? {};
  const doc = m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage;
  const text: string =
    m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? doc?.caption ?? "";
  let kind: Incoming["kind"] = "text";
  if (doc) kind = "document";
  else if (m.imageMessage) kind = "image";
  else if (m.audioMessage) kind = "audio";
  else if (!text) kind = "other";

  return { phone, pushName: d.pushName, externalId, kind, text, fileName: doc?.fileName, fromMe: key.fromMe === true };
}

export async function logError(context: string, e: unknown) {
  try {
    await createAdmin().from("bot_errors").insert({
      context,
      error: e instanceof Error ? e.message.slice(0, 1000) : String(e).slice(0, 1000),
    });
  } catch { /* günlük yazılamadıysa yapacak bir şey yok */ }
}

/** Numaradan giden mesaj: panel/bot gönderdiyse zaten kayıtlıdır, değilse telefondan elle yazılmıştır. */
async function handleOutgoing(inc: Incoming) {
  const db = createAdmin();
  await sleep(4000); // panelin/botun kendi kaydını yazması için pay

  const { data: known } = await db.from("messages").select("id").eq("external_id", inc.externalId).maybeSingle();
  if (known) return;

  // Kimlik alınamamış olsa bile aynı metinli yeni bir giden kayıt varsa bizim mesajımızdır
  if (inc.text) {
    const since = new Date(Date.now() - 120_000).toISOString();
    const { data: ours } = await db
      .from("messages").select("id,conversation_id").eq("direction", "out").eq("body", inc.text)
      .is("external_id", null).gte("created_at", since).limit(1);
    if (ours && ours.length) {
      await db.from("messages").update({ external_id: inc.externalId }).eq("id", ours[0].id);
      return;
    }
  }

  let { data: conv } = await db.from("conversations").select("*").eq("phone", inc.phone).maybeSingle();
  if (!conv) {
    const r = await db.from("conversations").insert({ phone: inc.phone }).select("*").single();
    if (r.error || !r.data) throw new Error(r.error?.message ?? "konuşma oluşturulamadı");
    conv = r.data;
  }
  const ins = await db.from("messages").insert({
    conversation_id: conv.id, direction: "out", sender: "human",
    body: inc.text || null, media_type: inc.kind === "text" ? null : inc.kind,
    media_name: inc.fileName ?? null, external_id: inc.externalId,
  });
  if (ins.error) {
    if (ins.error.code === "23505") return;
    throw new Error(ins.error.message);
  }
  await db.from("conversations").update({
    mode: "human",
    handoff_reason: conv.mode === "bot" ? "Telefondan elle cevap verildi" : conv.handoff_reason,
    last_message_at: new Date().toISOString(),
    last_message_preview: (inc.text || `[${inc.kind}]`).slice(0, 120),
  }).eq("id", conv.id);
}

export async function processIncoming(inc: Incoming) {
  if (inc.fromMe) return handleOutgoing(inc);
  const db = createAdmin();

  // Konuşma
  let { data: conv } = await db.from("conversations").select("*").eq("phone", inc.phone).maybeSingle();
  if (!conv) {
    const r = await db.from("conversations").insert({ phone: inc.phone, display_name: inc.pushName ?? null }).select("*").single();
    if (r.error || !r.data) throw new Error(r.error?.message ?? "konuşma oluşturulamadı");
    conv = r.data;
  }
  const convId: string = conv.id;
  const name: string = conv.display_name ?? inc.pushName ?? `+${inc.phone}`;

  // Mesajı kaydet (aynı mesaj kimliği ikinci kez gelirse dur)
  const ins = await db.from("messages").insert({
    conversation_id: convId, direction: "in", sender: "customer",
    body: inc.text || null, media_type: inc.kind === "text" ? null : inc.kind,
    media_name: inc.fileName ?? null, external_id: inc.externalId,
  }).select("id").single();
  if (ins.error) {
    if (ins.error.code === "23505") return;
    throw new Error(ins.error.message);
  }
  const msgId: string = ins.data.id;
  await db.from("leads").update({ followup_6h_sent_at: null, followup_24h_sent_at: null }).eq("conversation_id", convId);

  await db.from("conversations").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: (inc.text || `[${inc.kind}]`).slice(0, 120),
    unread_count: (conv.unread_count ?? 0) + 1,
    display_name: conv.display_name ?? inc.pushName ?? null,
  }).eq("id", convId);

  // Bot dışı numara mı?
  const { data: ex } = await db.from("bot_excluded_numbers").select("id").eq("phone", inc.phone).maybeSingle();
  const excluded = !!ex;

  // Dosya, görsel, ses: indir ve sakla; sesi yazıya çevir
  let kind = inc.kind;
  if (kind === "document" || kind === "image" || kind === "audio") {
    const media = await getMediaBase64(inc.externalId);
    if (media) {
      const safe = (inc.fileName ?? media.fileName ?? kind).replace(/[^\w.\-]/g, "_");
      const path = `${convId}/${inc.externalId}-${safe}`;
      const up = await db.storage.from("whatsapp-media").upload(path, Buffer.from(media.base64, "base64"), { contentType: media.mimetype });
      if (!up.error) await db.from("messages").update({ media_path: path, media_name: inc.fileName ?? media.fileName ?? safe }).eq("id", msgId);
      else await logError("medya yükleme", up.error);

      if (kind === "audio" && !excluded) {
        try {
          const t = await transcribeAudio(media.base64, media.mimetype);
          if (t) {
            inc.text = t;
            kind = "text";
            await db.from("messages").update({ body: t }).eq("id", msgId);
            await db.from("conversations").update({ last_message_preview: `🎤 ${t}`.slice(0, 120) }).eq("id", convId);
          }
        } catch (e) { await logError("ses çevirme", e); }
      }
    } else {
      await logError("medya indirme", `getBase64FromMediaMessage başarısız (mesaj ${inc.externalId})`);
    }
  }

  // Bot dışı numaralar: yalnızca kaydedilir, bot cevap vermez, bildirim gitmez
  if (excluded) return;

  // İnsan modundaysa bot susar; ilgili kişilere bildirim gider
  if (conv.mode === "human") {
    await notify(conv.assigned_to ? { users: [conv.assigned_to] } : "all", {
      title: name, body: (inc.text || `[${inc.kind}]`).slice(0, 120), url: `/inbox/${convId}`, tag: convId,
    });
    return;
  }

  const { data: s } = await db.from("bot_settings").select("*").eq("id", 1).single();
  if (!s) throw new Error("bot_settings bulunamadı");

  const say = async (text: string) => {
    const mid = await sendText(inc.phone, text);
    await db.from("messages").insert({ conversation_id: convId, direction: "out", sender: "bot", body: text, external_id: mid });
    await db.from("conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: text.slice(0, 120) }).eq("id", convId);
  };
  const toHuman = async (reason: string) => {
    await db.from("conversations").update({ mode: "human", handoff_reason: reason }).eq("id", convId);
    if (reason !== "Bot kapalı") {
      await alertTeam({ title: `Devir: ${name}`, body: reason, url: `/inbox/${convId}`, tag: convId }, "all");
    }
  };

  if (!s.bot_enabled) { await toHuman("Bot kapalı"); return; }

  // Lead: yoksa oluştur
  let { data: lead } = await db.from("leads").select("*").eq("conversation_id", convId).maybeSingle();
  const ensureLead = async () => {
    if (lead) return lead;
    const r = await db.from("leads").insert({ conversation_id: convId, phone: inc.phone, assigned_to: conv.assigned_to ?? null }).select("*").single();
    if (r.error || !r.data) throw new Error(r.error?.message ?? "lead oluşturulamadı");
    lead = r.data;
    return lead;
  };

  // Liste/dosya geldi: kaydet ve devret
  if (kind === "document" || kind === "image") {
    const l = await ensureLead();
    const note = `${l.notes ? l.notes + "\n" : ""}Dosya geldi: ${inc.fileName ?? kind}`;
    await db.from("leads").update({ notes: note }).eq("id", l.id);
    await say("Listeni aldık, ekibimiz inceleyip sana dönecek.");
    await toHuman("Müşteri dosya/liste gönderdi");
    return;
  }
  if (kind === "audio") {
    await say("Sesli mesajını anlayamadım. Yazıyla iletebilir misin?");
    return;
  }
  if (kind === "other") {
    await say("Bu içeriği açamıyorum. Yazıyla iletebilir misin?");
    return;
  }

  // Art arda mesajları topla: bu mesajdan sonra yenisi geldiyse cevabı yeni mesaj verecek
  await sleep(DEBOUNCE_MS);
  const { data: latest } = await db.from("messages").select("id").eq("conversation_id", convId).eq("direction", "in").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latest && latest.id !== msgId) return;
  const { data: fresh } = await db.from("conversations").select("mode,clarify_turns").eq("id", convId).single();
  if (!fresh || fresh.mode === "human") return;

  // Mesai dışı: son 12 saatte cevap yoksa mesai dışı mesajını gönder
  const open = isOpenNow(s.working_hours as HoursEntry[], s.timezone);
  if (!open) {
    const since = new Date(Date.now() - 12 * 3600e3).toISOString();
    const { data: recent } = await db.from("messages").select("id").eq("conversation_id", convId).eq("direction", "out").gte("created_at", since).limit(1);
    if (!recent || recent.length === 0) {
      await say(s.after_hours_message);
      return;
    }
  }

  // Geçmiş (son 20 mesaj)
  const { data: rows } = await db.from("messages").select("sender,body,media_type").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(20);
  const history: Turn[] = (rows ?? []).reverse().flatMap((r) => {
    const t = r.body || (r.media_type ? `[${r.media_type}]` : "");
    return t ? [{ role: (r.sender === "customer" ? "user" : "model") as Turn["role"], text: t }] : [];
  });

  let result;
  try {
    result = await generateReply(s, history, open);
  } catch (e) {
    await logError("gemini", e);
    try { await say("Şu an yoğunuz, kısa süre içinde dönüş yapacağız."); } catch { /* gönderilemedi */ }
    await toHuman("Bot hatası");
    return;
  }

  let reply = result.reply || "Mesajını aldık, ekibimiz sana dönecek.";
  let handoff = result.handoff;
  let reason = result.handoff_reason;

  if (containsPrice(reply)) {
    reply = "Fiyat bilgisini ekibimiz verecek, seni yetkiliye aktarıyorum.";
    handoff = true;
    reason = reason ?? "Fiyat sorusu";
  }

  const turns = result.needs_clarification ? (fresh.clarify_turns ?? 0) + 1 : 0;
  if (turns >= 2 && !handoff) {
    reply = "Sana daha iyi yardımcı olabilmesi için seni yetkiliye aktarıyorum.";
    handoff = true;
    reason = "İhtiyaç iki turda netleşmedi";
  }
  await db.from("conversations").update({ clarify_turns: turns }).eq("id", convId);

  // Lead güncelle
  const L = result.lead;
  const hasData = !!(L.customer_name || L.company_name || L.delivery_time || L.products);
  if (hasData || result.products_confirmed) {
    const l = await ensureLead();
    const patch: Record<string, any> = {};
    if (L.customer_name) patch.customer_name = L.customer_name;
    if (L.company_name) patch.company_name = L.company_name;
    if (L.delivery_time) patch.delivery_time = L.delivery_time;
    if (L.products) patch.products = L.products;
    let target = L.products ? "urunler_netlesiyor" : "yeni";
    if (result.products_confirmed && (L.products || (l.products as any[]).length)) {
      patch.products_confirmed = true;
      target = "teklif_bekliyor";
      handoff = true;
      reason = reason ?? "Ürün listesi teyit edildi, teklif hazırlanacak";
    }
    const cur = STATUS_ORDER.indexOf(l.status);
    if (cur <= 2 && STATUS_ORDER.indexOf(target) > cur) patch.status = target;
    if (Object.keys(patch).length) await db.from("leads").update(patch).eq("id", l.id);
  }

  await say(reply);
  if (handoff) await toHuman(reason ?? "Bot devretti");
}
