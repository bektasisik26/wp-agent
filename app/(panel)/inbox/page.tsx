import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { listStaff } from "@/lib/staff";
import { fmtDate } from "@/lib/labels";
import AutoRefresh from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "hepsi", label: "Hepsi" },
  { key: "devir", label: "Devir bekleyen" },
  { key: "benim", label: "Benim" },
  { key: "okunmamis", label: "Okunmamış" },
];

export default async function Inbox({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireStaff();
  const f = (await searchParams).f ?? "hepsi";

  let q = createAdmin().from("conversations").select("*").order("last_message_at", { ascending: false }).limit(100);
  if (me.role === "sales") q = q.or(`assigned_to.eq.${me.id},assigned_to.is.null`);
  if (f === "devir") q = q.eq("mode", "human");
  if (f === "benim") q = q.eq("assigned_to", me.id);
  if (f === "okunmamis") q = q.gt("unread_count", 0);
  const [{ data: convs }, staff, { data: exRows }] = await Promise.all([q, listStaff(), createAdmin().from("bot_excluded_numbers").select("phone")]);
  const excluded = new Set((exRows ?? []).map((r) => r.phone));
  const names = new Map(staff.map((s) => [s.id, s.name]));

  return (
    <main className="space-y-4">
      <AutoRefresh seconds={15} />
      <h1 className="text-xl font-semibold">Inbox</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((x) => (
          <Link key={x.key} href={`/inbox?f=${x.key}`}
            className={`rounded-full border px-3 py-1 ${f === x.key ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white"}`}>
            {x.label}
          </Link>
        ))}
      </div>
      <ul className="card divide-y divide-gray-200 !p-0">
        {(convs ?? []).length === 0 && <li className="p-4 text-sm text-gray-500">Konuşma yok.</li>}
        {(convs ?? []).map((c) => (
          <li key={c.id}>
            <Link href={`/inbox/${c.id}`} className="flex items-start justify-between gap-3 p-3 hover:bg-gray-50">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.display_name || c.phone}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${c.mode === "human" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
                    {c.mode === "human" ? "insan" : "bot"}
                  </span>
                  {excluded.has(c.phone) && <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">bot dışı</span>}
                  {c.assigned_to && <span className="text-xs text-gray-500">→ {names.get(c.assigned_to) ?? "?"}</span>}
                </div>
                <div className="truncate text-sm text-gray-500">{c.last_message_preview}</div>
                {c.mode === "human" && c.handoff_reason && <div className="text-xs text-amber-700">{c.handoff_reason}</div>}
              </div>
              <div className="shrink-0 text-right text-xs text-gray-500">
                <div>{fmtDate(c.last_message_at)}</div>
                {c.unread_count > 0 && <span className="mt-1 inline-block rounded-full bg-red-600 px-2 py-0.5 text-white">{c.unread_count}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
