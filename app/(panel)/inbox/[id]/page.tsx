import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccess, requireStaff } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { listStaff } from "@/lib/staff";
import { STATUS_LABEL, fmtDate } from "@/lib/labels";
import { assignConversation, giveBack, sendReply, takeOver, toggleExcluded } from "../../actions";
import AutoRefresh from "@/components/auto-refresh";
import TagChip from "@/components/tag-chip";

export const dynamic = "force-dynamic";

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const db = createAdmin();

  const { data: conv } = await db.from("conversations").select("*").eq("id", id).maybeSingle();
  if (!conv || !canAccess(me, conv.assigned_to)) notFound();
  if (conv.unread_count > 0) await db.from("conversations").update({ unread_count: 0 }).eq("id", id);

  const [{ data: msgs }, { data: lead }, staff] = await Promise.all([
    db.from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true }).limit(300),
    db.from("leads").select("id,status,customer_name,company_name").eq("conversation_id", id).maybeSingle(),
    listStaff(),
  ]);

  // Dosya ve görseller için geçici bağlantılar
  const paths = (msgs ?? []).map((m) => m.media_path).filter(Boolean) as string[];
  const urlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await db.storage.from("whatsapp-media").createSignedUrls(paths, 3600);
    (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl); });
  }

  let tags: { id: string; name: string; color: string }[] = [];
  if (lead) {
    const { data: lt } = await db.from("lead_tags").select("tags(id,name,color)").eq("lead_id", lead.id);
    tags = (lt ?? []).flatMap((r: any) => (r.tags ? [r.tags] : []));
  }

  const { data: exRow } = await db.from("bot_excluded_numbers").select("id").eq("phone", conv.phone).maybeSingle();
  const isExcluded = !!exRow;
  const assignable = me.role === "admin" ? staff.filter((s) => !s.banned) : staff.filter((s) => s.id === me.id);

  return (
    <main className="space-y-3">
      <AutoRefresh seconds={10} />
      <Link href="/inbox" className="text-sm underline">← Inbox</Link>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">{conv.display_name || conv.phone}</div>
            <div className="text-xs text-gray-500">+{conv.phone}</div>
          </div>
          <span className={`rounded px-2 py-1 text-xs ${conv.mode === "human" ? "bg-amber-100 text-amber-800" : "bg-gray-100"}`}>
            {conv.mode === "human" ? "İnsan modunda" : "Bot cevaplıyor"}
          </span>
        </div>
        {conv.handoff_reason && conv.mode === "human" && <div className="text-xs text-amber-700">Devir sebebi: {conv.handoff_reason}</div>}
        {lead && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/leadler/${lead.id}`} className="underline">Lead: {lead.customer_name || lead.company_name || "(adsız)"}</Link>
            <span className="text-xs text-gray-500">{STATUS_LABEL[lead.status]}</span>
            {tags.map((t) => <TagChip key={t.id} name={t.name} color={t.color} />)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <form action={assignConversation} className="flex items-center gap-2 text-sm">
            <input type="hidden" name="id" value={id} />
            <select name="target" defaultValue={conv.assigned_to ?? ""} className="input !w-auto">
              <option value="">Atanmamış</option>
              {assignable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="underline">Ata</button>
          </form>
          {me.role === "admin" && (
            <form action={toggleExcluded}>
              <input type="hidden" name="phone" value={conv.phone} />
              <input type="hidden" name="excluded" value={String(isExcluded)} />
              <button className="text-sm underline">{isExcluded ? "Bot dışı listeden çıkar" : "Bu numarayı bot dışı bırak"}</button>
            </form>
          )}
          {conv.mode === "bot" ? (
            <form action={takeOver}><input type="hidden" name="id" value={id} /><button className="btn">Devral</button></form>
          ) : (
            <form action={giveBack}><input type="hidden" name="id" value={id} /><button className="rounded border border-gray-400 px-3 py-2 text-sm">Bota geri ver</button></form>
          )}
        </div>
      </section>

      <section className="card space-y-2">
        {(msgs ?? []).map((m) => {
          const mine = m.direction === "out";
          const url = m.media_path ? urlByPath.get(m.media_path) : undefined;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-gray-900 text-white" : "bg-gray-100"}`}>
                <div className={`mb-0.5 text-[10px] ${mine ? "text-gray-300" : "text-gray-500"}`}>
                  {m.sender === "customer" ? "Müşteri" : m.sender === "bot" ? (m.is_followup ? "Bot (takip)" : "Bot") : "Ekip"} · {fmtDate(m.created_at)}
                </div>
                {m.media_type === "image" && url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" className="mb-1 max-h-60 rounded" />}
                {m.media_type === "audio" && url && <audio controls src={url} className="mb-1 max-w-full" />}
                {m.media_type && m.media_type !== "image" && m.media_type !== "audio" && (
                  url
                    ? <a href={url} target="_blank" rel="noreferrer" className="underline">📎 {m.media_name || m.media_type}</a>
                    : <span>[{m.media_type}{m.media_name ? `: ${m.media_name}` : ""}]</span>
                )}
                {m.body && <div className="whitespace-pre-wrap">{m.body}</div>}
              </div>
            </div>
          );
        })}
      </section>

      <form action={sendReply} className="card flex gap-2">
        <input type="hidden" name="id" value={id} />
        <textarea name="text" rows={2} required className="input" placeholder="Cevap yaz (gönderince konuşma insan moduna geçer)" />
        <button className="btn">Gönder</button>
      </form>
    </main>
  );
}
