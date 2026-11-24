import { createAdmin } from "@/lib/supabase/admin";
import BotToggle from "@/components/bot-toggle";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

function startOfTodayIstanbul() {
  // İstanbul sabit UTC+3
  const ist = new Date(Date.now() + 3 * 3600e3);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 3 * 3600e3).toISOString();
}

export default async function Home() {
  const me = await requireStaff();
  const db = createAdmin();
  const since = startOfTodayIstanbul();

  const [msgs, leads, handoff, total] = await Promise.all([
    db.from("messages").select("id", { count: "exact", head: true }).eq("direction", "in").gte("created_at", since),
    db.from("leads").select("id", { count: "exact", head: true }).gte("created_at", since),
    db.from("conversations").select("id", { count: "exact", head: true }).eq("mode", "human"),
    db.from("conversations").select("id", { count: "exact", head: true }),
  ]);

  const totalConv = total.count ?? 0;
  const humanConv = handoff.count ?? 0;
  const botRate = totalConv ? Math.round(((totalConv - humanConv) / totalConv) * 100) : 0;

  const cards = [
    { label: "Bugün gelen mesaj", value: msgs.count ?? 0 },
    { label: "Bugün açılan lead", value: leads.count ?? 0 },
    { label: "Bekleyen devir", value: humanConv },
    { label: "Botun tek başına kapattığı", value: `%${botRate}` },
  ];

  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Özet</h1>
      {me.role === "admin" && <BotToggle />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div className="text-2xl font-semibold">{c.value}</div>
            <div className="mt-1 text-xs text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
