import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { listStaff } from "@/lib/staff";
import { STATUS_KEYS, STATUS_LABEL, fmtDate } from "@/lib/labels";
import { addLead, createTag, deleteTag } from "../actions";
import TagChip from "@/components/tag-chip";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

export default async function Leads({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const db = createAdmin();

  const [{ data: tags }, staff] = await Promise.all([db.from("tags").select("*").order("name"), listStaff()]);
  const names = new Map(staff.map((s) => [s.id, s.name]));

  let q = db.from("leads").select("*").order("updated_at", { ascending: false }).limit(200);
  if (me.role === "sales") q = q.or(`assigned_to.eq.${me.id},assigned_to.is.null`);
  if (sp.status && STATUS_KEYS.includes(sp.status)) q = q.eq("status", sp.status);
  if (sp.assigned === "me") q = q.eq("assigned_to", me.id);
  else if (sp.assigned === "none") q = q.is("assigned_to", null);
  else if (sp.assigned) q = q.eq("assigned_to", sp.assigned);
  if (sp.q) {
    const t = sp.q.replace(/[,()%]/g, " ").trim();
    if (t) q = q.or(`customer_name.ilike.%${t}%,company_name.ilike.%${t}%,phone.ilike.%${t}%`);
  }
  if (sp.tag) {
    const { data: ids } = await db.from("lead_tags").select("lead_id").eq("tag_id", sp.tag);
    q = q.in("id", (ids ?? []).map((r) => r.lead_id));
  }
  const { data: leads } = await q;

  // Listedeki lead'lerin etiketleri
  const tagMap = new Map<string, { id: string; name: string; color: string }[]>();
  const leadIds = (leads ?? []).map((l) => l.id);
  if (leadIds.length) {
    const { data: lt } = await db.from("lead_tags").select("lead_id,tags(id,name,color)").in("lead_id", leadIds);
    (lt ?? []).forEach((r: any) => {
      if (!r.tags) return;
      tagMap.set(r.lead_id, [...(tagMap.get(r.lead_id) ?? []), r.tags]);
    });
  }

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Leadler</h1>

      <form className="card grid gap-2 md:grid-cols-5">
        <input name="q" defaultValue={sp.q} className="input md:col-span-2" placeholder="Ad, firma ya da telefon ara" />
        <select name="status" defaultValue={sp.status ?? ""} className="input">
          <option value="">Tüm durumlar</option>
          {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
        </select>
        <select name="assigned" defaultValue={sp.assigned ?? ""} className="input">
          <option value="">Tüm satışçılar</option>
          <option value="me">Benim</option>
          <option value="none">Atanmamış</option>
          {me.role === "admin" && staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="tag" defaultValue={sp.tag ?? ""} className="input">
          <option value="">Tüm etiketler</option>
          {(tags ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="btn md:col-span-5">Filtrele</button>
      </form>

      <ul className="card divide-y divide-gray-200 !p-0">
        {(leads ?? []).length === 0 && <li className="p-4 text-sm text-gray-500">Lead yok.</li>}
        {(leads ?? []).map((l) => (
          <li key={l.id}>
            <Link href={`/leadler/${l.id}`} className="block space-y-1 p-3 hover:bg-gray-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">
                  {l.customer_name || "(adsız)"}
                  {l.company_name && <span className="ml-2 font-normal text-gray-600">{l.company_name}</span>}
                </div>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{STATUS_LABEL[l.status]}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                {l.phone && <span>+{l.phone}</span>}
                <span>{l.assigned_to ? `→ ${names.get(l.assigned_to) ?? "?"}` : "atanmamış"}</span>
                <span>{fmtDate(l.updated_at)}</span>
                {(tagMap.get(l.id) ?? []).map((t) => <TagChip key={t.id} name={t.name} color={t.color} />)}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">Elle lead ekle</summary>
        <form action={addLead} className="mt-3 grid gap-2 md:grid-cols-4">
          <input name="customer_name" className="input" placeholder="Müşteri adı" />
          <input name="company_name" className="input" placeholder="Dernek / şirket" />
          <input name="phone" className="input" placeholder="Telefon (905...)" />
          <button className="btn">Ekle</button>
        </form>
      </details>

      <section className="card space-y-3">
        <h2 className="font-semibold">Etiketler</h2>
        <form action={createTag} className="flex flex-wrap items-center gap-2">
          <input name="name" className="input !w-48" placeholder="Etiket adı" required />
          <input name="color" type="color" defaultValue="#2563eb" className="h-9 w-12 rounded border border-gray-300" />
          <button className="btn">Ekle</button>
        </form>
        <div className="flex flex-wrap gap-3">
          {(tags ?? []).map((t) => (
            <span key={t.id} className="flex items-center gap-1">
              <TagChip name={t.name} color={t.color} />
              {me.role === "admin" && (
                <form action={deleteTag}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-xs text-red-600" title="Sil">✕</button>
                </form>
              )}
            </span>
          ))}
          {(tags ?? []).length === 0 && <span className="text-sm text-gray-500">Henüz etiket yok.</span>}
        </div>
      </section>
    </main>
  );
}
