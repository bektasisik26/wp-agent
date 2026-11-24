import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

async function addFaq(formData: FormData) {
  "use server";
  await requireAdmin();
  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!question || !answer) return;
  await createAdmin().from("faqs").insert({ question, answer });
  revalidatePath("/ayarlar");
}

async function deleteFaq(formData: FormData) {
  "use server";
  await requireAdmin();
  await createAdmin().from("faqs").delete().eq("id", String(formData.get("id")));
  revalidatePath("/ayarlar");
}

async function toggleFaq(formData: FormData) {
  "use server";
  await requireAdmin();
  const active = formData.get("active") === "true";
  await createAdmin().from("faqs").update({ active: !active }).eq("id", String(formData.get("id")));
  revalidatePath("/ayarlar");
}

export default async function Faqs() {
  const { data: faqs } = await createAdmin().from("faqs").select("*").order("created_at");
  return (
    <section className="card mt-6 space-y-4">
      <h2 className="text-base font-semibold">Sık sorulan sorular</h2>
      <form action={addFaq} className="space-y-2">
        <input name="question" className="input" placeholder="Soru" required />
        <textarea name="answer" rows={2} className="input" placeholder="Cevap" required />
        <button className="btn">Ekle</button>
      </form>
      <ul className="divide-y divide-gray-200">
        {(faqs ?? []).map((f) => (
          <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
            <div className={f.active ? "" : "text-gray-400 line-through"}>
              <div className="font-medium">{f.question}</div>
              <div>{f.answer}</div>
            </div>
            <div className="flex gap-3">
              <form action={toggleFaq}>
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="active" value={String(f.active)} />
                <button className="underline">{f.active ? "Pasif yap" : "Aktif yap"}</button>
              </form>
              <form action={deleteFaq}>
                <input type="hidden" name="id" value={f.id} />
                <button className="text-red-600 underline">Sil</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
