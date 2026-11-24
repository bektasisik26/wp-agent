import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createInstance, evolutionConfigured, getQr, getState, setWebhook } from "@/lib/evolution";
import AutoRefresh from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

async function connect() {
  "use server";
  await requireAdmin();
  await createInstance();
  const w = await setWebhook();
  if (!w.ok) throw new Error(`Webhook kaydedilemedi (${w.status}): ${w.text.slice(0, 200)}`);
  revalidatePath("/kanallar");
}

async function resetWebhook() {
  "use server";
  await requireAdmin();
  const w = await setWebhook();
  if (!w.ok) throw new Error(`Webhook kaydedilemedi (${w.status}): ${w.text.slice(0, 200)}`);
  revalidatePath("/kanallar");
}

export default async function Channels() {
  await requireAdmin();
  const configured = evolutionConfigured() && !!process.env.PUBLIC_APP_URL && !!process.env.WEBHOOK_SECRET;
  const state = configured ? await getState() : "ayarsiz";
  const qr = configured && !["open", "yok", "hata"].includes(state) ? await getQr() : null;

  const label: Record<string, string> = {
    open: "Bağlı", close: "Bağlı değil", connecting: "Bağlanıyor", yok: "Instance oluşturulmamış",
    hata: "Evolution API'ye ulaşılamadı", ayarsiz: "Ortam değişkenleri eksik",
  };

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Kanallar</h1>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">WhatsApp</h2>
          <span className={`rounded-full px-3 py-1 text-xs ${state === "open" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
            {label[state] ?? state}
          </span>
        </div>

        {state === "ayarsiz" && (
          <p className="text-sm text-gray-600">
            .env.local (ya da Vercel ortam değişkenleri) içinde EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, PUBLIC_APP_URL ve WEBHOOK_SECRET tanımlı olmalı.
          </p>
        )}

        {(state === "yok" || state === "close" || state === "connecting") && (
          <form action={connect}>
            <button className="btn">{state === "yok" ? "Instance oluştur ve QR göster" : "Webhook'u kaydet ve QR yenile"}</button>
          </form>
        )}

        {qr && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">WhatsApp → Bağlı cihazlar → Cihaz bağla ile bu QR kodu okut. Sayfa 15 saniyede bir yenilenir.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="WhatsApp QR" className="h-64 w-64 border" />
            <AutoRefresh />
          </div>
        )}

        {state === "open" && (
          <form action={resetWebhook}>
            <button className="underline text-sm">Webhook'u yeniden kaydet</button>
          </form>
        )}

        <p className="text-xs text-gray-500">
          Not: QR ile bağlanan yol WhatsApp Web tabanlıdır, resmî API değildir. Bu iş için ayrı bir numara kullan.
        </p>
      </section>

      <section className="card text-sm text-gray-500">Instagram: yakında.</section>
    </main>
  );
}
