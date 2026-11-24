"use client";
import { useRef, useState, useTransition } from "react";
import { testBot, type TestResult } from "../actions";

type Msg = { role: "user" | "model"; text: string };

export default function TestBot() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(true);
  const [turns, setTurns] = useState(0);
  const [last, setLast] = useState<TestResult | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending || done) return;
    const next: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(next);
    setInput("");
    start(async () => {
      const r = await testBot(next, open, turns);
      setLast(r);
      if (r.error) {
        setMsgs([...next, { role: "model", text: `⚠ ${r.error}` }]);
      } else {
        setMsgs([...next, { role: "model", text: r.reply }]);
        setTurns(r.clarifyTurns);
        if (r.handoff) setDone(true);
      }
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
  }

  function reset() { setMsgs([]); setLast(null); setTurns(0); setDone(false); setInput(""); }

  return (
    <section className="card mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Botu dene</h2>
          <p className="text-sm text-gray-500">Kaydedilmiş ayarlarla çalışır. WhatsApp'a gönderilmez, lead ve konuşma kaydı oluşmaz.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <select value={open ? "ici" : "disi"} onChange={(e) => { setOpen(e.target.value === "ici"); reset(); }} className="input !w-auto">
            <option value="ici">Mesai içi</option>
            <option value="disi">Mesai dışı</option>
          </select>
          <button type="button" onClick={reset} className="underline">Sıfırla</button>
        </div>
      </div>

      <div className="max-h-96 min-h-32 space-y-2 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3">
        {msgs.length === 0 && <p className="text-sm text-gray-400">Bir müşteri mesajı yaz, örn. "Merhaba, 20 torba çimento lazım".</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-white border border-gray-200" : "bg-gray-900 text-white"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {pending && <div className="text-right text-xs text-gray-500">Bot yazıyor...</div>}
        <div ref={endRef} />
      </div>

      {done && last && (
        <div className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          Gerçekte burada konuşma insana devredilir ve bot susar. Sebep: {last.reason ?? "-"}. Yeniden denemek için Sıfırla'ya bas.
        </div>
      )}
      {last?.note && <div className="rounded bg-blue-50 p-2 text-sm text-blue-800">{last.note}</div>}

      <form onSubmit={send} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} className="input" placeholder="Müşteri olarak yaz..." disabled={done} />
        <button className="btn" disabled={pending || done}>Gönder</button>
      </form>

      {last && !last.error && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">Botun anladıkları</summary>
          <div className="mt-2 space-y-1 text-gray-700">
            <div>Niyet: {last.intent}</div>
            <div>Müşteri: {last.lead.customer_name ?? "-"} · Firma: {last.lead.company_name ?? "-"} · Teslim: {last.lead.delivery_time ?? "-"}</div>
            <div>Ürünler: {last.lead.products?.length ? last.lead.products.map((p) => `${p.name}${p.quantity ? ` (${p.quantity})` : ""}`).join(", ") : "-"}</div>
            <div>Liste teyit edildi: {last.products_confirmed ? "evet" : "hayır"} · Devir: {last.handoff ? `evet (${last.reason})` : "hayır"}</div>
          </div>
        </details>
      )}
    </section>
  );
}
