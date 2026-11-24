import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { DAYS, buildHours, hoursForDay, type HoursEntry } from "@/lib/hours";
import { releaseBotOffConversations } from "@/lib/bot-state";
import Documents from "./documents";
import Faqs from "./faqs";
import Excluded from "./excluded";
import TestBot from "./test-bot";

export const dynamic = "force-dynamic";

async function save(formData: FormData) {
  "use server";
  await requireAdmin();
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const { error } = await createAdmin()
    .from("bot_settings")
    .update({
      bot_name: text("bot_name"),
      business_name: text("business_name"),
      business_info: text("business_info"),
      tone: text("tone"),
      language: text("language"),
      working_hours: buildHours(formData),
      after_hours_message: text("after_hours_message"),
      handoff_rules: text("handoff_rules"),
      restrictions: text("restrictions"),
      bot_enabled: formData.get("bot_enabled") === "on",
      waiting_alert_minutes: Math.max(5, Number(text("waiting_alert_minutes")) || 30),
      notify_phones: text("notify_phones"),
      followup_enabled: formData.get("followup_enabled") === "on",
      followup_talep_6: text("followup_talep_6"),
      followup_talep_24: text("followup_talep_24"),
      followup_teklif_6: text("followup_teklif_6"),
      followup_teklif_24: text("followup_teklif_24"),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  if (formData.get("bot_enabled") === "on") await releaseBotOffConversations();
  revalidatePath("/ayarlar");
  revalidatePath("/");
}

function TimeRow({ name, label, value }: { name: string; label: string; value?: HoursEntry }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex w-36 items-center gap-2">
        <input type="checkbox" name={`${name}_open`} defaultChecked={!!value} /> {label}
      </label>
      <input type="time" name={`${name}_start`} defaultValue={value?.start ?? "09:00"} className="input !w-32" />
      <span>-</span>
      <input type="time" name={`${name}_end`} defaultValue={value?.end ?? "18:00"} className="input !w-32" />
    </div>
  );
}

export default async function SettingsPage() {
  await requireAdmin();
  const { data: s } = await createAdmin().from("bot_settings").select("*").eq("id", 1).single();
  if (!s) return <p>Ayar satırı bulunamadı.</p>;
  const hours = s.working_hours as HoursEntry[];

  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Bot ayarları</h1>
      <form action={save} className="card space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="bot_enabled" defaultChecked={s.bot_enabled} /> Bot açık
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="label">Bot adı</label><input name="bot_name" className="input" defaultValue={s.bot_name} /></div>
          <div><label className="label">İşletme adı</label><input name="business_name" className="input" defaultValue={s.business_name} /></div>
          <div><label className="label">Dil</label><input name="language" className="input" defaultValue={s.language} /></div>
        </div>
        <div><label className="label">İşletme bilgisi</label><textarea name="business_info" rows={4} className="input" defaultValue={s.business_info} /></div>
        <div><label className="label">Ton</label><textarea name="tone" rows={3} className="input" defaultValue={s.tone} /></div>
        <div className="space-y-2">
          <label className="label">Çalışma saatleri (işaretsiz gün kapalı)</label>
          {DAYS.map((x) => (
            <TimeRow key={x.d} name={`d${x.d}`} label={x.label} value={hoursForDay(hours, x.d)} />
          ))}
        </div>
        <div><label className="label">Mesai dışı mesajı</label><textarea name="after_hours_message" rows={3} className="input" defaultValue={s.after_hours_message} /></div>
        <div><label className="label">Devir kuralları</label><textarea name="handoff_rules" rows={4} className="input" defaultValue={s.handoff_rules} /></div>
        <div><label className="label">Yasaklar</label><textarea name="restrictions" rows={3} className="input" defaultValue={s.restrictions} /></div>
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold">Bildirimler</h3>
          <div>
            <label className="label">İnsana devredilen konuşmada cevap bekleme uyarısı (dakika)</label>
            <input name="waiting_alert_minutes" type="number" min={5} className="input !w-32" defaultValue={s.waiting_alert_minutes} />
          </div>
          <div>
            <label className="label">Bildirim telefonları (WhatsApp, isteğe bağlı, virgülle: 905xxxxxxxxx)</label>
            <input name="notify_phones" className="input" defaultValue={s.notify_phones} />
            <p className="mt-1 text-xs text-gray-500">Devir, cevap bekleyen konuşma ve bağlantı kopması bu numaralara da yazılır. Boşsa yalnızca uygulama bildirimi gider.</p>
          </div>
        </div>
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="followup_enabled" defaultChecked={s.followup_enabled} /> Otomatik takip açık (6. ve 24. saat)
          </label>
          <p className="text-xs text-gray-500">Yalnızca mesai saatlerinde gönderilir. Müşteri yazarsa sayaç sıfırlanır.</p>
          <div><label className="label">Talep, 6. saat</label><textarea name="followup_talep_6" rows={2} className="input" defaultValue={s.followup_talep_6} /></div>
          <div><label className="label">Talep, 24. saat</label><textarea name="followup_talep_24" rows={2} className="input" defaultValue={s.followup_talep_24} /></div>
          <div><label className="label">Teklif gönderildi, 6. saat</label><textarea name="followup_teklif_6" rows={2} className="input" defaultValue={s.followup_teklif_6} /></div>
          <div><label className="label">Teklif gönderildi, 24. saat</label><textarea name="followup_teklif_24" rows={2} className="input" defaultValue={s.followup_teklif_24} /></div>
        </div>
        <button className="btn">Kaydet</button>
      </form>
      <TestBot />
      <Excluded />
      <Faqs />
      <Documents />
    </main>
  );
}
