"use server";
import { revalidatePath } from "next/cache";
import { allowedTarget, canAccess, requireAdmin, requireStaff } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { sendText } from "@/lib/evolution";
import { notify } from "@/lib/push";
import { generateReply, containsPrice, type Turn } from "@/lib/bot";
import { STATUS_KEYS } from "@/lib/labels";
import { normalizePhone } from "@/lib/phone";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function loadConversation(id: string) {
  const { data } = await createAdmin().from("conversations").select("*").eq("id", id).single();
  return data;
}

export async function assignConversation(formData: FormData) {
  const me = await requireStaff();
  const id = str(formData, "id");
  const target = str(formData, "target");
  const conv = await loadConversation(id);
  if (!conv || !canAccess(me, conv.assigned_to)) throw new Error("Erişim yok");
  if (!allowedTarget(me, target)) throw new Error("Bu kişiye atama yetkin yok");
  const db = createAdmin();
  await db.from("conversations").update({ assigned_to: target || null }).eq("id", id);
  await db.from("leads").update({ assigned_to: target || null }).eq("conversation_id", id);
  revalidatePath(`/inbox/${id}`);
  revalidatePath("/inbox");
  revalidatePath("/leadler");
}

export async function takeOver(formData: FormData) {
  const me = await requireStaff();
  const id = str(formData, "id");
  const conv = await loadConversation(id);
  if (!conv || !canAccess(me, conv.assigned_to)) throw new Error("Erişim yok");
  const db = createAdmin();
  await db.from("conversations").update({ mode: "human", assigned_to: conv.assigned_to ?? me.id }).eq("id", id);
  if (!conv.assigned_to) await db.from("leads").update({ assigned_to: me.id }).eq("conversation_id", id);
  revalidatePath(`/inbox/${id}`);
  revalidatePath("/inbox");
}

export async function giveBack(formData: FormData) {
  const me = await requireStaff();
  const id = str(formData, "id");
  const conv = await loadConversation(id);
  if (!conv || !canAccess(me, conv.assigned_to)) throw new Error("Erişim yok");
  await createAdmin().from("conversations").update({ mode: "bot", handoff_reason: null, clarify_turns: 0 }).eq("id", id);
  revalidatePath(`/inbox/${id}`);
  revalidatePath("/inbox");
}

export async function sendReply(formData: FormData) {
  const me = await requireStaff();
  const id = str(formData, "id");
  const text = str(formData, "text");
  if (!text) return;
  const conv = await loadConversation(id);
  if (!conv || !canAccess(me, conv.assigned_to)) throw new Error("Erişim yok");
  const mid = await sendText(conv.phone, text);
  const db = createAdmin();
  await db.from("messages").insert({ conversation_id: id, direction: "out", sender: "human", body: text, external_id: mid });
  await db.from("conversations").update({
    mode: "human",
    assigned_to: conv.assigned_to ?? me.id,
    unread_count: 0,
    last_message_at: new Date().toISOString(),
    last_message_preview: text.slice(0, 120),
  }).eq("id", id);
  if (!conv.assigned_to) await db.from("leads").update({ assigned_to: me.id }).eq("conversation_id", id);
  revalidatePath(`/inbox/${id}`);
  revalidatePath("/inbox");
}

function parseProducts(text: string) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, quantity, note] = l.split("|").map((x) => x.trim());
    return { name, quantity: quantity || null, note: note || null };
  });
}

export async function saveLead(formData: FormData) {
  const me = await requireStaff();
  const db = createAdmin();
  const id = str(formData, "id");
  const { data: lead } = await db.from("leads").select("assigned_to,conversation_id").eq("id", id).single();
  if (!lead || !canAccess(me, lead.assigned_to)) throw new Error("Erişim yok");
  const target = str(formData, "assigned_to");
  if (!allowedTarget(me, target)) throw new Error("Bu kişiye atama yetkin yok");
  const status = str(formData, "status");
  if (!STATUS_KEYS.includes(status)) throw new Error("Geçersiz durum");

  const { error } = await db.from("leads").update({
    customer_name: str(formData, "customer_name") || null,
    company_name: str(formData, "company_name") || null,
    delivery_time: str(formData, "delivery_time") || null,
    notes: str(formData, "notes") || null,
    products: parseProducts(String(formData.get("products") ?? "")),
    status,
    assigned_to: target || null,
  }).eq("id", id);
  if (error) throw new Error(error.message);

  await db.from("lead_tags").delete().eq("lead_id", id);
  const tagIds = formData.getAll("tag").map(String);
  if (tagIds.length) await db.from("lead_tags").insert(tagIds.map((tag_id) => ({ lead_id: id, tag_id })));
  if (lead.conversation_id) await db.from("conversations").update({ assigned_to: target || null }).eq("id", lead.conversation_id);

  revalidatePath(`/leadler/${id}`);
  revalidatePath("/leadler");
}

export async function addLead(formData: FormData) {
  const me = await requireStaff();
  const { error } = await createAdmin().from("leads").insert({
    customer_name: str(formData, "customer_name") || null,
    company_name: str(formData, "company_name") || null,
    phone: str(formData, "phone").replace(/\D/g, "") || null,
    assigned_to: me.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/leadler");
}

export async function createTag(formData: FormData) {
  await requireStaff();
  const name = str(formData, "name");
  if (!name) return;
  await createAdmin().from("tags").insert({ name, color: str(formData, "color") || "#6b7280" });
  revalidatePath("/leadler");
}

export async function deleteTag(formData: FormData) {
  await requireAdmin();
  await createAdmin().from("tags").delete().eq("id", str(formData, "id"));
  revalidatePath("/leadler");
}

export async function savePush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const me = await requireStaff();
  const { error } = await createAdmin().from("push_subscriptions").upsert(
    { user_id: me.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
}

export async function removePush(endpoint: string) {
  const me = await requireStaff();
  await createAdmin().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", me.id);
}

export async function sendTestPush() {
  const me = await requireStaff();
  await notify({ users: [me.id] }, { title: "Test bildirimi", body: "Bildirimler çalışıyor.", url: "/", tag: "test" });
}

export async function toggleExcluded(formData: FormData) {
  await requireAdmin();
  const phone = normalizePhone(str(formData, "phone"));
  const db = createAdmin();
  if (formData.get("excluded") === "true") await db.from("bot_excluded_numbers").delete().eq("phone", phone);
  else await db.from("bot_excluded_numbers").upsert({ phone }, { onConflict: "phone", ignoreDuplicates: true });
  revalidatePath("/inbox");
  revalidatePath("/ayarlar");
}

export type TestResult = {
  reply: string;
  handoff: boolean;
  reason: string | null;
  intent: string;
  products_confirmed: boolean;
  clarifyTurns: number;
  lead: { customer_name: string | null; company_name: string | null; delivery_time: string | null; products: { name: string; quantity?: string | null; note?: string | null }[] | null };
  note?: string;
  error?: string;
};

const EMPTY_LEAD = { customer_name: null, company_name: null, delivery_time: null, products: null };

/** Bot ayarları sayfasındaki deneme kutusu: veritabanına yazmaz, WhatsApp'a göndermez. */
export async function testBot(history: Turn[], open: boolean, clarifyTurns: number): Promise<TestResult> {
  await requireAdmin();
  const base: TestResult = { reply: "", handoff: false, reason: null, intent: "-", products_confirmed: false, clarifyTurns, lead: EMPTY_LEAD };
  const clean: Turn[] = history
    .filter((t) => (t.role === "user" || t.role === "model") && typeof t.text === "string" && t.text.trim())
    .map((t) => ({ role: t.role, text: t.text.slice(0, 1000) }))
    .slice(-20);
  if (!clean.length || clean[clean.length - 1].role !== "user") return { ...base, error: "Mesaj yok." };

  const { data: s } = await createAdmin().from("bot_settings").select("*").eq("id", 1).single();
  if (!s) return { ...base, error: "Bot ayarları bulunamadı." };

  if (!open && clean.filter((t) => t.role === "user").length === 1) {
    return { ...base, reply: s.after_hours_message, note: "Mesai dışı: bot ilk mesaja bu hazır mesajı gönderir." };
  }

  try {
    const r = await generateReply(s, clean, open);
    let reply = r.reply || "Mesajını aldık, ekibimiz sana dönecek.";
    let handoff = r.handoff;
    let reason = r.handoff_reason;
    let note: string | undefined;

    if (containsPrice(reply)) {
      reply = "Fiyat bilgisini ekibimiz verecek, seni yetkiliye aktarıyorum.";
      handoff = true;
      reason = reason ?? "Fiyat sorusu";
      note = "Bot cevabında fiyat çıktı, güvenlik kuralı onu engelledi.";
    }
    const turns = r.needs_clarification ? clarifyTurns + 1 : 0;
    if (turns >= 2 && !handoff) {
      reply = "Sana daha iyi yardımcı olabilmesi için seni yetkiliye aktarıyorum.";
      handoff = true;
      reason = "İhtiyaç iki turda netleşmedi";
    }
    if (r.products_confirmed && r.lead.products) {
      handoff = true;
      reason = reason ?? "Ürün listesi teyit edildi, teklif hazırlanacak";
    }
    return { reply, handoff, reason, intent: r.intent, products_confirmed: r.products_confirmed, clarifyTurns: turns, lead: r.lead, note };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message.slice(0, 400) : "Bilinmeyen hata" };
  }
}
