import "server-only";
import { GoogleGenAI } from "@google/genai";
import { createAdmin } from "@/lib/supabase/admin";
import { DOC_BUCKET } from "@/lib/docs";

export type Product = { name: string; quantity?: string | null; note?: string | null };
export type BotResult = {
  reply: string;
  intent: string;
  handoff: boolean;
  handoff_reason: string | null;
  needs_clarification: boolean;
  products_confirmed: boolean;
  lead: {
    customer_name: string | null;
    company_name: string | null;
    delivery_time: string | null;
    products: Product[] | null;
  };
};
export type Turn = { role: "user" | "model"; text: string };


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Google tarafındaki geçici hatalar (yoğunluk, limit) */
function transient(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|overloaded|high demand|timeout|fetch failed/i.test(m);
}

/** Geçici hatada 3 kez dener; olmazsa (varsa) yedek modele geçer. */
async function generate(ai: GoogleGenAI, params: any) {
  const models = [process.env.GEMINI_MODEL || "gemini-3.5-flash-lite", process.env.GEMINI_FALLBACK_MODEL]
    .filter(Boolean) as string[];
  let lastErr: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await ai.models.generateContent({ ...params, model });
      } catch (e) {
        lastErr = e;
        if (!transient(e)) throw e;
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

const MAX_PDF_TOTAL = 12 * 1024 * 1024;

export function containsPrice(text: string) {
  return /₺|\d[\d.,]*\s*(tl|lira|try)\b/i.test(text);
}

async function loadKnowledge() {
  const db = createAdmin();
  const [faqs, docs] = await Promise.all([
    db.from("faqs").select("question,answer").eq("active", true).order("sort_order"),
    db.from("bot_documents").select("name,mime_type,storage_path,text_content,size_bytes").eq("active", true),
  ]);
  return { faqs: faqs.data ?? [], docs: docs.data ?? [] };
}

function systemInstruction(s: Record<string, any>, faqs: { question: string; answer: string }[], textDocs: { name: string; text: string }[], open: boolean) {
  return `Sen "${s.bot_name}" adlı asistansın. ${s.business_name} adına WhatsApp'ta müşterilerle yazışıyorsun.

## İşletme
${s.business_info}

## Ton ve dil
${s.tone}
Dil: ${s.language}.

## Görevin
Müşterinin hangi ürünleri istediğini net olarak öğren (ürün adı, adet ya da ölçü). Ürünler netleşince listeyi özetleyip "Sipariş etmek istediğin ürünler şunlar mı?" diye teyit al. Müşteri teyit ederse products_confirmed=true yap ve teklifi ekibin hazırlayıp ileteceğini söyle. Sohbetin akışında, her mesajda en fazla tek soru sorarak şunları da öğren: müşteri adı, dernek ya da şirket adı, ürünlerin ne zamana teslim istendiği. Form gibi sorma.

## Kesin kurallar
- Fiyat, indirim ya da ödeme koşulu söyleme. Rakam ve para birimi yazma.
- Bir ürünün stokta olup olmadığını söyleme ("var", "yok", "mevcut" deme). "Stok ve fiyat bilgisini ekibimiz verecek" de ve ürünü netleştirmeye devam et.
- Bilmediğin ya da aşağıdaki bilgilerde olmayan bir şeyi uydurma. Devret.
- Kısa cümleler kur. Her cevap en fazla 3-4 cümle olsun.

## Devir kuralları
${s.handoff_rules}
Devir gerektiğinde handoff=true yap, handoff_reason alanına kısa sebebi yaz ve reply alanına müşteriye kısa bir "seni yetkiliye aktarıyorum" mesajı yaz.

## Yasaklar
${s.restrictions}

## Sık sorulan sorular
${faqs.length ? faqs.map((f) => `S: ${f.question}\nC: ${f.answer}`).join("\n\n") : "(yok)"}

## Dokümanlar
${textDocs.length ? textDocs.map((d) => `### ${d.name}\n${d.text}`).join("\n\n") : "(yok)"}

## Şu anki durum
${open ? "Şu an mesai içi." : "Şu an mesai dışı. Ekibin mesai saatinde döneceğini belirt, ürün ve lead bilgisini toplamaya devam et. Devir gerekirse handoff=true yap."}

## Çıktı biçimi
Yalnızca şu JSON nesnesini döndür, başka metin yazma:
{
  "reply": "müşteriye gidecek mesaj",
  "intent": "bilgi | urun_talebi | fiyat | sikayet | ariza | sozlesme_odeme | insan_istegi | diger",
  "handoff": false,
  "handoff_reason": null,
  "needs_clarification": false,
  "products_confirmed": false,
  "lead": {
    "customer_name": null,
    "company_name": null,
    "delivery_time": null,
    "products": null
  }
}
lead.products doluysa [{"name":"...","quantity":"...","note":"..."}] biçiminde, sohbet boyunca öğrenilen TÜM ürünleri içersin. Henüz öğrenilmeyen alanlar null kalsın. needs_clarification: müşterinin ne istediği hâlâ net değilse true.`;
}

function normalize(raw: string): BotResult {
  const clean = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const j = JSON.parse(clean);
  const lead = j.lead ?? {};
  return {
    reply: String(j.reply ?? "").trim(),
    intent: String(j.intent ?? "diger"),
    handoff: j.handoff === true,
    handoff_reason: j.handoff_reason ? String(j.handoff_reason) : null,
    needs_clarification: j.needs_clarification === true,
    products_confirmed: j.products_confirmed === true,
    lead: {
      customer_name: lead.customer_name ? String(lead.customer_name) : null,
      company_name: lead.company_name ? String(lead.company_name) : null,
      delivery_time: lead.delivery_time ? String(lead.delivery_time) : null,
      products: Array.isArray(lead.products) && lead.products.length ? lead.products : null,
    },
  };
}

export async function generateReply(settings: Record<string, any>, history: Turn[], open: boolean): Promise<BotResult> {
  const { faqs, docs } = await loadKnowledge();
  const textDocs = docs.filter((d) => d.text_content).map((d) => ({ name: d.name, text: d.text_content as string }));

  // PDF'ler Gemini'ye doğrudan verilir (toplam boyut sınırlı)
  const pdfParts: any[] = [];
  let total = 0;
  const db = createAdmin();
  for (const d of docs.filter((d) => !d.text_content && d.storage_path.endsWith(".pdf"))) {
    if (total + d.size_bytes > MAX_PDF_TOTAL) continue;
    const { data } = await db.storage.from(DOC_BUCKET).download(d.storage_path);
    if (!data) continue;
    total += d.size_bytes;
    pdfParts.push({ text: `Doküman: ${d.name}` });
    pdfParts.push({ inlineData: { mimeType: "application/pdf", data: Buffer.from(await data.arrayBuffer()).toString("base64") } });
  }

  const contents: { role: string; parts: any[] }[] = [];
  if (pdfParts.length) {
    contents.push({ role: "user", parts: [{ text: "Aşağıdaki PDF dokümanları referans bilgidir." }, ...pdfParts] });
    contents.push({ role: "model", parts: [{ text: "Anlaşıldı." }] });
  }
  for (const t of history) {
    const last = contents[contents.length - 1];
    if (last && last.role === t.role) last.parts.push({ text: t.text });
    else contents.push({ role: t.role, parts: [{ text: t.text }] });
  }
  if (contents[0]?.role !== "user") contents.unshift({ role: "user", parts: [{ text: "Merhaba" }] });

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await generate(ai, {
    contents,
    config: {
      systemInstruction: systemInstruction(settings, faqs, textDocs, open),
      responseMimeType: "application/json",
      temperature: 0.3,
    },
  });
  return normalize(res.text ?? "");
}

const MAX_AUDIO_BASE64 = 14 * 1024 * 1024;

/** Sesli mesajı Türkçe metne çevirir. Anlaşılmazsa null. */
export async function transcribeAudio(base64: string, mimetype: string): Promise<string | null> {
  if (base64.length > MAX_AUDIO_BASE64) return null;
  const mime = mimetype.split(";")[0].trim() || "audio/ogg";
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await generate(ai, {
    contents: [{
      role: "user",
      parts: [
        { text: "Bu sesli mesajı Türkçe olarak kelimesi kelimesine yaz. Yalnızca konuşulan metni döndür, yorum ekleme. Anlaşılır bir konuşma yoksa sadece BOŞ yaz." },
        { inlineData: { mimeType: mime, data: base64 } },
      ],
    }],
    config: { temperature: 0 },
  });
  const t = (res.text ?? "").trim();
  return t && t.toUpperCase() !== "BOŞ" ? t : null;
}
