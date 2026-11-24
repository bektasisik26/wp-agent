import { NextRequest, NextResponse, after } from "next/server";
import { timingSafeEqual } from "crypto";
import { eventOf, parseWebhook, processIncoming, logError } from "@/lib/whatsapp";
import { applyConnectionState } from "@/lib/monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const want = process.env.WEBHOOK_SECRET ?? "";
  if (!want) return false;
  const a = Buffer.from(req.headers.get("x-webhook-secret") ?? "");
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "geçersiz" }, { status: 400 }); }

  if (eventOf(body) === "connection.update") {
    const state = String(body?.data?.state ?? "");
    after(async () => {
      try { await applyConnectionState(state); } catch (e) { await logError("bağlantı durumu", e); }
    });
    return NextResponse.json({ ok: true });
  }

  const inc = parseWebhook(body);
  if (inc) {
    after(async () => {
      try { await processIncoming(inc); } catch (e) { await logError("webhook", e); }
    });
  }
  return NextResponse.json({ ok: true });
}
