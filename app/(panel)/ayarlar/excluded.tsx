import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

async function addNumbers(formData: FormData) {
  "use server";
  await requireAdmin();
  const note = String(formData.get("note") ?? "").trim() || null;
  // Birden fazla numara: satır, virgül ya da noktalı virgülle ayrılabilir
  const phones = String(formData.get("phones") ?? "")
    .split(/[\n,;]+/).map(normalizePhone).filter((p) => p.length >= 10);
  if (!phones.length) return;
  await createAdmin().from("bot_excluded_numbers").upsert(
    phones.map((phone) => ({ phone, note })),
    { onConflict: "phone", ignoreDuplicates: true }
  );
  revalidatePath("/ayarlar");
}

async function removeNumber(formData: FormData) {
  "use server";
  await requireAdmin();
  await createAdmin().from("bot_excluded_numbers").delete().eq("id", String(formData.get("id")));
  revalidatePath("/ayarlar");
}

export default async function Excluded() {
  const { data: rows } = await createAdmin().from("bot_excluded_numbers").select("*").order("created_at", { ascending: false });
  return (
    <section className="card mt-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Botun cevaplamayacağı numaralar</h2>
        <p className="text-sm text-gray-500">
          Bu numaralardan gelen mesajlar Inbox'ta görünür ama bot cevap vermez, lead açmaz, takip mesajı göndermez ve bildirim göndermez.
          Cevabı panelden elle yazabilirsin.
        </p>
      </div>
      <form action={addNumbers} className="space-y-2">
        <textarea name="phones" rows={2} required className="input" placeholder="0532 123 45 67 (birden fazla numarayı alt alta ya da virgülle yaz)" />
        <div className="flex flex-wrap gap-2">
          <input name="note" className="input !w-64" placeholder="Not (örn. tedarikçi, çalışan)" />
          <button className="btn">Ekle</button>
        </div>
      </form>
      <ul className="divide-y divide-gray-200">
        {(rows ?? []).length === 0 && <li className="py-2 text-sm text-gray-500">Liste boş.</li>}
        {(rows ?? []).map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2 text-sm">
            <span>+{r.phone}{r.note && <span className="ml-2 text-gray-500">{r.note}</span>}</span>
            <form action={removeNumber}>
              <input type="hidden" name="id" value={r.id} />
              <button className="text-red-600 underline">Kaldır</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
