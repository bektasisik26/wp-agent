import "server-only";

const base = () => (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "");
const inst = () => encodeURIComponent(process.env.EVOLUTION_INSTANCE ?? "");

type Res = { ok: boolean; status: number; json: any; text: string };

async function evo(path: string, init: RequestInit = {}): Promise<Res> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { apikey: process.env.EVOLUTION_API_KEY ?? "", "Content-Type": "application/json" },
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
  return { ok: res.ok, status: res.status, json, text };
}

export function evolutionConfigured() {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE);
}

/** 'open' bağlı demek. 'yok' instance henüz oluşturulmamış, 'hata' API'ye ulaşılamadı. */
export async function getState(): Promise<string> {
  try {
    const r = await evo(`/instance/connectionState/${inst()}`);
    if (r.status === 404) return "yok";
    if (!r.ok) return "hata";
    return String(r.json?.instance?.state ?? r.json?.state ?? "hata");
  } catch {
    return "hata";
  }
}

export async function createInstance() {
  const r = await evo("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: process.env.EVOLUTION_INSTANCE,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    }),
  });
  // Zaten varsa hata dönebilir; sorun değil.
  return r;
}

export async function getQr(): Promise<string | null> {
  try {
    const r = await evo(`/instance/connect/${inst()}`);
    const b64: string | undefined = r.json?.base64;
    if (!b64) return null;
    return b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}

export async function setWebhook() {
  const url = `${(process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "")}/api/whatsapp/webhook`;
  const body = JSON.stringify({
    webhook: {
      enabled: true,
      url,
      headers: { "Content-Type": "application/json", "x-webhook-secret": process.env.WEBHOOK_SECRET ?? "" },
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      byEvents: false,
      base64: false,
    },
  });
  // Sürüme göre yol değişebiliyor: önce /webhook/set, 404 ise /event/webhook/set
  let r = await evo(`/webhook/set/${inst()}`, { method: "POST", body });
  if (r.status === 404) r = await evo(`/event/webhook/set/${inst()}`, { method: "POST", body });
  return { ...r, url };
}

/** Gönderilen mesajın WhatsApp kimliğini döndürür (bulunamazsa null). */
export async function sendText(number: string, text: string): Promise<string | null> {
  const r = await evo(`/message/sendText/${inst()}`, { method: "POST", body: JSON.stringify({ number, text }) });
  if (!r.ok) throw new Error(`sendText ${r.status}: ${r.text.slice(0, 300)}`);
  const id = r.json?.key?.id ?? r.json?.data?.key?.id ?? null;
  return id ? String(id) : null;
}

export async function getMediaBase64(messageId: string) {
  try {
    const r = await evo(`/chat/getBase64FromMediaMessage/${inst()}`, {
      method: "POST",
      body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
    });
    if (!r.ok || !r.json?.base64) return null;
    return {
      base64: String(r.json.base64).replace(/^data:[^;]+;base64,/, ""),
      mimetype: String(r.json.mimetype ?? "application/octet-stream"),
      fileName: r.json.fileName ? String(r.json.fileName) : null,
    };
  } catch {
    return null;
  }
}
