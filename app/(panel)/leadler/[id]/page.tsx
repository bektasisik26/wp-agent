import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccess, requireStaff } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { listStaff } from "@/lib/staff";
import { STATUS_KEYS, STATUS_LABEL } from "@/lib/labels";
import { saveLead } from "../../actions";

export const dynamic = "force-dynamic";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const db = createAdmin();

  const { data: lead } = await db.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead || !canAccess(me, lead.assigned_to)) notFound();

  const [{ data: tags }, { data: chosen }, staff] = await Promise.all([
    db.from("tags").select("*").order("name"),
    db.from("lead_tags").select("tag_id").eq("lead_id", id),
    listStaff(),
  ]);
  const chosenIds = new Set((chosen ?? []).map((r) => r.tag_id));
  const assignable = me.role === "admin" ? staff.filter((s) => !s.banned || s.id === lead.assigned_to) : staff.filter((s) => s.id === me.id);
  const productsText = ((lead.products ?? []) as { name: string; quantity?: string | null; note?: string | null }[])
    .map((p) => `${p.name} | ${p.quantity ?? ""} | ${p.note ?? ""}`).join("\n");

  return (
    <main className="space-y-3">
      <Link href="/leadler" className="text-sm underline">← Leadler</Link>
      <h1 className="text-xl font-semibold">{lead.customer_name || lead.company_name || "Lead"}</h1>

      <form action={saveLead} className="card space-y-4">
        <input type="hidden" name="id" value={id} />
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className="label">Müşteri adı</label><input name="customer_name" className="input" defaultValue={lead.customer_name ?? ""} /></div>
          <div><label className="label">Dernek / şirket</label><input name="company_name" className="input" defaultValue={lead.company_name ?? ""} /></div>
          <div><label className="label">Teslim zamanı</label><input name="delivery_time" className="input" defaultValue={lead.delivery_time ?? ""} /></div>
          <div><label className="label">Telefon</label><div className="input bg-gray-50">{lead.phone ? `+${lead.phone}` : "-"}</div></div>
          <div>
            <label className="label">Durum</label>
            <select name="status" defaultValue={lead.status} className="input">
              {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Satışçı</label>
            <select name="assigned_to" defaultValue={lead.assigned_to ?? ""} className="input">
              <option value="">Atanmamış</option>
              {assignable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Ürünler (her satır: ürün | adet | not)</label>
          <textarea name="products" rows={6} className="input font-mono" defaultValue={productsText} />
          {lead.products_confirmed && <p className="mt-1 text-xs text-green-700">Müşteri listeyi teyit etti.</p>}
        </div>

        <div>
          <label className="label">Etiketler</label>
          <div className="flex flex-wrap gap-3 text-sm">
            {(tags ?? []).map((t) => (
              <label key={t.id} className="flex items-center gap-1">
                <input type="checkbox" name="tag" value={t.id} defaultChecked={chosenIds.has(t.id)} /> {t.name}
              </label>
            ))}
            {(tags ?? []).length === 0 && <span className="text-gray-500">Önce Leadler sayfasından etiket ekle.</span>}
          </div>
        </div>

        <div><label className="label">Not</label><textarea name="notes" rows={3} className="input" defaultValue={lead.notes ?? ""} /></div>

        <div className="flex flex-wrap items-center gap-4">
          <button className="btn">Kaydet</button>
          {lead.conversation_id && <Link href={`/inbox/${lead.conversation_id}`} className="text-sm underline">Konuşmaya git</Link>}
        </div>
      </form>
    </main>
  );
}
